import { CuadraVia, Reporte, ZonaPrivacidad } from '../types';

const STORAGE_KEY_LOCAL = 'vigia_santa_marta_reportes_locales_v3_29h3_vm';

/**
 * Calcula la distancia aproximada en metros entre dos coordenadas (Haversine).
 */
export function distanciaMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Encuentra la cuadra de Santa Marta más cercana a unas coordenadas dadas.
 */
export function encontrarCuadraMasCercana(
  lat: number,
  lng: number,
  vias: CuadraVia[]
): { cuadra: CuadraVia | null; distancia: number } {
  let mejor: CuadraVia | null = null;
  let menorDistancia = Number.POSITIVE_INFINITY;

  for (const via of vias) {
    const dist = distanciaMetros(lat, lng, via.lat, via.lng);
    if (dist < menorDistancia) {
      menorDistancia = dist;
      mejor = via;
    }
  }

  return { cuadra: mejor, distancia: Math.round(menorDistancia) };
}

/**
 * Redimensiona una fotografía a un máximo de 800 px de ancho manteniendo su nitidez
 * original (sin desenfoque ni pixelación) para respetar el límite de localStorage.
 */
export function procesarYAnonimizarFoto(
  archivo: File,
  _tamanoBloquePixel = 0,
  anchoMaximo = 800
): Promise<{ dataUrl: string; width: number; height: number; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      img.onload = () => {
        const escala = img.width > anchoMaximo ? anchoMaximo / img.width : 1;
        const anchoFinal = Math.max(1, Math.round(img.width * escala));
        const altoFinal = Math.max(1, Math.round(img.height * escala));

        const canvas = document.createElement('canvas');
        canvas.width = anchoFinal;
        canvas.height = altoFinal;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el lienzo de imagen.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, anchoFinal, altoFinal);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
        const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);

        resolve({
          dataUrl,
          width: anchoFinal,
          height: altoFinal,
          sizeKB,
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(archivo);
  });
}

/**
 * Envía la fotografía redimensionada al servidor para detectar automáticamente
 * coordenadas de rostros humanos y placas vehiculares.
 */
export async function detectarZonasPrivacidad(
  dataUrl: string
): Promise<{ zonas: ZonaPrivacidad[]; error?: string }> {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return {
      zonas: [],
      error: 'Formato de imagen no compatible para detección automática.',
    };
  }

  const [, mimeType, imagenBase64] = match;

  try {
    const resp = await fetch('/api/detectar-privacidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagenBase64, mimeType }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        zonas: [],
        error:
          typeof data?.error === 'string'
            ? data.error
            : 'No se pudo ejecutar la detección automática en el servidor.',
      };
    }

    const zonas = Array.isArray(data?.zonas) ? (data.zonas as ZonaPrivacidad[]) : [];
    return { zonas };
  } catch {
    return {
      zonas: [],
      error: 'Sin conexión con el servicio de detección automática. Puedes marcar zonas manualmente.',
    };
  }
}

/**
 * Aplica pixelación irreversible únicamente dentro de las cajas delimitadoras de
 * rostros y placas detectadas, manteniendo nítido el resto de la fotografía.
 */
export function aplicarPixelacionEnZonas(
  dataUrlOriginal: string,
  zonas: ZonaPrivacidad[],
  tamanoBloque = 11
): Promise<{ dataUrl: string; width: number; height: number; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('No se pudo procesar la imagen para pixelación.'));
    img.onload = () => {
      const width = img.width;
      const height = img.height;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo inicializar el lienzo de pixelación.'));
        return;
      }

      // Dibujar la imagen base completamente nítida
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Pixelar exclusivamente cada rostro y placa detectada
      for (const z of zonas) {
        const margenFactor = z.origen === 'ia' ? 0.06 : 0;
        const anchoNorm = z.xmax - z.xmin;
        const altoNorm = z.ymax - z.ymin;

        const xmin = Math.max(0, z.xmin - anchoNorm * margenFactor);
        const xmax = Math.min(1000, z.xmax + anchoNorm * margenFactor);
        const ymin = Math.max(0, z.ymin - altoNorm * margenFactor);
        const ymax = Math.min(1000, z.ymax + altoNorm * margenFactor);

        const px = Math.floor((xmin / 1000) * width);
        const py = Math.floor((ymin / 1000) * height);
        const pw = Math.max(4, Math.ceil(((xmax - xmin) / 1000) * width));
        const ph = Math.max(4, Math.ceil(((ymax - ymin) / 1000) * height));

        const paso = Math.max(6, Math.min(20, tamanoBloque));
        const cols = Math.max(3, Math.round(pw / paso));
        const rows = Math.max(2, Math.round(ph / paso));

        const temp = document.createElement('canvas');
        temp.width = cols;
        temp.height = rows;
        const tempCtx = temp.getContext('2d');
        if (!tempCtx) continue;

        tempCtx.drawImage(img, px, py, pw, ph, 0, 0, cols, rows);

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(temp, 0, 0, cols, rows, px, py, pw, ph);
        ctx.restore();
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);

      resolve({
        dataUrl,
        width,
        height,
        sizeKB,
      });
    };
    img.src = dataUrlOriginal;
  });
}

/**
 * Lee los reportes nuevos/importados guardados en localStorage.
 */
export function cargarReportesLocales(): Reporte[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LOCAL);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Guarda los reportes locales/importados en localStorage.
 */
export function guardarReportesLocales(reportes: Reporte[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY_LOCAL, JSON.stringify(reportes));
    return true;
  } catch {
    return false;
  }
}

/**
 * Limpia únicamente los reportes guardados en localStorage.
 */
export function limpiarReportesLocales(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY_LOCAL);
  } catch {
    // Ignorar error de almacenamiento
  }
}

/**
 * Calcula cuántos KB están ocupados en localStorage por los reportes del navegador.
 */
export function calcularUsoAlmacenamientoKB(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_LOCAL) ?? '';
    return Math.round((raw.length * 2) / 1024);
  } catch {
    return 0;
  }
}

/**
 * Une reportes base e importados/locales sin duplicar por ID (RF-06).
 */
export function combinarSinDuplicados(
  existentes: Reporte[],
  entrantes: Reporte[]
): { combinados: Reporte[]; agregados: Reporte[]; duplicados: number } {
  const idsExistentes = new Set(existentes.map((r) => r.id));
  const agregados: Reporte[] = [];
  let duplicados = 0;

  for (const item of entrantes) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
    if (idsExistentes.has(item.id)) {
      duplicados += 1;
    } else {
      idsExistentes.add(item.id);
      agrupadoValido(item) && agregados.push(item);
    }
  }

  return {
    combinados: [...existentes, ...agregados],
    agregados,
    duplicados,
  };
}

function agrupadoValido(item: Reporte): boolean {
  return (
    typeof item.lat === 'number' &&
    typeof item.lng === 'number' &&
    typeof item.cuadra === 'string' &&
    typeof item.categoria === 'string' &&
    typeof item.actor === 'string' &&
    typeof item.fecha_hora === 'string'
  );
}

/**
 * Genera el identificador secuencial siguiente para un reporte ciudadano nuevo.
 */
export function generarNuevoIdReporte(todos: Reporte[]): string {
  let maxNum = 32;
  for (const r of todos) {
    const match = /^MP-(\d+)$/i.exec(r.id);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  return `MP-${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * Descarga la lista de reportes como archivo JSON (RF-06).
 */
export function descargarReportesJSON(reportes: Reporte[], nombreArchivo: string): void {
  const blob = new Blob([JSON.stringify(reportes, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
