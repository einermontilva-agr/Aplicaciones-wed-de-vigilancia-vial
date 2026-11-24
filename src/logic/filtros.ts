import {
  CategoriaObstruccion,
  CriteriosCriticidad,
  CuadraVia,
  FiltrosActivos,
  Reporte,
} from '../types';
import { extraerHora, horaAMinutos, obtenerFranja } from './criticidad';

export const FILTROS_INICIALES: FiltrosActivos = {
  sector: 'todos',
  cuadra: 'todas',
  franja: 'todas',
  horaDesde: '',
  horaHasta: '',
  categoria: 'todas',
  actor: 'todos',
  nivel: 'todos',
};

/**
 * Implementación de filtros (RF-04):
 * Recibe la lista completa de reportes y los filtros activos;
 * recorre cada reporte y verifica si cumple todas las condiciones elegidas.
 */
export function filtrarReportes(
  reportes: Reporte[],
  filtros: FiltrosActivos,
  vias: CuadraVia[],
  criterios: CriteriosCriticidad
): Reporte[] {
  const mapaVias = new Map(vias.map((v) => [v.id, v]));
  const minDesde = filtros.horaDesde ? horaAMinutos(filtros.horaDesde) : null;
  const minHasta = filtros.horaHasta ? horaAMinutos(filtros.horaHasta) : null;

  return reportes.filter((reporte) => {
    const via = mapaVias.get(reporte.cuadra);

    if (filtros.sector !== 'todos') {
      if (!via || via.sector !== filtros.sector) return false;
    }

    if (filtros.cuadra !== 'todas' && reporte.cuadra !== filtros.cuadra) {
      return false;
    }

    if (filtros.franja !== 'todas') {
      const franjaReporte = obtenerFranja(reporte.fecha_hora, criterios);
      if (franjaReporte !== filtros.franja) return false;
    }

    if (minDesde !== null || minHasta !== null) {
      const minReporte = horaAMinutos(extraerHora(reporte.fecha_hora));
      if (minDesde !== null && minReporte < minDesde) return false;
      if (minHasta !== null && minReporte > minHasta) return false;
    }

    if (filtros.categoria !== 'todas' && reporte.categoria !== filtros.categoria) {
      return false;
    }

    if (filtros.actor !== 'todos' && reporte.actor !== filtros.actor) {
      return false;
    }

    if (filtros.nivel !== 'todos' && reporte.criticidad.nivel !== filtros.nivel) {
      return false;
    }

    return true;
  });
}

export interface DistribucionCategoria {
  categoria: CategoriaObstruccion;
  conteo: number;
  porcentaje: number;
}

/**
 * Calcula conteo y porcentaje por categoría para el tablero (CU-02).
 */
export function calcularDistribucionCategorias(
  reportes: Reporte[]
): DistribucionCategoria[] {
  const total = reportes.length;
  const categorias: CategoriaObstruccion[] = [
    'doble_fila',
    'bloqueo_rampa_cebra_paradero',
    'invasion_anden',
  ];

  return categorias.map((categoria) => {
    const conteo = reportes.filter((r) => r.categoria === categoria).length;
    const porcentaje = total > 0 ? Math.round((conteo / total) * 100) : 0;
    return { categoria, conteo, porcentaje };
  });
}
