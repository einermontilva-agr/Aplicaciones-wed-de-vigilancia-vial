import { CuadraVia, Reporte } from '../types';

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

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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
