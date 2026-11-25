import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { calcularCriticidad } from '../logic/criticidad';
import { REGLAS_OPERATIVAS } from '../logic/resumen';
import {
  CriteriosCriticidad,
  CuadraVia,
  ETIQUETAS_CATEGORIA,
  ETIQUETAS_FRANJA,
  ETIQUETAS_VIA,
  Reporte,
} from '../types';

interface ModeloReglasProps {
  criteriosActivos: CriteriosCriticidad;
  criteriosBase: CriteriosCriticidad;
  vias: CuadraVia[];
  reportes: Reporte[];
  onActualizarCriterios: (nuevos: CriteriosCriticidad) => void;
  onRestablecerCriterios: () => void;
}

export const ModeloReglas: React.FC<ModeloReglasProps> = ({
  criteriosActivos,
  criteriosBase,
  vias,
  reportes,
  onActualizarCriterios,
  onRestablecerCriterios,
}) => {
  const [reporteEjemploId, setReporteEjemploId] = useState<string>('MP-014');
  const [reporteEjemplo2Id, setReporteEjemplo2Id] = useState<string>('MP-004');

  const reporteEjemplo = useMemo(
    () => reportes.find((r) => r.id === reporteEjemploId) ?? reportes[0],
    [reportes, reporteEjemploId]
  );

  const reporteEjemplo2 = useMemo(
    () => reportes.find((r) => r.id === reporteEjemplo2Id) ?? reportes[1] ?? reportes[0],
    [reportes, reporteEjemplo2Id]
  );

  const desgloseEjemplo = useMemo(() => {
    if (!reporteEjemplo) return null;
    return calcularCriticidad(reporteEjemplo, vias, criteriosActivos);
  }, [reporteEjemplo, vias, criteriosActivos]);

  const desgloseEjemplo2 = useMemo(() => {
    if (!reporteEjemplo2) return null;
    return calcularCriticidad(reporteEjemplo2, vias, criteriosActivos);
  }, [reporteEjemplo2, vias, criteriosActivos]);

  const criteriosModificados =
    JSON.stringify(criteriosActivos) !== JSON.stringify(criteriosBase);

  const cambiarPesoCategoria = (
    cat: keyof CriteriosCriticidad['categoria'],
    valor: number
  ) => {
    onActualizarCriterios({
      ...criteriosActivos,
      categoria: {
        ...criteriosActivos.categoria,
        [cat]: valor,
      },
    });
  };

  const cambiarPesoVia = (via: keyof CriteriosCriticidad['via'], valor: number) => {
    onActualizarCriterios({
      ...criteriosActivos,
      via: {
        ...criteriosActivos.via,
        [via]: valor,
      },
    });
  };

  const cambiarPesoFranja = (
    franja: keyof CriteriosCriticidad['franja'],
    valor: number
  ) => {
    onActualizarCriterios({
      ...criteriosActivos,
      franja: {
        ...criteriosActivos.franja,
        [franja]: valor,
      },
    });
  };

  return (
    <section className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Transparencia algorítmica · criterios.json, vias.json y reglas de resumen
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Modelo de criticidad y reglas operativas
          </h1>
        </div>

        {criteriosModificados && (
          <button
            type="button"
            onClick={onRestablecerCriterios}
            className="flex min-h-[40px] items-center gap-1.5 border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restablecer pesos de criterios.json
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Pesos vigentes de criterios.json (simulador en vivo)
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Modifica cualquier peso para comprobar cómo cambia la criticidad de cada reporte, el mapa de calor y el Top 5 del resumen operativo sin editar la lógica.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. Categoría de obstrucción
              </h3>
              <div className="space-y-2">
                {(['doble_fila', 'bloqueo_rampa_cebra_paradero', 'invasion_anden'] as const).map(
                  (cat) => (
                    <div
                      key={cat}
                      className="flex items-center justify-between gap-4 border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950"
                    >
                      <span className="text-slate-800 dark:text-slate-200">{ETIQUETAS_CATEGORIA[cat]}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={criteriosActivos.categoria[cat]}
                          onChange={(e) =>
                            cambiarPesoCategoria(cat, Number(e.target.value) || 0)
                          }
                          className="w-16 border border-slate-300 bg-white px-2 py-1 text-right font-mono font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <span className="font-mono text-slate-500 dark:text-slate-400">pts</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  2. Tipo de vía (vias.json)
                </h3>
                <div className="space-y-2">
                  {(['arterial', 'secundaria'] as const).map((v) => (
                    <div
                      key={v}
                      className="flex items-center justify-between gap-2 border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950"
                    >
                      <span className="text-slate-800 dark:text-slate-200">{ETIQUETAS_VIA[v]}</span>
                      <input
                        type="number"
                        min={0}
                        max={6}
                        value={criteriosActivos.via[v]}
                        onChange={(e) => cambiarPesoVia(v, Number(e.target.value) || 0)}
                        className="w-14 border border-slate-300 bg-white px-2 py-1 text-right font-mono font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  3. Franja horaria
                </h3>
                <div className="space-y-2">
                  {(['pico', 'valle'] as const).map((fr) => (
                    <div
                      key={fr}
                      className="flex items-center justify-between gap-2 border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950"
                    >
                      <span className="text-slate-800 dark:text-slate-200">{ETIQUETAS_FRANJA[fr]}</span>
                      <input
                        type="number"
                        min={0}
                        max={6}
                        value={criteriosActivos.franja[fr]}
                        onChange={(e) =>
                          cambiarPesoFranja(fr, Number(e.target.value) || 0)
                        }
                        className="w-14 border border-slate-300 bg-white px-2 py-1 text-right font-mono font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Horas pico:</span>{' '}
              <span className="font-mono">{criteriosActivos.horas_pico.join(' · ')}</span>
              {' · '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">Rangos:</span>{' '}
              <span className="font-mono">
                Bajo [{criteriosActivos.niveles.Bajo[0]}–{criteriosActivos.niveles.Bajo[1]}], Medio [
                {criteriosActivos.niveles.Medio[0]}–{criteriosActivos.niveles.Medio[1]}], Alto [
                {criteriosActivos.niveles.Alto[0]}–{criteriosActivos.niveles.Alto[1]}+]
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Verificación manual paso a paso · Dos casos (RF-02)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compara dos registros calculados a mano contra el resultado del sistema.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                titulo: 'Caso 1',
                reporte: reporteEjemplo,
                desglose: desgloseEjemplo,
                valorId: reporteEjemplo?.id ?? '',
                onChange: setReporteEjemploId,
              },
              {
                titulo: 'Caso 2',
                reporte: reporteEjemplo2,
                desglose: desgloseEjemplo2,
                valorId: reporteEjemplo2?.id ?? '',
                onChange: setReporteEjemplo2Id,
              },
            ].map(
              (caso) =>
                caso.reporte &&
                caso.desglose && (
                  <div
                    key={caso.titulo}
                    className="space-y-2.5 border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{caso.titulo}</span>
                      <select
                        value={caso.valorId}
                        onChange={(e) => caso.onChange(e.target.value)}
                        className="min-h-[32px] border border-slate-300 bg-white px-2 font-mono text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {reportes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.id} · {r.cuadra}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {caso.reporte.fecha_hora.replace('T', ' ')} · {caso.reporte.cuadra}
                    </div>

                    <ol className="space-y-1 font-mono text-[11px] text-slate-700 dark:text-slate-300 tabular-nums">
                      <li className="flex justify-between">
                        <span>1. Categoría ({caso.reporte.categoria})</span>
                        <span className="font-semibold">+{caso.desglose.puntosCategoria}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>2. Vía ({caso.desglose.tipoVia})</span>
                        <span className="font-semibold">+{caso.desglose.puntosVia}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>3. Franja ({caso.desglose.franja})</span>
                        <span className="font-semibold">+{caso.desglose.puntosFranja}</span>
                      </li>
                    </ol>

                    <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-mono text-xs font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100 tabular-nums">
                      <span>
                        {caso.desglose.puntosCategoria} + {caso.desglose.puntosVia} +{' '}
                        {caso.desglose.puntosFranja} = {caso.desglose.puntaje} pts
                      </span>
                      <span
                        className={
                          caso.desglose.nivel === 'Alto'
                            ? 'text-[#DC2626] dark:text-red-400'
                            : caso.desglose.nivel === 'Medio'
                              ? 'text-[#D97706] dark:text-amber-400'
                              : 'text-[#15803D] dark:text-emerald-400'
                        }
                      >
                        {caso.desglose.nivel}
                      </span>
                    </div>
                  </div>
                )
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              Reglas escritas del resumen operativo (resumen.ts)
            </h3>
            <div className="divide-y divide-slate-200 border border-slate-200 text-xs dark:divide-slate-800 dark:border-slate-800">
              {REGLAS_OPERATIVAS.map((regla) => (
                <div key={regla.id} className="px-3 py-2">
                  <span className="font-mono font-semibold text-[#0B3B69] dark:text-sky-400">{regla.id}</span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{regla.recomendacion}:</span>{' '}
                  <span className="text-slate-600 dark:text-slate-400">{regla.condicion}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Calle 29H3 y Villa Marbella · {vias.length} cuadras clasificadas (vias.json)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Tramo vial</th>
                <th className="px-4 py-2.5">Sector</th>
                <th className="px-4 py-2.5">Clasificación</th>
                <th className="px-4 py-2.5 text-right">Coordenadas centro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {vias.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100">{v.id}</td>
                  <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{v.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{v.sector}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                    {ETIQUETAS_VIA[v.tipo_via]} (+{criteriosActivos.via[v.tipo_via]} pts)
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
