import {
  CategoriaObstruccion,
  CriteriosCriticidad,
  CuadraVia,
  RecomendacionCuadra,
  Reporte,
  TipoActor,
} from '../types';
import { obtenerFranja } from './criticidad';

export interface ReglaOperativaInfo {
  id: string;
  condicion: string;
  recomendacion: string;
}

export const REGLAS_OPERATIVAS: ReglaOperativaInfo[] = [
  {
    id: 'R1',
    condicion: '3 o más reportes de nivel Alto en hora pico en la cuadra',
    recomendacion: 'Patrullaje prioritario en hora pico',
  },
  {
    id: 'R2',
    condicion: 'Más del 50 % de los reportes corresponden a invasión de andén (mín. 2)',
    recomendacion: 'Operativo de espacio público',
  },
  {
    id: 'R3',
    condicion: 'Más del 50 % de los reportes involucran vehículos de carga descargando (mín. 2)',
    recomendacion: 'Revisar horario de cargue y descargue',
  },
  {
    id: 'R4',
    condicion: 'Más del 50 % de los reportes corresponden a bloqueo de rampa, cebra o paradero (mín. 2)',
    recomendacion: 'Control de cruces peatonales y paraderos',
  },
  {
    id: 'R5',
    condicion: 'Patrón mixto sin una causa única mayoritaria (>50 %)',
    recomendacion: 'Señalización preventiva y ronda de verificación',
  },
];

function obtenerDominante<T extends string>(conteos: Record<T, number>, defecto: T): [T, number] {
  let mejorClave = defecto;
  let mejorValor = -1;
  for (const [clave, valor] of Object.entries(conteos) as [T, number][]) {
    if (valor > mejorValor) {
      mejorValor = valor;
      mejorClave = clave;
    }
  }
  return [mejorClave, mejorValor];
}

/**
 * Agrupa los reportes activos por cuadra, pondera confirmaciones (+1) en el puntaje acumulado,
 * ordena de mayor a menor, toma las cinco cuadras más críticas y aplica las reglas de recomendación (RF-05).
 */
export function generarResumenOperativo(
  reportes: Reporte[],
  vias: CuadraVia[],
  criterios: CriteriosCriticidad,
  limite = 5
): RecomendacionCuadra[] {
  const mapaVias = new Map(vias.map((v) => [v.id, v]));
  const agrupados = new Map<string, Reporte[]>();

  for (const rep of reportes) {
    if (rep.estado === 'solucionado') continue;
    const lista = agrupados.get(rep.cuadra) ?? [];
    lista.push(rep);
    agrupados.set(rep.cuadra, lista);
  }

  const resumenes: RecomendacionCuadra[] = [];

  for (const [cuadraId, lista] of agrupados.entries()) {
    const via = mapaVias.get(cuadraId);
    const totalReportes = lista.reduce((acc, r) => acc + Math.max(1, r.confirmaciones ?? 1), 0);
    const puntajeAcumulado = lista.reduce(
      (acc, r) => acc + r.criticidad.puntaje * Math.max(1, r.confirmaciones ?? 1),
      0
    );
    const promedioPuntaje =
      totalReportes > 0 ? Number((puntajeAcumulado / totalReportes).toFixed(1)) : 0;

    let reportesAltoPico = 0;
    let reportesAlto = 0;

    const conteoCat: Record<CategoriaObstruccion, number> = {
      doble_fila: 0,
      bloqueo_rampa_cebra_paradero: 0,
      invasion_anden: 0,
    };

    const conteoActor: Record<TipoActor, number> = {
      vehiculo_particular: 0,
      motocicleta: 0,
      vehiculo_carga: 0,
      mobiliario_comercial: 0,
    };

    for (const r of lista) {
      const pesoRep = Math.max(1, r.confirmaciones ?? 1);
      conteoCat[r.categoria] = (conteoCat[r.categoria] ?? 0) + pesoRep;
      conteoActor[r.actor] = (conteoActor[r.actor] ?? 0) + pesoRep;
      const franja = obtenerFranja(r.fecha_hora, criterios);
      if (r.criticidad.nivel === 'Alto') {
        reportesAlto += pesoRep;
        if (franja === 'pico') {
          reportesAltoPico += pesoRep;
        }
      }
    }

    const [categoriaDominante] = obtenerDominante(conteoCat, 'doble_fila');
    const [actorDominante] = obtenerDominante(conteoActor, 'vehiculo_particular');

    let reglaId = 'R5';
    let recomendacion = 'Señalización preventiva y ronda de verificación';
    let reglaTexto = 'Patrón mixto sin una causa única mayoritaria (>50 %)';

    if (reportesAltoPico >= 3) {
      reglaId = 'R1';
      recomendacion = 'Patrullaje prioritario en hora pico';
      reglaTexto = `Se registran ${reportesAltoPico} reportes de nivel Alto en hora pico (umbral ≥ 3).`;
    } else if (conteoCat.invasion_anden >= 2 && conteoCat.invasion_anden / totalReportes > 0.5) {
      reglaId = 'R2';
      recomendacion = 'Operativo de espacio público';
      reglaTexto = `Predomina invasión de andén (${conteoCat.invasion_anden} de ${totalReportes} incidencias, ${Math.round((conteoCat.invasion_anden / totalReportes) * 100)} %).`;
    } else if (conteoActor.vehiculo_carga >= 2 && conteoActor.vehiculo_carga / totalReportes > 0.5) {
      reglaId = 'R3';
      recomendacion = 'Revisar horario de cargue y descargue';
      reglaTexto = `Predomina vehículo de carga descargando (${conteoActor.vehiculo_carga} de ${totalReportes} incidencias, ${Math.round((conteoActor.vehiculo_carga / totalReportes) * 100)} %).`;
    } else if (
      conteoCat.bloqueo_rampa_cebra_paradero >= 2 &&
      conteoCat.bloqueo_rampa_cebra_paradero / totalReportes > 0.5
    ) {
      reglaId = 'R4';
      recomendacion = 'Control de cruces peatonales y paraderos';
      reglaTexto = `Predomina bloqueo de rampa, cebra o paradero (${conteoCat.bloqueo_rampa_cebra_paradero} de ${totalReportes} incidencias, ${Math.round((conteoCat.bloqueo_rampa_cebra_paradero / totalReportes) * 100)} %).`;
    } else {
      reglaId = 'R5';
      recomendacion = 'Señalización preventiva y ronda de verificación';
      reglaTexto = `Incidentes distribuidos entre múltiples categorías y actores (${totalReportes} incidencias sin patrón único > 50 %).`;
    }

    resumenes.push({
      cuadraId,
      nombre: via?.nombre ?? cuadraId,
      sector: via?.sector ?? 'Santa Marta',
      tipoVia: via?.tipo_via ?? 'secundaria',
      totalReportes,
      puntajeAcumulado,
      promedioPuntaje,
      reportesAltoPico,
      reportesAlto,
      categoriaDominante,
      actorDominante,
      recomendacion,
      reglaId,
      reglaTexto,
    });
  }

  return resumenes
    .sort((a, b) => b.puntajeAcumulado - a.puntajeAcumulado || b.totalReportes - a.totalReportes)
    .slice(0, limite);
}
