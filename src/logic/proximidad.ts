import {
  CategoriaObstruccion,
  Reporte,
  ZonaProximidad,
} from '../types';
import { distanciaMetros } from './captura';

export const RADIO_PROXIMIDAD_MIN = 15;
export const RADIO_PROXIMIDAD_MAX = 30;
export const RADIO_PROXIMIDAD_DEFECTO = 25;

export const MENSAJE_ALERTA_PROXIMIDAD =
  'Se han reportado muchos incidentes en esta zona durante los últimos minutos.';

export function parsearFechaLocal(fechaHora: string): number {
  const ms = Date.parse(fechaHora);
  if (!Number.isNaN(ms)) return ms;
  return Date.now();
}

export function formatearDuracionMinutos(ms: number): string {
  const absMs = Math.max(0, ms);
  const totalMin = Math.floor(absMs / 60000);
  if (totalMin < 1) return 'menos de 1 min';
  if (totalMin < 60) return `${totalMin} min`;
  const horas = Math.floor(totalMin / 60);
  const minRestantes = totalMin % 60;
  if (horas < 24) {
    return minRestantes > 0 ? `${horas} h ${minRestantes} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  return horasRestantes > 0 ? `${dias} d ${horasRestantes} h` : `${dias} d`;
}

export function obtenerFechaActividadReporte(reporte: Reporte): string {
  return reporte.ultima_confirmacion && reporte.ultima_confirmacion >= reporte.fecha_hora
    ? reporte.ultima_confirmacion
    : reporte.fecha_hora;
}

/**
 * Calcula la intensidad normalizada (0.06 a 1.0) para el mapa de calor.
 * - Aumenta con la criticidad del reporte y el número de confirmaciones (+1).
 * - Disminuye cuando el reporte es antiguo o cuando ya fue marcado como solucionado.
 */
export function calcularPesoCalorReporte(
  reporte: Reporte,
  ahoraMs = Date.now()
): number {
  const baseCriticidad = Math.max(0.28, Math.min(1, reporte.criticidad.puntaje / 9));
  const confirmaciones = Math.max(1, reporte.confirmaciones ?? 1);
  const factorConfirmaciones = Math.min(1.45, 1 + (confirmaciones - 1) * 0.16);

  const fechaRef = obtenerFechaActividadReporte(reporte);
  const msRef = parsearFechaLocal(fechaRef);
  const edadHoras = Math.max(0, (ahoraMs - msRef) / (1000 * 60 * 60));

  let factorAntiguedad = 1.0;
  if (edadHoras > 24 * 30) {
    factorAntiguedad = 0.24;
  } else if (edadHoras > 24 * 8) {
    factorAntiguedad = 0.45;
  } else if (edadHoras > 24) {
    factorAntiguedad = 0.78;
  } else if (edadHoras > 3) {
    factorAntiguedad = 0.92;
  }

  const factorEstado = reporte.estado === 'solucionado' ? 0.18 : 1.0;

  const peso = baseCriticidad * factorConfirmaciones * factorAntiguedad * factorEstado;
  return Number(Math.max(0.06, Math.min(1, peso)).toFixed(3));
}

/**
 * Agrupa reportes activos de la misma categoría dentro del radio configurable (15-30 m)
 * para destacar zonas afectadas y evitar marcadores duplicados.
 */
export function agruparPorProximidad(
  reportes: Reporte[],
  radioMetros = RADIO_PROXIMIDAD_DEFECTO,
  ahoraMs = Date.now()
): {
  zonasAlerta: ZonaProximidad[];
  reportesEnZonasIds: Set<string>;
  reportesAislados: Reporte[];
} {
  const radioSeguro = Math.max(
    RADIO_PROXIMIDAD_MIN,
    Math.min(RADIO_PROXIMIDAD_MAX, radioMetros)
  );

  const activos = reportes.filter((r) => r.estado !== 'solucionado');
  const solucionados = reportes.filter((r) => r.estado === 'solucionado');

  const porCategoria = new Map<CategoriaObstruccion, Reporte[]>();
  for (const r of activos) {
    const lista = porCategoria.get(r.categoria) ?? [];
    lista.push(r);
    porCategoria.set(r.categoria, lista);
  }

  const zonasAlerta: ZonaProximidad[] = [];
  const reportesEnZonasIds = new Set<string>();
  const reportesAislados: Reporte[] = [...solucionados];

  for (const [categoria, lista] of porCategoria.entries()) {
    const visitados = new Array<boolean>(lista.length).fill(false);

    for (let i = 0; i < lista.length; i += 1) {
      if (visitados[i]) continue;
      visitados[i] = true;

      const componente: Reporte[] = [lista[i]];
      const cola: number[] = [i];

      while (cola.length > 0) {
        const idxActual = cola.shift()!;
        const actual = lista[idxActual];
        for (let j = 0; j < lista.length; j += 1) {
          if (visitados[j]) continue;
          const candidato = lista[j];
          if (
            distanciaMetros(actual.lat, actual.lng, candidato.lat, candidato.lng) <=
            radioSeguro
          ) {
            visitados[j] = true;
            cola.push(j);
            componente.push(candidato);
          }
        }
      }

      const cantidadAcumulada = componente.reduce(
        (acc, item) => acc + Math.max(1, item.confirmaciones ?? 1),
        0
      );

      if (componente.length >= 2 || cantidadAcumulada >= 2) {
        let sumaLat = 0;
        let sumaLng = 0;
        let primerReporte = componente[0].fecha_hora;
        let primerMs = parsearFechaLocal(primerReporte);
        let ultimoReporte = obtenerFechaActividadReporte(componente[0]);
        let ultimoMs = parsearFechaLocal(ultimoReporte);
        let principal = componente[0];

        for (const item of componente) {
          sumaLat += item.lat;
          sumaLng += item.lng;
          reportesEnZonasIds.add(item.id);

          const msInicio = parsearFechaLocal(item.fecha_hora);
          if (msInicio < primerMs) {
            primerMs = msInicio;
            primerReporte = item.fecha_hora;
          }

          const fechaAct = obtenerFechaActividadReporte(item);
          const msAct = parsearFechaLocal(fechaAct);
          if (msAct >= ultimoMs) {
            ultimoMs = msAct;
            ultimoReporte = fechaAct;
            principal = item;
          }
        }

        const tiempoEntreMs = Math.max(0, ultimoMs - primerMs);
        const tiempoDesdeUltimoMs = Math.max(0, ahoraMs - ultimoMs);

        zonasAlerta.push({
          id: `zona-${categoria}-${principal.id}`,
          categoria,
          centro: {
            lat: Number((sumaLat / componente.length).toFixed(6)),
            lng: Number((sumaLng / componente.length).toFixed(6)),
          },
          radioMetros: radioSeguro,
          reportes: [...componente].sort(
            (a, b) =>
              parsearFechaLocal(obtenerFechaActividadReporte(b)) -
              parsearFechaLocal(obtenerFechaActividadReporte(a))
          ),
          cantidadRegistros: componente.length,
          cantidadAcumulada,
          primerReporte,
          ultimoReporte,
          tiempoEntreReportesTexto:
            componente.length === 1 && cantidadAcumulada > 1
              ? `${cantidadAcumulada} confirmaciones en el mismo punto`
              : formatearDuracionMinutos(tiempoEntreMs),
          tiempoDesdeUltimoTexto: formatearDuracionMinutos(tiempoDesdeUltimoMs),
          esAlerta: true,
          mensajeAlerta: MENSAJE_ALERTA_PROXIMIDAD,
          reportePrincipal: principal,
        });
      } else {
        reportesAislados.push(componente[0]);
      }
    }
  }

  zonasAlerta.sort(
    (a, b) =>
      b.cantidadAcumulada - a.cantidadAcumulada ||
      parsearFechaLocal(b.ultimoReporte) - parsearFechaLocal(a.ultimoReporte)
  );

  return { zonasAlerta, reportesEnZonasIds, reportesAislados };
}

/**
 * Busca si existe un incidente activo de la misma categoría dentro del radio de proximidad
 * para ofrecer "Volver a reportar (+1)" en lugar de crear un marcador duplicado.
 */
export function buscarIncidenteCercano(
  lat: number,
  lng: number,
  categoria: CategoriaObstruccion,
  reportes: Reporte[],
  radioMetros = RADIO_PROXIMIDAD_DEFECTO
): { reporte: Reporte; distancia: number } | null {
  const radioSeguro = Math.max(
    RADIO_PROXIMIDAD_MIN,
    Math.min(RADIO_PROXIMIDAD_MAX, radioMetros)
  );

  let mejor: Reporte | null = null;
  let menorDist = Number.POSITIVE_INFINITY;

  for (const r of reportes) {
    if (r.estado === 'solucionado') continue;
    if (r.categoria !== categoria) continue;

    const dist = distanciaMetros(lat, lng, r.lat, r.lng);
    if (dist <= radioSeguro && dist < menorDist) {
      menorDist = dist;
      mejor = r;
    }
  }

  if (!mejor) return null;
  return { reporte: mejor, distancia: Math.round(menorDist) };
}
