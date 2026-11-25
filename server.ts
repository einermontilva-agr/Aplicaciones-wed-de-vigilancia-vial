import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BASE64_LENGTH = 5_000_000;

interface ZonaDetectadaRaw {
  tipo?: unknown;
  ymin?: unknown;
  xmin?: unknown;
  ymax?: unknown;
  xmax?: unknown;
}

function normalizarZonas(raw: unknown): Array<{
  id: string;
  tipo: 'rostro' | 'placa';
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  origen: 'ia';
}> {
  if (!Array.isArray(raw)) return [];
  const resultado: Array<{
    id: string;
    tipo: 'rostro' | 'placa';
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
    origen: 'ia';
  }> = [];

  raw.forEach((item, index) => {
    const z = item as ZonaDetectadaRaw;
    const tipo = z.tipo === 'rostro' || z.tipo === 'placa' ? z.tipo : null;
    const ymin = typeof z.ymin === 'number' ? Math.max(0, Math.min(1000, Math.round(z.ymin))) : NaN;
    const xmin = typeof z.xmin === 'number' ? Math.max(0, Math.min(1000, Math.round(z.xmin))) : NaN;
    const ymax = typeof z.ymax === 'number' ? Math.max(0, Math.min(1000, Math.round(z.ymax))) : NaN;
    const xmax = typeof z.xmax === 'number' ? Math.max(0, Math.min(1000, Math.round(z.xmax))) : NaN;

    if (
      tipo &&
      !Number.isNaN(ymin) &&
      !Number.isNaN(xmin) &&
      !Number.isNaN(ymax) &&
      !Number.isNaN(xmax) &&
      ymax > ymin + 4 &&
      xmax > xmin + 4
    ) {
      resultado.push({
        id: `ia-${index}-${Date.now()}`,
        tipo,
        ymin,
        xmin,
        ymax,
        xmax,
        origen: 'ia',
      });
    }
  });

  return resultado;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.post('/api/detectar-privacidad', async (req, res) => {
    const { imagenBase64, mimeType } = req.body ?? {};

    if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(mimeType)) {
      res.status(400).json({
        error: 'Tipo de imagen no compatible. Usa JPEG, PNG o WebP.',
      });
      return;
    }

    if (
      typeof imagenBase64 !== 'string' ||
      imagenBase64.length < 20 ||
      imagenBase64.length > MAX_BASE64_LENGTH
    ) {
      res.status(400).json({
        error: 'La imagen enviada no es válida o excede el tamaño máximo permitido.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: 'Falta configurar GEMINI_API_KEY en el servidor para la detección automática.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imagenBase64,
              },
            },
            {
              text:
                'Analiza esta fotografía de evidencia vial urbana. Detecta todas las cajas delimitadoras [ymin, xmin, ymax, xmax] en escala normalizada de 0 a 1000 para: ' +
                '(1) cada rostro humano visible ("rostro"), incluidos peatones, conductores, vendedores o motociclistas con rostro visible; y ' +
                '(2) cada placa de matrícula de automóvil, taxi, camioneta, bus o motocicleta ("placa"), incluso si está inclinada o parcial. ' +
                'No incluyas avisos comerciales ni señales de tránsito como placas. Si no hay rostros ni placas visibles, devuelve [].',
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tipo: {
                  type: Type.STRING,
                  description: 'Tipo de elemento sensible: exactamente "rostro" o "placa".',
                },
                ymin: {
                  type: Type.INTEGER,
                  description: 'Coordenada vertical superior de 0 a 1000.',
                },
                xmin: {
                  type: Type.INTEGER,
                  description: 'Coordenada horizontal izquierda de 0 a 1000.',
                },
                ymax: {
                  type: Type.INTEGER,
                  description: 'Coordenada vertical inferior de 0 a 1000.',
                },
                xmax: {
                  type: Type.INTEGER,
                  description: 'Coordenada horizontal derecha de 0 a 1000.',
                },
              },
              required: ['tipo', 'ymin', 'xmin', 'ymax', 'xmax'],
            },
          },
        },
      });

      const texto = (response.text ?? '[]').trim();
      const parsed = JSON.parse(texto);
      const zonas = normalizarZonas(parsed);

      res.json({ zonas });
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'Error al analizar la imagen en el servidor.';
      res.status(502).json({
        error: `No se pudo completar la detección automática de rostros y placas: ${mensaje}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vigía Vial Santa Marta escuchando en http://0.0.0.0:${PORT}`);
  });
}

startServer();
