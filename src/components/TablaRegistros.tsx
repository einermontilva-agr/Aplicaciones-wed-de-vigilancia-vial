import React, { useMemo, useState } from 'react';
import { CheckCircle2, Eye, PlusCircle, Search, X } from 'lucide-react';
import { calcularCriticidad, obtenerFranja } from '../logic/criticidad';
import {
  CriteriosCriticidad,
  CuadraVia,
  ETIQUETAS_ACTOR,
  ETIQUETAS_CATEGORIA,
  ETIQUETAS_CATEGORIA_CORTA,
  ETIQUETAS_FRANJA,
  ETIQUETAS_VIA,
  NivelCriticidad,
  Reporte,
} from '../types';
import { FotoAnonimizada } from './FotoAnonimizada';

interface TablaRegistrosProps {
  reportes: Reporte[];
  vias: CuadraVia[];
  criterios: CriteriosCriticidad;
  onConfirmarReporte: (reporteId: string) => void;
  onToggleSolucionado: (reporteId: string) => void;
}

export const TablaRegistros: React.FC<TablaRegistrosProps> = ({
  reportes,
  vias,
  criterios,
  onConfirmarReporte,
  onToggleSolucionado,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState<'todos' | NivelCriticidad>('todos');
  const [filtroFranja, setFiltroFranja] = useState<'todas' | 'pico' | 'valle'>('todas');
  const [reporteModalId, setReporteModalId] = useState<string | null>(null);

  const mapaVias = useMemo(() => new Map(vias.map((v) => [v.id, v])), [vias]);

  const reporteModal = useMemo(
    () => (reporteModalId ? reportes.find((r) => r.id === reporteModalId) ?? null : null),
    [reportes, reporteModalId]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return reportes.filter((r) => {
      if (filtroNivel !== 'todos' && r.criticidad.nivel !== filtroNivel) return false;
      const franja = obtenerFranja(r.fecha_hora, criterios);
      if (filtroFranja !== 'todas' && franja !== filtroFranja) return false;

      if (!q) return true;
      const via = mapaVias.get(r.cuadra);
      const texto = [
        r.id,
        r.cuadra,
        via?.nombre ?? '',
        via?.sector ?? '',
        ETIQUETAS_CATEGORIA[r.categoria],
        ETIQUETAS_ACTOR[r.actor],
        r.observacion ?? '',
        r.estado ?? 'activo',
      ]
        .join(' ')
        .toLowerCase();
      return texto.includes(q);
    });
  }, [reportes, filtroNivel, filtroFranja, busqueda, criterios, mapaVias]);

  const desgloseModal = useMemo(() => {
    if (!reporteModal) return null;
    return calcularCriticidad(reporteModal, vias, criterios);
  }, [reporteModal, vias, criterios]);

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Recorridos de campo en hora pico y valle · Confirmaciones (+1) y reportes locales
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Base de registros ({filtrados.length})
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por ID, cuadra u observación..."
              className="min-h-[40px] w-64 border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B69] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
            {(['todos', 'Alto', 'Medio', 'Bajo'] as const).map((niv) => (
              <button
                key={niv}
                type="button"
                onClick={() => setFiltroNivel(niv)}
                className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filtroNivel === niv
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {niv === 'todos' ? 'Todos' : niv}
              </button>
            ))}
          </div>

          <div className="flex items-center border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
            {(['todas', 'pico', 'valle'] as const).map((fr) => (
              <button
                key={fr}
                type="button"
                onClick={() => setFiltroFranja(fr)}
                className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filtroFranja === fr
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {fr === 'todas' ? 'Pico y valle' : fr === 'pico' ? 'Hora pico' : 'Hora valle'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Fecha y hora</th>
              <th className="px-4 py-3">Cuadra / Sector</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3 text-right">Confirm.</th>
              <th className="px-4 py-3 text-right">Puntaje</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                  No se encontraron registros con los criterios de búsqueda.
                </td>
              </tr>
            ) : (
              filtrados.map((r) => {
                const via = mapaVias.get(r.cuadra);
                const franja = obtenerFranja(r.fecha_hora, criterios);
                const esSolucionado = r.estado === 'solucionado';
                const confirmaciones = Math.max(1, r.confirmaciones ?? 1);
                const colorNivel =
                  r.criticidad.nivel === 'Alto'
                    ? 'text-[#DC2626] dark:text-red-400'
                    : r.criticidad.nivel === 'Medio'
                      ? 'text-[#D97706] dark:text-amber-400'
                      : 'text-[#15803D] dark:text-emerald-400';

                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {r.id}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                      {(r.ultima_confirmacion ?? r.fecha_hora).replace('T', ' ')} ·{' '}
                      {franja === 'pico' ? 'Pico' : 'Valle'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium text-slate-900 dark:text-slate-100">
                        {r.cuadra}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {via?.sector ?? 'Santa Marta'} · {via ? ETIQUETAS_VIA[via.tipo_via] : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                      {ETIQUETAS_CATEGORIA_CORTA[r.categoria]}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {ETIQUETAS_ACTOR[r.actor]}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[#0B3B69] dark:text-sky-400 tabular-nums">
                      {confirmaciones}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      <span className="text-slate-900 dark:text-slate-100">{r.criticidad.puntaje}</span>{' '}
                      <span className={`text-[11px] ${colorNivel}`}>({r.criticidad.nivel})</span>
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <span
                        className={
                          esSolucionado
                            ? 'text-slate-500 dark:text-slate-400'
                            : 'text-[#15803D] dark:text-emerald-400'
                        }
                      >
                        {esSolucionado ? 'Solucionado' : 'Activo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        {!esSolucionado && (
                          <button
                            type="button"
                            onClick={() => onConfirmarReporte(r.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B3B69] hover:underline dark:text-sky-400 cursor-pointer"
                            title="Confirmar que el incidente continúa presente (+1)"
                          >
                            <PlusCircle className="h-3.5 w-3.5" />
                            +1
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setReporteModalId(r.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B69] hover:underline dark:text-sky-400 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver ficha
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de ficha técnica y fotografía */}
      {reporteModal && desgloseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-ficha"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {reporteModal.id} · Origen: {reporteModal.origen} ·{' '}
                  {reporteModal.estado === 'solucionado' ? 'Solucionado' : 'Activo'}
                </p>
                <h2 id="titulo-ficha" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {reporteModal.cuadra} · {mapaVias.get(reporteModal.cuadra)?.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReporteModalId(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Cerrar ficha"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <FotoAnonimizada
                foto={reporteModal.foto}
                reporteId={reporteModal.id}
                categoria={reporteModal.categoria}
                actor={reporteModal.actor}
                cuadra={reporteModal.cuadra}
                className="h-56 w-full border border-slate-200 dark:border-slate-700"
              />

              <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-4 text-xs dark:border-slate-800">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Categoría</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {ETIQUETAS_CATEGORIA[reporteModal.categoria]}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Actor involucrado</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {ETIQUETAS_ACTOR[reporteModal.actor]}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Fecha inicial / Última confirmación</p>
                  <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    {reporteModal.fecha_hora.replace('T', ' ')}
                    {reporteModal.ultima_confirmacion
                      ? ` · ${reporteModal.ultima_confirmacion.replace('T', ' ')}`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Confirmaciones · Coordenadas</p>
                  <p className="mt-0.5 font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    {Math.max(1, reporteModal.confirmaciones ?? 1)} · {reporteModal.lat.toFixed(5)},{' '}
                    {reporteModal.lng.toFixed(5)}
                  </p>
                </div>
              </div>

              {reporteModal.observacion && (
                <div className="text-xs">
                  <p className="text-slate-500 dark:text-slate-400">Observación de campo</p>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200">{reporteModal.observacion}</p>
                </div>
              )}

              <div className="border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Desglose del índice de criticidad
                </p>
                <div className="mt-2 space-y-1 font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                  <div className="flex justify-between">
                    <span>1. Categoría ({reporteModal.categoria})</span>
                    <span>+{desgloseModal.puntosCategoria} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>2. Tipo de vía en vias.json ({desgloseModal.tipoVia})</span>
                    <span>+{desgloseModal.puntosVia} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span>3. Franja horaria ({ETIQUETAS_FRANJA[desgloseModal.franja]})</span>
                    <span>+{desgloseModal.puntosFranja} pts</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                    <span>Total · Nivel {desgloseModal.nivel}</span>
                    <span>{desgloseModal.puntaje} pts</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {reporteModal.estado !== 'solucionado' && (
                  <button
                    type="button"
                    onClick={() => onConfirmarReporte(reporteModal.id)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 bg-[#0B3B69] px-4 py-2 text-xs font-semibold text-white hover:bg-[#082c4f] dark:bg-sky-700 dark:hover:bg-sky-600 cursor-pointer"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Volver a reportar (+1)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onToggleSolucionado(reporteModal.id)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4 text-[#15803D] dark:text-emerald-400" />
                  {reporteModal.estado === 'solucionado'
                    ? 'Reactivar incidente'
                    : 'Marcar como solucionado'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
