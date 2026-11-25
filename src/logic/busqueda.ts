import { CuadraVia, ResultadoBusquedaUbicacion } from '../types';

const REFERENCIAS_SANTA_MARTA: Omit<ResultadoBusquedaUbicacion, 'id'>[] = [
  {
    nombre: 'Calle 29H3 con Carrera 21C2',
    detalle: 'Sector Calle 29H3 · Entorno Universidad del Magdalena, Santa Marta',
    lat: 11.22462,
    lng: -74.19122,
    tipo: 'direccion',
    zoom: 17,
  },
  {
    nombre: 'Universidad del Magdalena (Entrada Principal)',
    detalle: 'Carrera 32 # 22-08 · Sector San Pedro Alejandrino, Santa Marta',
    lat: 11.2259,
    lng: -74.1872,
    tipo: 'lugar',
    zoom: 16,
  },
  {
    nombre: 'Barrio Villa Marbella',
    detalle: 'Zona residencial y parque · Junto a Calle 29H3, Santa Marta',
    lat: 11.22395,
    lng: -74.19098,
    tipo: 'barrio',
    zoom: 17,
  },
  {
    nombre: 'Parque de Villa Marbella',
    detalle: 'Villa Marbella · Sector Parque, Santa Marta',
    lat: 11.22397,
    lng: -74.19100,
    tipo: 'lugar',
    zoom: 18,
  },
  {
    nombre: 'Barrio El Piñón',
    detalle: 'Sector oriental cercano a Universidad del Magdalena, Santa Marta',
    lat: 11.2275,
    lng: -74.1862,
    tipo: 'barrio',
    zoom: 16,
  },
  {
    nombre: 'Barrio San Pedro Alejandrino',
    detalle: 'Av. del Libertador / Quinta de San Pedro, Santa Marta',
    lat: 11.2312,
    lng: -74.1818,
    tipo: 'barrio',
    zoom: 16,
  },
  {
    nombre: 'Quinta de San Pedro Alejandrino',
    detalle: 'Avenida del Libertador · Sitio histórico, Santa Marta',
    lat: 11.2336,
    lng: -74.1786,
    tipo: 'lugar',
    zoom: 16,
  },
  {
    nombre: 'Barrio Mamatoco',
    detalle: 'Troncal del Caribe / Av. del Libertador, Santa Marta',
    lat: 11.2278,
    lng: -74.1705,
    tipo: 'barrio',
    zoom: 15,
  },
  {
    nombre: 'Centro Comercial Buenavista Santa Marta',
    detalle: 'Av. del Libertador con Carrera 34 · Mamatoco, Santa Marta',
    lat: 11.2266,
    lng: -74.1738,
    tipo: 'lugar',
    zoom: 16,
  },
  {
    nombre: 'Ciudadela 29 de Julio',
    detalle: 'Calle 29 · Zona urbana Santa Marta',
    lat: 11.2276,
    lng: -74.1965,
    tipo: 'barrio',
    zoom: 16,
  },
  {
    nombre: 'Avenida del Río con Carrera 19',
    detalle: 'Corredor vial urbano · Santa Marta',
    lat: 11.2298,
    lng: -74.1935,
    tipo: 'direccion',
    zoom: 16,
  },
  {
    nombre: 'Avenida del Libertador con Carrera 19',
    detalle: 'Corredor arterial · Santa Marta',
    lat: 11.2371,
    lng: -74.1924,
    tipo: 'direccion',
    zoom: 16,
  },
  {
    nombre: 'Centro Histórico de Santa Marta',
    detalle: 'Parque de los Novios / Calle 14 con Carrera 3, Santa Marta',
    lat: 11.2429,
    lng: -74.2116,
    tipo: 'barrio',
    zoom: 16,
  },
  {
    nombre: 'El Rodadero',
    detalle: 'Carrera 1 con Calle 10 · Zona turística, Santa Marta',
    lat: 11.2043,
    lng: -74.2271,
    tipo: 'barrio',
    zoom: 16,
  },
];

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detecta coordenadas geográficas escritas en formatos como:
 * "11.2244, -74.1909" o "11.2244 -74.1909" o "lat: 11.2244 lng: -74.1909"
 */
export function parsearCoordenadas(query: string): ResultadoBusquedaUbicacion | null {
  const limpio = query.trim();
  const match =
    /^\s*(?:lat\s*[:=]?\s*)?(-?\d{1,2}(?:[.,]\d{2,7}))\s*[,;\s]+\s*(?:lng|lon\s*[:=]?\s*)?(-?\d{1,3}(?:[.,]\d{2,7}))\s*$/i.exec(
      limpio
    );
  if (!match) return null;

  const lat = Number.parseFloat(match[1].replace(',', '.'));
  const lng = Number.parseFloat(match[2].replace(',', '.'));

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return {
    id: `coord-${lat}-${lng}`,
    nombre: `Coordenadas ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    detalle: 'Ubicación geográfica exacta',
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    tipo: 'coordenada',
    zoom: 18,
  };
}

/**
 * Busca coincidencias locales instantáneas entre cuadras monitoreadas, barrios, calles y lugares conocidos.
 */
export function buscarUbicacionesLocales(
  query: string,
  vias: CuadraVia[]
): ResultadoBusquedaUbicacion[] {
  const coord = parsearCoordenadas(query);
  if (coord) return [coord];

  const q = normalizarTexto(query);
  if (q.length < 2) return [];

  const tokens = q.split(' ').filter(Boolean);
  const resultados: ResultadoBusquedaUbicacion[] = [];

  for (const via of vias) {
    const campo = normalizarTexto(`${via.id} ${via.nombre} ${via.sector}`);
    if (tokens.every((t) => campo.includes(t))) {
      resultados.push({
        id: `via-${via.id}`,
        nombre: `${via.nombre} (${via.id})`,
        detalle: `Cuadra monitoreada · ${via.sector}, Santa Marta`,
        lat: via.lat,
        lng: via.lng,
        tipo: 'cuadra',
        zoom: 17,
      });
    }
  }

  for (let i = 0; i < REFERENCIAS_SANTA_MARTA.length; i += 1) {
    const ref = REFERENCIAS_SANTA_MARTA[i];
    const campo = normalizarTexto(`${ref.nombre} ${ref.detalle} ${ref.tipo}`);
    if (tokens.every((t) => campo.includes(t))) {
      resultados.push({
        ...ref,
        id: `ref-${i}`,
      });
    }
  }

  return resultados.slice(0, 6);
}

/**
 * Combina resultados instantáneos locales y coordenadas con geocodificación precisa en Santa Marta.
 */
export async function buscarUbicacionesCompletas(
  query: string,
  vias: CuadraVia[],
  signal?: AbortSignal
): Promise<ResultadoBusquedaUbicacion[]> {
  const coord = parsearCoordenadas(query);
  if (coord) return [coord];

  const locales = buscarUbicacionesLocales(query, vias);
  const q = query.trim();
  if (q.length < 3) return locales;

  try {
    const resp = await fetch(`/api/buscar-direccion?q=${encodeURIComponent(q)}`, {
      signal,
    });
    if (!resp.ok) return locales;
    const data = (await resp.json()) as { resultados?: ResultadoBusquedaUbicacion[] };
    const remotos = Array.isArray(data.resultados) ? data.resultados : [];

    const combinados = [...locales];
    for (const r of remotos) {
      const duplicado = combinados.some(
        (ex) =>
          Math.abs(ex.lat - r.lat) < 0.00025 &&
          Math.abs(ex.lng - r.lng) < 0.00025
      );
      if (!duplicado) combinados.push(r);
    }
    return combinados.slice(0, 8);
  } catch {
    return locales;
  }
}
