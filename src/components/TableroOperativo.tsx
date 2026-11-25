import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  MapPin,
  PlusCircle,
  Printer,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { calcularCriticidad, extraerHora, obtenerFranja } from '../logic/criticidad';
import {
  calcularUsoAlmacenamientoKB,
  combinarSinDuplicados,
  descargarReportesJSON,
} from '../logic/captura';
import {
  calcularDistribucionCategorias,
  FILTROS_INICIALES,
  filtrarReportes,
} from '../logic/filtros';
import { agruparPorProximidad } from '../logic/proximidad';
import { generarResumenOperativo } from '../logic/resumen';
import {
  CriteriosCriticidad,
  CuadraVia,
  ETIQUETAS_ACTOR,
  ETIQUETAS_CATEGORIA,
  ETIQUETAS_CATEGORIA_CORTA,
  ETIQUETAS_FRANJA,
  ETIQUETAS_VIA,
  FiltrosActivos,
  Reporte,
  ResultadoBusquedaUbicacion,
  ZonaProximidad,
} from '../types';
import { BuscadorUbicacion } from './BuscadorUbicacion';
import { FotoAnonimizada } from './FotoAnonimizada';
import { MapaSantaMarta } from './MapaSantaMarta';

interface TableroOperativoProps {
  reportes: Reporte[];
  reportesLocalesCount: number;
  vias: CuadraVia[];
  criterios: CriteriosCriticidad;
  radioProximidad: number;
  onCambiarRadioProximidad: (radio: number) => void;
  onConfirmarReporte: (reporteId: string) => void;
  onToggleSolucionado: (reporteId: string) => void;
  onImportarReportes: (nuevos: Reporte[]) => { agregados: number; duplicados: number };
  onLimpiarLocales: () => void;
  onIrACaptura: () => void;
  esOscuro: boolean;
}

export const TableroOperativo: React.FC<TableroOperativoProps> = ({
  reportes,
  reportesLocalesCount,
  vias,
  criterios,
  radioProximidad,
  onCambiarRadioProximidad,
  onConfirmarReporte,
  onToggleSolucionado,
  onImportarReportes,
  onLimpiarLocales,
  onIrACaptura,
  esOscuro,
}) => {
  const [filtros, setFiltros] = useState<FiltrosActivos>(FILTROS_INICIALES);
  const [reporteSeleccionadoId, setReporteSeleccionadoId] = useState<string | null>(null);
  const [zonaSeleccionadaId, setZonaSeleccionadaId] = useState<string | null>(null);
  const [puntoEnfocado, setPuntoEnfocado] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    etiqueta?: string;
  } | null>(null);
  const [mensajeSync, setMensajeSync] = useState<string>('');
  const inputImportarRef = useRef<HTMLInputElement | null>(null);

  const sectores = useMemo(() => {
    const set = new Set(vias.map((v) => v.sector));
    return Array.from(set);
  }, [vias]);

  const reportesFiltrados = useMemo(
    () => filtrarReportes(reportes, filtros, vias, criterios),
    [reportes, filtros, vias, criterios]
  );

  const agrupacion = useMemo(
    () => agruparPorProximidad(reportesFiltrados, radioProximidad),
    [reportesFiltrados, radioProximidad]
  );

  const reporteSeleccionado = useMemo(
    () =>
      reporteSeleccionadoId
        ? reportes.find((r) => r.id === reporteSeleccionadoId) ?? null
        : null,
    [reportes, reporteSeleccionadoId]
  );

  const zonaSeleccionada = useMemo(
    () =>
      zonaSeleccionadaId
        ? agrupacion.zonasAlerta.find((z) => z.id === zonaSeleccionadaId) ?? null
        : null,
    [agrupacion.zonasAlerta, zonaSeleccionadaId]
  );

  const distribucion = useMemo(
    () => calcularDistribucionCategorias(reportesFiltrados),
    [reportesFiltrados]
  );

  const resumenTop5 = useMemo(
    () => generarResumenOperativo(reportesFiltrados, vias, criterios, 5),
    [reportesFiltrados, vias, criterios]
  );

  const estadisticas = useMemo(() => {
    const altos = reportesFiltrados.filter(
      (r) => r.estado !== 'solucionado' && r.criticidad.nivel === 'Alto'
    ).length;
    const pico = reportesFiltrados.filter(
      (r) => obtenerFranja(r.fecha_hora, criterios) === 'pico'
    ).length;
    const puntajeTotal = reportesFiltrados.reduce(
      (acc, r) =>
        acc +
        (r.estado === 'solucionado' ? 0 : r.criticidad.puntaje * Math.max(1, r.confirmaciones ?? 1)),
      0
    );
    const totalConfirmaciones = reportesFiltrados.reduce(
      (acc, r) => acc + Math.max(1, r.confirmaciones ?? 1),
      0
    );
    return { altos, pico, puntajeTotal, totalConfirmaciones };
  }, [reportesFiltrados, criterios]);

  const usoKB = calcularUsoAlmacenamientoKB();

  const hayFiltrosActivos =
    filtros.sector !== 'todos' ||
    filtros.cuadra !== 'todas' ||
    filtros.franja !== 'todas' ||
    filtros.horaDesde !== '' ||
    filtros.horaHasta !== '' ||
    filtros.categoria !== 'todas' ||
    filtros.actor !== 'todos' ||
    filtros.nivel !== 'todos';

  const manejarExportarTodo = () => {
    const fecha = new Date().toISOString().slice(0, 10);
    descargarReportesJSON(reportes, `reportes-santa-marta-${fecha}.json`);
    setMensajeSync(`Se descargaron ${reportes.length} reportes en formato JSON.`);
  };

  const manejarImportarArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = e.target.files;
    if (!archivos || archivos.length === 0) return;

    const todosAgregados: Reporte[] = [];
    let totalDuplicados = 0;
    let erroresLectura = 0;
    let acumuladosParaValidar = [...reportes];

    for (const archivo of Array.from(archivos)) {
      try {
        const texto = await archivo.text();
        const data = JSON.parse(texto);
        if (!Array.isArray(data)) {
          erroresLectura += 1;
          continue;
        }
        const { combinados, agregados, duplicados } = combinarSinDuplicados(
          acumuladosParaValidar,
          data as Reporte[]
        );
        acumuladosParaValidar = combinados;
        todosAgregados.push(...agregados);
        totalDuplicados += duplicados;
      } catch {
        erroresLectura += 1;
      }
    }

    let agregadosFinal = 0;
    if (todosAgregados.length > 0) {
      const res = onImportarReportes(todosAgregados);
      agregadosFinal = res.agregados;
      totalDuplicados += res.duplicados;
    }

    const avisoError =
      erroresLectura > 0
        ? ` (${erroresLectura} archivo(s) con formato inválido)`
        : '';

    setMensajeSync(
      `Importación completada: ${agregadosFinal} reportes nuevos agregados, ${totalDuplicados} duplicados omitidos por id.${avisoError}`
    );
    if (inputImportarRef.current) inputImportarRef.current.value = '';
  };

  const manejarConfirmar = (reporteId: string) => {
    onConfirmarReporte(reporteId);
    setMensajeSync(
      `Confirmación (+1) registrada en el incidente ${reporteId}. Se actualizó la hora y aumentó su relevancia en el mapa de calor.`
    );
  };

  const manejarSeleccionUbicacionBuscador = (res: ResultadoBusquedaUbicacion) => {
    setPuntoEnfocado({
      lat: res.lat,
      lng: res.lng,
      zoom: res.zoom ?? 17,
      etiqueta: res.nombre,
    });
  };

  const desgloseSeleccionado = useMemo(() => {
    if (!reporteSeleccionado) return null;
    return calcularCriticidad(reporteSeleccionado, vias, criterios);
  }, [reporteSeleccionado, vias, criterios]);

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      {/* Encabezado visible solo al imprimir (RF-05) */}
      <div className="print-only mb-6 border-b border-slate-400 pb-4">
        <h1 className="text-xl font-bold text-black">
          Vigía Vial Santa Marta · Resumen Operativo de Espacio Público
        </h1>
        <p className="mt-1 text-xs text-slate-700">
          Calle 29H3 y Villa Marbella · Santa Marta · Generado el{' '}
          {new Date().toLocaleString('es-CO')} · Registros analizados: {reportesFiltrados.length}
        </p>
      </div>

      {/* Encabezado del tablero */}
      <div className="no-print mb-5 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Calle 29H3 y Villa Marbella · Santa Marta
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Tablero de criticidad y mapa de calor
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={manejarExportarTodo}
            className="flex min-h-[40px] items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-[#0B3B69] dark:text-sky-400" />
            Exportar JSON ({reportes.length})
          </button>

          <label className="flex min-h-[40px] cursor-pointer items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap">
            <Upload className="h-3.5 w-3.5 text-[#0B3B69] dark:text-sky-400" />
            Importar JSON
            <input
              ref={inputImportarRef}
              type="file"
              accept=".json,application/json"
              multiple
              onChange={manejarImportarArchivo}
              className="sr-only"
            />
          </label>

          {reportesLocalesCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onLimpiarLocales();
                setMensajeSync('Se restablecieron únicamente los reportes guardados en este navegador.');
              }}
              className="flex min-h-[40px] items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:text-[#DC2626] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-red-400 whitespace-nowrap cursor-pointer"
              title="Limpiar reportes locales e importados"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar locales ({reportesLocalesCount})
            </button>
          )}
        </div>
      </div>

      {mensajeSync && (
        <div className="no-print mb-5 flex items-center justify-between border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <span>{mensajeSync}</span>
          <button
            type="button"
            onClick={() => setMensajeSync('')}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Cerrar mensaje"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Alerta de zonas acumulativas por proximidad */}
      {agrupacion.zonasAlerta.length > 0 && (
        <div className="no-print mb-5 border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-800/80 dark:bg-amber-950/35">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706] dark:text-amber-400" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-amber-200">
                  {agrupacion.zonasAlerta[0].mensajeAlerta}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-700 dark:text-amber-100/80">
                  Se detectaron {agrupacion.zonasAlerta.length} zona(s) con acumulación del mismo tipo dentro de un radio de {radioProximidad} m.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {agrupacion.zonasAlerta.slice(0, 3).map((z: ZonaProximidad) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    setZonaSeleccionadaId(z.id);
                    setReporteSeleccionadoId(z.reportePrincipal.id);
                    setPuntoEnfocado({
                      lat: z.centro.lat,
                      lng: z.centro.lng,
                      zoom: 18,
                    });
                  }}
                  className="border border-amber-300 bg-white px-2.5 py-1.5 text-left text-[11px] text-slate-800 hover:bg-amber-100/60 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <span className="font-semibold text-[#DC2626] dark:text-red-400 tabular-nums">
                    {z.cantidadAcumulada} rep.
                  </span>{' '}
                  · {ETIQUETAS_CATEGORIA_CORTA[z.categoria]} · Último:{' '}
                  <span className="font-mono tabular-nums">
                    {z.ultimoReporte.slice(11, 16)}
                  </span>{' '}
                  ({z.tiempoEntreReportesTexto})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Barra de filtros sin recarga (RF-04 / CU-02) */}
      <div className="no-print mb-6 border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Filtros de análisis
            </h2>
            <button
              type="button"
              onClick={() =>
                setFiltros({
                  ...FILTROS_INICIALES,
                  sector: 'Calle 29H3',
                  horaDesde: '11:00',
                  horaHasta: '14:00',
                })
              }
              className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-[#0B3B69] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-sky-400 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
            >
              Preset: Calle 29H3 11:00–14:00
            </button>
          </div>

          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={() => setFiltros(FILTROS_INICIALES)}
              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restablecer filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="f-sector" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Sector
            </label>
            <select
              id="f-sector"
              value={filtros.sector}
              onChange={(e) => setFiltros({ ...filtros, sector: e.target.value, cuadra: 'todas' })}
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="todos">Todos los sectores</option>
              {sectores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-cuadra" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Cuadra
            </label>
            <select
              id="f-cuadra"
              value={filtros.cuadra}
              onChange={(e) => setFiltros({ ...filtros, cuadra: e.target.value })}
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="todas">Todas las cuadras</option>
              {vias
                .filter((v) => filtros.sector === 'todos' || v.sector === filtros.sector)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-franja" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Franja horaria
            </label>
            <select
              id="f-franja"
              value={filtros.franja}
              onChange={(e) =>
                setFiltros({
                  ...filtros,
                  franja: e.target.value as FiltrosActivos['franja'],
                })
              }
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="todas">Todas las franjas</option>
              <option value="pico">Hora pico</option>
              <option value="valle">Hora valle</option>
            </select>
          </div>

          <div>
            <label htmlFor="f-desde" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Desde hora
            </label>
            <input
              id="f-desde"
              type="time"
              value={filtros.horaDesde}
              onChange={(e) => setFiltros({ ...filtros, horaDesde: e.target.value })}
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="f-hasta" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Hasta hora
            </label>
            <input
              id="f-hasta"
              type="time"
              value={filtros.horaHasta}
              onChange={(e) => setFiltros({ ...filtros, horaHasta: e.target.value })}
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="f-cat" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Categoría
            </label>
            <select
              id="f-cat"
              value={filtros.categoria}
              onChange={(e) =>
                setFiltros({
                  ...filtros,
                  categoria: e.target.value as FiltrosActivos['categoria'],
                })
              }
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="todas">Todas las categorías</option>
              <option value="doble_fila">Doble fila / vía prohibida</option>
              <option value="bloqueo_rampa_cebra_paradero">Rampa, cebra o paradero</option>
              <option value="invasion_anden">Invasión de andén</option>
            </select>
          </div>

          <div>
            <label htmlFor="f-actor" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Actor
            </label>
            <select
              id="f-actor"
              value={filtros.actor}
              onChange={(e) =>
                setFiltros({
                  ...filtros,
                  actor: e.target.value as FiltrosActivos['actor'],
                })
              }
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="todos">Todos los actores</option>
              <option value="vehiculo_particular">Vehículo particular</option>
              <option value="motocicleta">Motocicleta</option>
              <option value="vehiculo_carga">Vehículo de carga</option>
              <option value="mobiliario_comercial">Mobiliario comercial</option>
            </select>
          </div>

          <div>
            <label htmlFor="f-nivel" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Nivel de criticidad
            </label>
            <select
              id="f-nivel"
              value={filtros.nivel}
              onChange={(e) =>
                setFiltros({
                  ...filtros,
                  nivel: e.target.value as FiltrosActivos['nivel'],
                })
              }
              className="min-h-[40px] w-full border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="todos">Todos los niveles</option>
              <option value="Alto">Alto (7–9 pts)</option>
              <option value="Medio">Medio (5–6 pts)</option>
              <option value="Bajo">Bajo (0–4 pts)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Métricas operativas y distribución por categoría (CU-02) */}
      <div className="mb-6 grid grid-cols-1 gap-4 border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-12">
        <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4 dark:border-slate-800 lg:col-span-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Incidencias visibles</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {estadisticas.totalConfirmaciones}
              <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
                ({reportesFiltrados.length} reg.)
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Activos nivel Alto</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#DC2626] dark:text-red-400 tabular-nums">
              {estadisticas.altos}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">En hora pico</p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {estadisticas.pico}
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 lg:pl-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Distribución por categoría en la selección actual
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Puntaje acumulado: {estadisticas.puntajeTotal} pts · Uso local: {usoKB} KB / 5,120 KB
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {distribucion.map((item) => (
              <div key={item.categoria}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {ETIQUETAS_CATEGORIA_CORTA[item.categoria]}
                  </span>
                  <span className="ml-2 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                    {item.porcentaje}% ({item.conteo})
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full bg-[#0B3B69] dark:bg-sky-500 transition-all duration-200"
                    style={{ width: `${item.porcentaje}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mapa principal + Resumen Operativo */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Buscador preciso + Mapa de calor y puntos (RF-03) */}
        <div className="no-print space-y-3 xl:col-span-7">
          <div className="border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <BuscadorUbicacion
              vias={vias}
              onSeleccionarUbicacion={manejarSeleccionUbicacionBuscador}
              compact={true}
            />
          </div>

          {reportesFiltrados.length === 0 ? (
            <div className="flex h-[460px] flex-col items-center justify-center border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Ningún reporte coincide con los filtros actuales
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                Ajusta la franja horaria, el sector o la categoría para volver a visualizar puntos en el mapa de Santa Marta.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setFiltros(FILTROS_INICIALES)}
                  className="bg-[#0B3B69] px-4 py-2 text-xs font-medium text-white dark:bg-sky-700 cursor-pointer"
                >
                  Mostrar todos los reportes
                </button>
                <button
                  type="button"
                  onClick={onIrACaptura}
                  className="border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Registrar incidente
                </button>
              </div>
            </div>
          ) : (
            <MapaSantaMarta
              reportes={reportesFiltrados}
              vias={vias}
              onSeleccionarReporte={(rep) => {
                setReporteSeleccionadoId(rep.id);
                setZonaSeleccionadaId(null);
              }}
              onSeleccionarZona={(z) => {
                setZonaSeleccionadaId(z.id);
                setReporteSeleccionadoId(z.reportePrincipal.id);
              }}
              onConfirmarReporte={manejarConfirmar}
              puntoEnfocado={puntoEnfocado}
              alturaClase="h-[460px] xl:h-[560px]"
              radioProximidad={radioProximidad}
              onCambiarRadioProximidad={onCambiarRadioProximidad}
              esOscuro={esOscuro}
            />
          )}

          {/* Panel de zona acumulada seleccionada */}
          {zonaSeleccionada && (
            <div className="border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[#DC2626] dark:text-red-400">
                    {zonaSeleccionada.mensajeAlerta}
                  </p>
                  <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                    Categoría: <strong>{ETIQUETAS_CATEGORIA[zonaSeleccionada.categoria]}</strong> · Radio analizado: {zonaSeleccionada.radioMetros} m
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setZonaSeleccionadaId(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Cerrar resumen de zona"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-amber-200/80 pt-3 text-xs dark:border-amber-800/60 sm:grid-cols-3">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Reportes acumulados</span>
                  <p className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {zonaSeleccionada.cantidadAcumulada} incidencias ({zonaSeleccionada.cantidadRegistros} reg.)
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Hora del último reporte</span>
                  <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {zonaSeleccionada.ultimoReporte.replace('T', ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Entre primero y último</span>
                  <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {zonaSeleccionada.tiempoEntreReportesTexto}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Panel de inspección rápida cuando se hace clic en un punto o zona del mapa */}
          {reporteSeleccionado && desgloseSeleccionado && (
            <div className="grid grid-cols-1 gap-4 border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <FotoAnonimizada
                  foto={reporteSeleccionado.foto}
                  reporteId={reporteSeleccionado.id}
                  categoria={reporteSeleccionado.categoria}
                  actor={reporteSeleccionado.actor}
                  cuadra={reporteSeleccionado.cuadra}
                  className="h-36 w-full"
                />
              </div>
              <div className="flex flex-col justify-between sm:col-span-8">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {reporteSeleccionado.id} · {reporteSeleccionado.cuadra} ·{' '}
                        {reporteSeleccionado.fecha_hora.replace('T', ' ')}
                        {reporteSeleccionado.estado === 'solucionado' ? ' · SOLUCIONADO' : ''}
                      </p>
                      <h3 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                        {ETIQUETAS_CATEGORIA[reporteSeleccionado.categoria]}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReporteSeleccionadoId(null);
                        setZonaSeleccionadaId(null);
                      }}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      aria-label="Cerrar detalle"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Actor:{' '}
                    <strong className="font-medium text-slate-800 dark:text-slate-100">
                      {ETIQUETAS_ACTOR[reporteSeleccionado.actor]}
                    </strong>
                    {' · '}
                    Confirmaciones:{' '}
                    <strong className="font-mono text-[#0B3B69] dark:text-sky-400 tabular-nums">
                      {Math.max(1, reporteSeleccionado.confirmaciones ?? 1)}
                    </strong>
                    {reporteSeleccionado.ultima_confirmacion && (
                      <span>
                        {' · '}Última confirmación:{' '}
                        <span className="font-mono tabular-nums">
                          {reporteSeleccionado.ultima_confirmacion.replace('T', ' ')}
                        </span>
                      </span>
                    )}
                  </p>
                  {reporteSeleccionado.observacion && (
                    <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
                      {reporteSeleccionado.observacion}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
                  <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                    Cálculo: +{desgloseSeleccionado.puntosCategoria} +{' '}
                    {desgloseSeleccionado.puntosVia} + {desgloseSeleccionado.puntosFranja} ={' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {desgloseSeleccionado.puntaje} pts ({desgloseSeleccionado.nivel})
                    </strong>
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    {reporteSeleccionado.estado !== 'solucionado' && (
                      <button
                        type="button"
                        onClick={() => manejarConfirmar(reporteSeleccionado.id)}
                        className="inline-flex min-h-[34px] items-center gap-1.5 bg-[#0B3B69] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#082c4f] dark:bg-sky-700 dark:hover:bg-sky-600 cursor-pointer"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        Volver a reportar (+1)
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onToggleSolucionado(reporteSeleccionado.id)}
                      className={`inline-flex min-h-[34px] items-center gap-1.5 border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        reporteSeleccionado.estado === 'solucionado'
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'border-emerald-300 bg-emerald-50 text-[#15803D] hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {reporteSeleccionado.estado === 'solucionado'
                        ? 'Reactivar incidente'
                        : 'Marcar solucionado'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resumen operativo Top 5 cuadras (RF-05 / CU-03) */}
        <div className="xl:col-span-5">
          <div className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Resumen operativo · Top 5 cuadras críticas
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Priorizadas por puntaje acumulado, confirmaciones y reglas de intervención
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print flex min-h-[38px] items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 text-[#0B3B69] dark:text-sky-400" />
                Imprimir
              </button>
            </div>

            {resumenTop5.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No hay cuadras activas para priorizar con los filtros actuales.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {resumenTop5.map((item, indice) => {
                  const viaObj = vias.find((v) => v.id === item.cuadraId);
                  return (
                    <div
                      key={item.cuadraId}
                      className="print-break-inside-avoid p-4 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-semibold text-[#0B3B69] dark:text-sky-400 tabular-nums">
                              #{indice + 1}
                            </span>
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {item.cuadraId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.sector}</span>
                            <span aria-hidden="true">·</span>
                            <span>{ETIQUETAS_VIA[item.tipoVia]}</span>
                          </div>
                          <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.nombre}
                          </h3>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                            {item.puntajeAcumulado} pts
                          </p>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {item.totalReportes} inc. · {item.reportesAltoPico} Alto pico
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[#0B3B69] dark:text-sky-400">
                            Acción: {item.recomendacion}
                          </p>
                          {viaObj && (
                            <button
                              type="button"
                              onClick={() =>
                                setPuntoEnfocado({
                                  lat: viaObj.lat,
                                  lng: viaObj.lng,
                                  zoom: 17,
                                })
                              }
                              className="no-print flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-[#0B3B69] dark:text-slate-400 dark:hover:text-sky-400 whitespace-nowrap cursor-pointer"
                            >
                              <MapPin className="h-3 w-3" />
                              Ubicar
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                            Regla {item.reglaId}:
                          </span>{' '}
                          {item.reglaTexto}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="no-print mt-3 text-right text-[11px] text-slate-500 dark:text-slate-400">
            Hora pico configurada: {criterios.horas_pico.join(' · ')}
            {reportesFiltrados.length > 0 && (
              <span>
                {' · '}Último registro visible:{' '}
                {extraerHora(reportesFiltrados[reportesFiltrados.length - 1].fecha_hora)}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
