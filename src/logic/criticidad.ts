import {
  CriteriosCriticidad,
  CuadraVia,
  DesgloseCriticidad,
  FranjaHoraria,
  NivelCriticidad,
  Reporte,
  TipoVia,
} from '../types';

/**
 * Convierte una hora "HH:mm" a minutos transcurridos desde las 00:00.
 */
export function horaAMinutos(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr ?? '0', 10);
  const m = Number.parseInt(mStr ?? '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Extrae la parte "HH:mm" de un timestamp ISO local ("YYYY-MM-DDTHH:mm").
 */
export function extraerHora(fechaHora: string): string {
  const parteHora = fechaHora.split('T')[1] ?? '12:00';
  return parteHora.slice(0, 5);
}

/**
 * Determina si una fecha_hora cae dentro de alguna franja pico definida en criterios.json.
 */
export function esHoraPico(fechaHora: string, horasPico: string[]): boolean {
  const minutosReporte = horaAMinutos(extraerHora(fechaHora));
  return horasPico.some((rango) => {
    const [inicio, fin] = rango.split('-');
    if (!inicio || !fin) return false;
    const minInicio = horaAMinutos(inicio);
    const minFin = horaAMinutos(fin);
    return minutosReporte >= minInicio && minutosReporte <= minFin;
  });
}

/**
 * Deduce la franja horaria ('pico' o 'valle') a partir de fecha_hora y criterios.json.
 */
export function obtenerFranja(
  fechaHora: string,
  criterios: CriteriosCriticidad
): FranjaHoraria {
  return esHoraPico(fechaHora, criterios.horas_pico) ? 'pico' : 'valle';
}

/**
 * Busca el tipo de vía ('arterial' o 'secundaria') de una cuadra en vias.json.
 */
export function obtenerTipoVia(cuadraId: string, vias: CuadraVia[]): TipoVia {
  const encontrada = vias.find((v) => v.id === cuadraId);
  return encontrada?.tipo_via ?? 'secundaria';
}

/**
 * Convierte un puntaje numérico en Bajo, Medio o Alto según los rangos de criterios.json.
 */
export function determinarNivel(
  puntaje: number,
  criterios: CriteriosCriticidad
): NivelCriticidad {
  const [bajoMin, bajoMax] = criterios.niveles.Bajo;
  const [medioMin, medioMax] = criterios.niveles.Medio;
  const [altoMin] = criterios.niveles.Alto;

  if (puntaje >= altoMin) return 'Alto';
  if (puntaje >= medioMin && puntaje <= medioMax) return 'Medio';
  if (puntaje >= bajoMin && puntaje <= bajoMax) return 'Bajo';
  return puntaje > medioMax ? 'Alto' : 'Bajo';
}

/**
 * Función pura de criticidad (RF-02):
 * Suma tres componentes: categoría + tipo de vía (vias.json) + franja horaria (criterios.json).
 * No toca el mapa ni el DOM para poder verificarse de forma aislada.
 */
export function calcularCriticidad(
  reporte: Pick<Reporte, 'categoria' | 'cuadra' | 'fecha_hora'>,
  vias: CuadraVia[],
  criterios: CriteriosCriticidad
): DesgloseCriticidad {
  const puntosCategoria = criterios.categoria[reporte.categoria] ?? 0;
  const tipoVia = obtenerTipoVia(reporte.cuadra, vias);
  const puntosVia = criterios.via[tipoVia] ?? 0;
  const franja = obtenerFranja(reporte.fecha_hora, criterios);
  const puntosFranja = criterios.franja[franja] ?? 0;

  const puntaje = puntosCategoria + puntosVia + puntosFranja;
  const nivel = determinarNivel(puntaje, criterios);

  return {
    puntaje,
    nivel,
    puntosCategoria,
    puntosVia,
    puntosFranja,
    tipoVia,
    franja,
  };
}

/**
 * Recalcula la criticidad de una lista de reportes usando las reglas vigentes de criterios.json y vias.json.
 */
export function recalcularReportes(
  reportes: Reporte[],
  vias: CuadraVia[],
  criterios: CriteriosCriticidad
): Reporte[] {
  return reportes.map((rep) => {
    const desglose = calcularCriticidad(rep, vias, criterios);
    return {
      ...rep,
      criticidad: {
        puntaje: desglose.puntaje,
        nivel: desglose.nivel,
      },
    };
  });
}
