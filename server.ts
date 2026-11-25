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
const ALLOWED_CATEGORIAS = new Set([
  'doble_fila',
  'bloqueo_rampa_cebra_paradero',
  'invasion_anden',
]);
const MAX_BASE64_LENGTH = 5_000_000;

const DESCRIPCION_CATEGORIA_IA: Record<string, string> = {
  doble_fila:
    'Estacionamiento en vía prohibida o doble fila (automóvil, moto, camioneta o camión detenido en la calzada o borde prohibido reduciendo el carril vehicular).',
  bloqueo_rampa_cebra_paradero:
    'Bloqueo de rampa peatonal, paso de cebra o paradero de transporte público (vehículo o elemento obstruyendo el cruce peatonal o acceso).',
  invasion_anden:
    'Invasión de andén o acera peatonal por mobiliario comercial, puestos de venta, mercancía, cajas o motocicletas estacionadas sobre el andén.',
};

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

function crearClienteGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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

    const ai = crearClienteGenAI();
    if (!ai) {
      res.status(500).json({
        error: 'Falta configurar GEMINI_API_KEY en el servidor para la detección automática.',
      });
      return;
    }

    try {
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

  app.post('/api/validar-evidencia', async (req, res) => {
    const { imagenBase64, mimeType, categoria } = req.body ?? {};

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

    if (typeof categoria !== 'string' || !ALLOWED_CATEGORIAS.has(categoria)) {
      res.status(400).json({
        error: 'Categoría de reporte no válida para validación.',
      });
      return;
    }

    const ai = crearClienteGenAI();
    if (!ai) {
      res.status(500).json({
        error: 'Falta configurar GEMINI_API_KEY en el servidor para validar la fotografía.',
      });
      return;
    }

    const descCategoria = DESCRIPCION_CATEGORIA_IA[categoria] ?? categoria;

    try {
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
                `Eres un inspector estricto de calidad y autenticidad fotográfica para reportes ciudadanos de movilidad y espacio público.\n` +
                `Categoría seleccionada por el usuario: "${categoria}" -> ${descCategoria}\n\n` +
                `Evalúa la fotografía adjunta verificando OBLIGATORIAMENTE cada criterio:\n` +
                `1. muyBorrosa: true si está demasiado borrosa, movida o desenfocada e impide distinguir el incidente.\n` +
                `2. iluminacionInsuficiente: true si está muy oscura, subexpuesta o sobreexpuesta y no se distingue la escena.\n` +
                `3. imagenBlancaONegra: true si la imagen es completamente negra, completamente blanca, de un solo color o de calidad extremadamente baja/pixelada/corrupta.\n` +
                `4. observaIncidente: true SOLO si se observa claramente una vía pública, andén, vehículo, motocicleta, comercio o situación real de tránsito/espacio público con un incidente reportado. false si es un objeto cualquiera, interior de una casa, selfie, mascota, comida o foto sin relación.\n` +
                `5. correspondeCategoria: true SOLO si lo observado en la foto coincide razonablemente con la categoría seleccionada ("${categoria}"). Si el usuario seleccionó invasión de andén pero la foto muestra solo un carro en doble fila o algo sin relación, marca false.\n` +
                `6. posibleFalsaOCaptura: true si parece una captura de pantalla (UI de celular, barras de estado, botones, mapas), fotografía tomada a una pantalla/monitor, imagen descargada de internet con marcas de agua o textos promocionales, o imagen generada artificialmente / ilustrada que no representa una fotografía real de calle.\n\n` +
                `Regla para "valida": debe ser true ÚNICAMENTE cuando muyBorrosa=false, iluminacionInsuficiente=false, imagenBlancaONegra=false, observaIncidente=true, correspondeCategoria=true y posibleFalsaOCaptura=false.\n` +
                `Si valida=false, escribe en "motivoRechazo" un mensaje claro y directo en español explicando exactamente por qué fue rechazada y pidiendo al usuario tomar una nueva fotografía real del incidente.\n` +
                `Si valida=true, deja "motivoRechazo" vacío y escribe en "resumen" una descripción breve en español (máx. 18 palabras) de lo que se observa.`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              valida: { type: Type.BOOLEAN },
              muyBorrosa: { type: Type.BOOLEAN },
              iluminacionInsuficiente: { type: Type.BOOLEAN },
              imagenBlancaONegra: { type: Type.BOOLEAN },
              observaIncidente: { type: Type.BOOLEAN },
              correspondeCategoria: { type: Type.BOOLEAN },
              posibleFalsaOCaptura: { type: Type.BOOLEAN },
              motivoRechazo: { type: Type.STRING },
              resumen: { type: Type.STRING },
            },
            required: [
              'valida',
              'muyBorrosa',
              'iluminacionInsuficiente',
              'imagenBlancaONegra',
              'observaIncidente',
              'correspondeCategoria',
              'posibleFalsaOCaptura',
              'motivoRechazo',
              'resumen',
            ],
          },
        },
      });

      const texto = (response.text ?? '{}').trim();
      const parsed = JSON.parse(texto) as Record<string, unknown>;

      const muyBorrosa = Boolean(parsed.muyBorrosa);
      const iluminacionInsuficiente = Boolean(parsed.iluminacionInsuficiente);
      const imagenBlancaONegra = Boolean(parsed.imagenBlancaONegra);
      const observaIncidente = Boolean(parsed.observaIncidente);
      const correspondeCategoria = Boolean(parsed.correspondeCategoria);
      const posibleFalsaOCaptura = Boolean(parsed.posibleFalsaOCaptura);

      const valida =
        Boolean(parsed.valida) &&
        !muyBorrosa &&
        !iluminacionInsuficiente &&
        !imagenBlancaONegra &&
        observaIncidente &&
        correspondeCategoria &&
        !posibleFalsaOCaptura;

      let motivoRechazo =
        typeof parsed.motivoRechazo === 'string' ? parsed.motivoRechazo.trim() : '';

      if (!valida && !motivoRechazo) {
        const razones: string[] = [];
        if (imagenBlancaONegra) razones.push('la imagen es completamente negra, blanca o de muy baja calidad');
        if (muyBorrosa) razones.push('la fotografía está demasiado borrosa');
        if (iluminacionInsuficiente) razones.push('no hay suficiente iluminación para distinguir la escena');
        if (posibleFalsaOCaptura) razones.push('parece una captura de pantalla, imagen descargada o generada artificialmente');
        if (!observaIncidente) razones.push('no se observa un incidente vial o de espacio público real');
        if (observaIncidente && !correspondeCategoria) razones.push('la escena no corresponde con la categoría seleccionada');
        motivoRechazo = `Fotografía rechazada porque ${razones.join(', ')}. Por favor, toma una nueva fotografía nítida y real del incidente.`;
      }

      const resumen =
        typeof parsed.resumen === 'string' && parsed.resumen.trim()
          ? parsed.resumen.trim()
          : valida
            ? 'Evidencia válida acorde con la categoría seleccionada.'
            : '';

      res.json({
        valida,
        muyBorrosa,
        iluminacionInsuficiente,
        imagenBlancaONegra,
        observaIncidente,
        correspondeCategoria,
        posibleFalsaOCaptura,
        motivoRechazo: valida ? '' : motivoRechazo,
        resumen,
      });
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'Error al validar la fotografía con IA.';
      res.status(502).json({
        error: `No se pudo completar la validación inteligente de la fotografía: ${mensaje}`,
      });
    }
  });

  app.get('/api/buscar-direccion', async (req, res) => {
    const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (qRaw.length < 2 || qRaw.length > 120) {
      res.status(400).json({ error: 'Ingresa entre 2 y 120 caracteres para buscar.' });
      return;
    }

    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      const consulta = qRaw.toLowerCase().includes('santa marta')
        ? qRaw
        : `${qRaw}, Santa Marta, Magdalena, Colombia`;

      url.searchParams.set('q', consulta);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '6');
      url.searchParams.set('countrycodes', 'co');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'VigiaVialSantaMarta/1.0 (civic-mobility-app)',
          'Accept-Language': 'es',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        res.json({ resultados: [] });
        return;
      }

      const data = (await resp.json()) as Array<{
        place_id?: number;
        display_name?: string;
        name?: string;
        lat?: string;
        lon?: string;
        type?: string;
        class?: string;
      }>;

      const resultados = Array.isArray(data)
        ? data
            .map((item, idx) => {
              const lat = Number.parseFloat(item.lat ?? '');
              const lng = Number.parseFloat(item.lon ?? '');
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              const nombre = (item.name || item.display_name?.split(',')[0] || qRaw).trim();
              const detalle = (item.display_name || 'Santa Marta, Magdalena')
                .split(',')
                .slice(0, 3)
                .join(', ')
                .trim();
              const tipo =
                item.class === 'place' && (item.type === 'neighbourhood' || item.type === 'suburb')
                  ? 'barrio'
                  : item.class === 'amenity' || item.class === 'shop' || item.class === 'tourism'
                    ? 'lugar'
                    : 'direccion';
              return {
                id: `osm-${item.place_id ?? idx}`,
                nombre,
                detalle,
                lat: Number(lat.toFixed(6)),
                lng: Number(lng.toFixed(6)),
                tipo,
                zoom: 17,
              };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        : [];

      res.json({ resultados });
    } catch {
      res.json({ resultados: [] });
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
