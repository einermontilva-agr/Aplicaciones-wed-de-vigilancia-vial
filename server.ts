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

async function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('503 UNAVAILABLE: Tiempo de espera agotado')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generarConRespaldo<T>(
  fn: (modelo: string) => Promise<T>
): Promise<T> {
  const modelos = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let ultimoError: unknown;

  for (const modelo of modelos) {
    for (let intento = 0; intento < 2; intento += 1) {
      try {
        return await conTimeout(fn(modelo), 7500);
      } catch (err) {
        ultimoError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const esCuotaDiaria = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
        const esTemporal503 = msg.includes('503') || msg.includes('UNAVAILABLE');

        if (esCuotaDiaria) {
          break; // Pasar al modelo de respaldo sin esperar
        }
        if (esTemporal503 && intento === 0) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          continue;
        }
        if (!esTemporal503) {
          throw err;
        }
      }
    }
  }
  throw ultimoError;
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
      const response = await generarConRespaldo((modelo) =>
        ai.models.generateContent({
          model: modelo,
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
            ...(modelo === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
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
        })
      );

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

    if (categoria !== undefined && (typeof categoria !== 'string' || !ALLOWED_CATEGORIAS.has(categoria))) {
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

    try {
      const response = await generarConRespaldo((modelo) =>
        ai.models.generateContent({
          model: modelo,
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
                  `Analiza esta fotografía de calle o espacio público para verificar si aparece al menos un vehículo.\n\n` +
                  `INSTRUCCIÓN CRÍTICA: NO rechaces imágenes borrosas, desenfocadas, movidas, oscuras, pixeladas, con reflejos o de baja resolución. Tampoco importa si el vehículo está lejos, parcial, cortado, de espaldas, de lado o estacionado junto a un andén.\n\n` +
                  `Pasos obligatorios:\n` +
                  `1. En "objetosVisibles", enumera TODOS los elementos reales que ves (ej: "automóvil gris", "motocicleta roja", "camión de carga", "taxi amarillo", "bus", "llanta", "calle", "andén", "gato", etc.).\n` +
                  `2. En "hayAlgunVehiculoVisible": responde true si aparece o se distingue CUALQUIER vehículo o parte de un vehículo (carro, automóvil, taxi, camioneta, bus, buseta, camión, furgón, motocicleta, motocarro, bicicleta, llantas, placa o faros). Ante cualquier duda razonable, responde true.\n` +
                  `3. En "esFotoSinVehiculosNiCalle": responde true ÚNICAMENTE si estás 100% seguro de que la foto NO tiene vehículos (por ejemplo: solo una mascota/gato, comida, retrato en interiores o texto).\n` +
                  `4. Si hayAlgunVehiculoVisible=false y esFotoSinVehiculosNiCalle=true, escribe en "motivoRechazo" un mensaje breve en español indicando que no se observan vehículos en la fotografía.\n` +
                  `5. Si hay vehículo visible, deja "motivoRechazo" vacío ("") y escribe en "resumen" una descripción genérica breve en español (máx. 15 palabras), SIN transcribir placas ni identificar personas.`,
              },
            ],
          },
          config: {
            ...(modelo === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                objetosVisibles: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                resumen: { type: Type.STRING },
                hayAlgunVehiculoVisible: { type: Type.BOOLEAN },
                esFotoSinVehiculosNiCalle: { type: Type.BOOLEAN },
                motivoRechazo: { type: Type.STRING },
              },
              required: [
                'objetosVisibles',
                'resumen',
                'hayAlgunVehiculoVisible',
                'esFotoSinVehiculosNiCalle',
                'motivoRechazo',
              ],
            },
          },
        })
      );

      const texto = (response.text ?? '').trim();
      if (!texto) {
        res.status(503).json({
          servicioNoDisponible: true,
          error: 'La verificación IA devolvió una respuesta vacía temporal.',
        });
        return;
      }

      const parsed = JSON.parse(texto) as Record<string, unknown>;
      if (typeof parsed.hayAlgunVehiculoVisible !== 'boolean') {
        res.status(503).json({
          servicioNoDisponible: true,
          error: 'No se recibió confirmación booleana de la verificación IA.',
        });
        return;
      }

      const objetos = Array.isArray(parsed.objetosVisibles)
        ? parsed.objetosVisibles.filter((x): x is string => typeof x === 'string')
        : [];
      const resumenRaw = typeof parsed.resumen === 'string' ? parsed.resumen.trim() : '';
      const textoCombinado = `${objetos.join(' ')} ${resumenRaw}`.toLowerCase();
      const mencionaVehiculo =
        /\b(veh[ií]culo|carro|auto|autom[oó]vil|automotor|camioneta|campero|cami[oó]n|furg[oó]n|furgoneta|tractomula|volqueta|taxi|bus|buseta|buset[oó]n|microb[uú]s|colectivo|transporte|moto|motocicleta|mototaxi|motocarro|scooter|cuatrimoto|bicicleta|triciclo|sedan|suv|pickup|hatchback|truck|van|car|motorcycle|motorbike|bike|bicycle|vehicle|llanta|neum[aá]tico|rin|rueda|parabrisas|retrovisor|faro|farola|b[oó]mper|defensa|cap[oó]|carrocer[ií]a|cabina|remolque|plat[oó]n|parqueado|estacionado|doble fila|conductor|motociclista|wheel|tire|headlight|windshield)\b/i.test(
          textoCombinado
        );

      const hayVehiculos =
        parsed.hayAlgunVehiculoVisible === true ||
        parsed.esFotoSinVehiculosNiCalle === false ||
        mencionaVehiculo;
      const valida = hayVehiculos;

      let motivoRechazo =
        typeof parsed.motivoRechazo === 'string' ? parsed.motivoRechazo.trim() : '';

      if (!valida && !motivoRechazo) {
        motivoRechazo =
          'No se observan vehículos incluidos en la imagen. Para publicar el reporte con fotografía, debe aparecer al menos un vehículo.';
      }

      const resumen =
        resumenRaw
          ? resumenRaw
          : valida
            ? 'Fotografía aceptada: presencia de vehículo verificada.'
            : '';

      res.json({
        valida,
        muyBorrosa: false,
        iluminacionInsuficiente: false,
        imagenBlancaONegra: false,
        observaIncidente: hayVehiculos,
        correspondeCategoria: hayVehiculos,
        posibleFalsaOCaptura: false,
        motivoRechazo: valida ? '' : motivoRechazo,
        resumen,
      });
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'Error al validar la fotografía con IA.';
      const esTemporal =
        mensaje.includes('503') ||
        mensaje.includes('UNAVAILABLE') ||
        mensaje.includes('429') ||
        mensaje.includes('RESOURCE_EXHAUSTED');
      res.status(esTemporal ? 503 : 502).json({
        servicioNoDisponible: true,
        error: 'El servicio de verificación IA está experimentando alta demanda temporal.',
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
    app.use('/fotos', express.static(path.resolve(__dirname, 'public', 'fotos')));
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
