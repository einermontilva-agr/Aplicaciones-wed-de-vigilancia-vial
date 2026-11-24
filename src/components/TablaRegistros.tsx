import React, { useMemo, useState } from 'react';
import { Eye, Search, X } from 'lucide-react';
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
}

export const TablaRegistros: React.FC<TablaRegistrosProps> = ({
  reportes,
  vias,
  criterios,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState<'todos' | NivelCriticidad>('todos');
  const [filtroFranja, setFiltroFranja] = useState<'todas' | 'pico' | 'valle'>('todas');
  const [reporteModal, setReporteModal] = useState<Reporte | null>(null);

  const mapaVias = useMemo(() => new Map(vias.map((v) => [v.id, v])), [vias]);

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
      <div className="mb-5 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Recorridos de campo en hora pico y valle · Más reportes locales
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Base de registros ({filtrados.length})
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por ID, cuadra u observación..."
              className="min-h-[40px] w-64 border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B69] focus:outline-none"
            />
          </div>

          <div className="flex items-center border border-slate-200 bg-slate-100 p-0.5 text-xs">
            {(['todos', 'Alto', 'Medio', 'Bajo'] as const).map((niv) => (
              <button
                key={niv}
                type="button"
                onClick={() => setFiltroNivel(niv)}
                className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filtroNivel === niv
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {niv === 'todos' ? 'Todos' : niv}
              </button>
            ))}
          </div>

          <div className="flex items-center border border-slate-200 bg-slate-100 p-0.5 text-xs">
            {(['todas', 'pico', 'valle'] as const).map((fr) => (
              <button
                key={fr}
                type="button"
                onClick={() => setFiltroFranja(fr)}
                className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filtroFranja === fr
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {fr === 'todas' ? 'Pico y valle' : fr === 'pico' ? 'Hora pico' : 'Hora valle'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Fecha y hora</th>
              <th className="px-4 py-3">Cuadra / Sector</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3 text-right">Puntaje</th>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No se encontraron registros con los criterios de búsqueda.
                </td>
              </tr>
            ) : (
              filtrados.map((r) => {
                const via = mapaVias.get(r.cuadra);
                const franja = obtenerFranja(r.fecha_hora, criterios);
                const colorNivel =
                  r.criticidad.nivel === 'Alto'
                    ? 'text-[#DC2626]'
                    : r.criticidad.nivel === 'Medio'
                      ? 'text-[#D97706]'
                      : 'text-[#15803D]';

                return (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {r.id}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                      {r.fecha_hora.replace('T', ' ')} · {franja === 'pico' ? 'Pico' : 'Valle'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium text-slate-900">{r.cuadra}</div>
                      <div className="text-[11px] text-slate-500">
                        {via?.sector ?? 'Santa Marta'} · {via ? ETIQUETAS_VIA[via.tipo_via] : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {ETIQUETAS_CATEGORIA_CORTA[r.categoria]}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {ETIQUETAS_ACTOR[r.actor]}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {r.criticidad.puntaje}
                    </td>
                    <td className={`px-4 py-3 font-semibold whitespace-nowrap ${colorNivel}`}>
                      {r.criticidad.nivel}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setReporteModal(r)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#0B3B69] hover:underline whitespace-nowrap cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver ficha
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de ficha técnica y fotografía anonimizada */}
      {reporteModal && desgloseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-ficha"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="font-mono text-xs text-slate-500">
                  {reporteModal.id} · Origen: {reporteModal.origen}
                </p>
                <h2 id="titulo-ficha" className="text-lg font-bold text-slate-900">
                  {reporteModal.cuadra} · {mapaVias.get(reporteModal.cuadra)?.nombre}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReporteModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
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
                className="h-56 w-full border border-slate-200"
              />

              <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-4 text-xs">
                <div>
                  <p className="text-slate-500">Categoría</p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {ETIQUETAS_CATEGORIA[reporteModal.categoria]}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Actor involucrado</p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {ETIQUETAS_ACTOR[reporteModal.actor]}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Fecha y hora</p>
                  <p className="mt-0.5 font-mono text-slate-900 tabular-nums">
                    {reporteModal.fecha_hora.replace('T', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Coordenadas</p>
                  <p className="mt-0.5 font-mono text-slate-900 tabular-nums">
                    {reporteModal.lat.toFixed(5)}, {reporteModal.lng.toFixed(5)}
                  </p>
                </div>
              </div>

              {reporteModal.observacion && (
                <div className="text-xs">
                  <p className="text-slate-500">Observación de campo</p>
                  <p className="mt-0.5 text-slate-800">{reporteModal.observacion}</p>
                </div>
              )}

              <div className="border border-slate-200 bg-slate-50 p-3.5 text-xs">
                <p className="font-semibold text-slate-900">
                  Desglose del índice de criticidad
                </p>
                <div className="mt-2 space-y-1 font-mono text-slate-700 tabular-nums">
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
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
                    <span>Total · Nivel {desgloseModal.nivel}</span>
                    <span>{desgloseModal.puntaje} pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
