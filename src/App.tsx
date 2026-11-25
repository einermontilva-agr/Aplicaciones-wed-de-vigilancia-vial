import { useEffect, useMemo, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  cargarOverridesReportes,
  cargarReportesLocales,
  combinarSinDuplicados,
  guardarOverridesReportes,
  guardarReportesLocales,
  limpiarReportesLocales,
  obtenerFechaHoraLocalActual,
} from './logic/captura';
import { recalcularReportes } from './logic/criticidad';
import { RADIO_PROXIMIDAD_DEFECTO } from './logic/proximidad';
import {
  aplicarTemaAlDocumento,
  cargarTemaPreferido,
  guardarTemaPreferido,
  TemaModo,
} from './logic/tema';
import { CriteriosCriticidad, CuadraVia, OverrideReporte, Reporte } from './types';
import { CapturaRapida } from './components/CapturaRapida';
import { ModeloReglas } from './components/ModeloReglas';
import { TablaRegistros } from './components/TablaRegistros';
import { TableroOperativo } from './components/TableroOperativo';

type VistaActiva = 'tablero' | 'captura' | 'registros' | 'modelo';

export default function App() {
  const [vista, setVista] = useState<VistaActiva>('tablero');
  const [vias, setVias] = useState<CuadraVia[]>([]);
  const [criteriosBase, setCriteriosBase] = useState<CriteriosCriticidad | null>(null);
  const [criteriosActivos, setCriteriosActivos] = useState<CriteriosCriticidad | null>(null);
  const [reportesBase, setReportesBase] = useState<Reporte[]>([]);
  const [reportesLocales, setReportesLocales] = useState<Reporte[]>([]);
  const [overridesReportes, setOverridesReportes] = useState<Record<string, OverrideReporte>>(() =>
    cargarOverridesReportes()
  );
  const [radioProximidad, setRadioProximidad] = useState<number>(RADIO_PROXIMIDAD_DEFECTO);
  const [temaModo, setTemaModo] = useState<TemaModo>(() => cargarTemaPreferido());
  const [esOscuro, setEsOscuro] = useState<boolean>(() => aplicarTemaAlDocumento(cargarTemaPreferido()));
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string>('');

  // Sincronización de tema (claro / oscuro / automático del dispositivo)
  useEffect(() => {
    guardarTemaPreferido(temaModo);
    setEsOscuro(aplicarTemaAlDocumento(temaModo));

    if (temaModo !== 'auto' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const manejarCambioSistema = () => {
      setEsOscuro(aplicarTemaAlDocumento('auto'));
    };

    media.addEventListener('change', manejarCambioSistema);
    return () => media.removeEventListener('change', manejarCambioSistema);
  }, [temaModo]);

  useEffect(() => {
    let cancelado = false;

    async function cargarDatosIniciales() {
      setCargando(true);
      setErrorCarga('');
      try {
        const [resVias, resCriterios, resReportes] = await Promise.all([
          fetch('/datos/vias.json'),
          fetch('/datos/criterios.json'),
          fetch('/datos/reportes.json'),
        ]);

        if (!resVias.ok || !resCriterios.ok || !resReportes.ok) {
          throw new Error('No se pudieron cargar los archivos JSON de datos.');
        }

        const [datosVias, datosCriterios, datosReportes] = await Promise.all([
          resVias.json() as Promise<CuadraVia[]>,
          resCriterios.json() as Promise<CriteriosCriticidad>,
          resReportes.json() as Promise<Reporte[]>,
        ]);

        if (cancelado) return;

        setVias(datosVias);
        setCriteriosBase(datosCriterios);
        setCriteriosActivos(datosCriterios);
        setReportesBase(datosReportes);
        setReportesLocales(cargarReportesLocales());
      } catch (err) {
        if (!cancelado) {
          setErrorCarga(
            err instanceof Error
              ? err.message
              : 'Error cargando los datos de Santa Marta.'
          );
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargarDatosIniciales();
    return () => {
      cancelado = true;
    };
  }, []);

  const todosLosReportes = useMemo(() => {
    if (!criteriosActivos || vias.length === 0) return [];
    const { combinados } = combinarSinDuplicados(reportesBase, reportesLocales);
    const conOverrides = combinados.map((r) => {
      const ov = overridesReportes[r.id];
      if (!ov) {
        return {
          ...r,
          confirmaciones: r.confirmaciones ?? 1,
          estado: r.estado ?? ('activo' as const),
        };
      }
      return {
        ...r,
        confirmaciones: ov.confirmaciones ?? r.confirmaciones ?? 1,
        ultima_confirmacion: ov.ultima_confirmacion ?? r.ultima_confirmacion,
        estado: ov.estado ?? r.estado ?? 'activo',
        solucionado_en: ov.solucionado_en ?? r.solucionado_en,
        foto: ov.foto ?? r.foto,
      };
    });
    return recalcularReportes(conOverrides, vias, criteriosActivos);
  }, [reportesBase, reportesLocales, overridesReportes, vias, criteriosActivos]);

  const manejarGuardarReporte = (nuevo: Reporte) => {
    setReportesLocales((prev) => {
      const actualizados = [nuevo, ...prev];
      guardarReportesLocales(actualizados);
      return actualizados;
    });
  };

  const manejarConfirmarReporte = (reporteId: string) => {
    const ahoraLocal = obtenerFechaHoraLocalActual();
    const existente = todosLosReportes.find((r) => r.id === reporteId);
    const actualCount = Math.max(1, existente?.confirmaciones ?? 1);

    setOverridesReportes((prev) => {
      const previo = prev[reporteId] ?? {};
      const siguiente: Record<string, OverrideReporte> = {
        ...prev,
        [reporteId]: {
          ...previo,
          confirmaciones: Math.max(actualCount, previo.confirmaciones ?? 1) + 1,
          ultima_confirmacion: ahoraLocal,
          estado: 'activo',
        },
      };
      guardarOverridesReportes(siguiente);
      return siguiente;
    });
  };

  const manejarToggleSolucionado = (reporteId: string) => {
    const ahoraLocal = obtenerFechaHoraLocalActual();
    const existente = todosLosReportes.find((r) => r.id === reporteId);
    const nuevoEstado = existente?.estado === 'solucionado' ? 'activo' : 'solucionado';

    setOverridesReportes((prev) => {
      const previo = prev[reporteId] ?? {};
      const siguiente: Record<string, OverrideReporte> = {
        ...prev,
        [reporteId]: {
          ...previo,
          estado: nuevoEstado,
          solucionado_en: nuevoEstado === 'solucionado' ? ahoraLocal : undefined,
        },
      };
      guardarOverridesReportes(siguiente);
      return siguiente;
    });
  };

  const manejarActualizarFotoReporte = (reporteId: string, nuevaFoto: string) => {
    const estaEnLocales = reportesLocales.some((r) => r.id === reporteId);
    if (estaEnLocales) {
      setReportesLocales((prev) => {
        const actualizados = prev.map((r) =>
          r.id === reporteId ? { ...r, foto: nuevaFoto } : r
        );
        guardarReportesLocales(actualizados);
        return actualizados;
      });
      return;
    }

    setOverridesReportes((prev) => {
      const previo = prev[reporteId] ?? {};
      const siguiente: Record<string, OverrideReporte> = {
        ...prev,
        [reporteId]: {
          ...previo,
          foto: nuevaFoto,
        },
      };
      guardarOverridesReportes(siguiente);
      return siguiente;
    });
  };

  const manejarImportarReportes = (entrantes: Reporte[]) => {
    const existentes = [...reportesBase, ...reportesLocales];
    const { agregados, duplicados } = combinarSinDuplicados(existentes, entrantes);
    if (agregados.length > 0) {
      const marcados = agregados.map((r) => ({
        ...r,
        origen: r.origen ?? ('importado' as const),
      }));
      setReportesLocales((prev) => {
        const { combinados } = combinarSinDuplicados(prev, marcados);
        guardarReportesLocales(combinados);
        return combinados;
      });
    }
    return { agregados: agregados.length, duplicados };
  };

  const manejarLimpiarLocales = () => {
    limpiarReportesLocales();
    setReportesLocales([]);
    setOverridesReportes({});
  };

  const enlaces: { id: VistaActiva; etiqueta: string }[] = [
    { id: 'tablero', etiqueta: 'Tablero' },
    { id: 'captura', etiqueta: 'Captura rápida' },
    { id: 'registros', etiqueta: 'Registros' },
    { id: 'modelo', etiqueta: 'Modelo y reglas' },
  ];

  const opcionesTema: { id: TemaModo; etiqueta: string; Icono: typeof Sun }[] = [
    { id: 'claro', etiqueta: 'Claro', Icono: Sun },
    { id: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
    { id: 'auto', etiqueta: 'Automático', Icono: Monitor },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Barra superior: contrato estricto de 3 zonas */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => setVista('tablero')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Vigía Vial Santa Marta
          </button>

          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-6 md:flex"
          >
            {enlaces.map((item) => {
              const activo = vista === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setVista(item.id)}
                  className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activo
                      ? 'border-[#0B3B69] text-[#0B3B69] dark:border-sky-400 dark:text-sky-400'
                      : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {item.etiqueta}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setVista('captura')}
              className="min-h-[40px] bg-[#0B3B69] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#082c4f] dark:bg-sky-700 dark:hover:bg-sky-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reportar incidente
            </button>
          </div>
        </div>

        {/* Navegación móvil compacta */}
        <nav
          aria-label="Navegación móvil"
          className="flex items-center justify-around border-t border-slate-100 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900 md:hidden"
        >
          {enlaces.map((item) => {
            const activo = vista === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setVista(item.id)}
                className={`px-2 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                  activo
                    ? 'border-b-2 border-[#0B3B69] text-[#0B3B69] dark:border-sky-400 dark:text-sky-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.etiqueta}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Barra de preferencias de espacio de trabajo (Modo claro / oscuro / automático) */}
      <div className="no-print border-b border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6">
          <span className="text-slate-600 dark:text-slate-400">
            Calle 29H3 y Villa Marbella · Radio de agrupación:{' '}
            <strong className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {radioProximidad} m
            </strong>
          </span>

          <div
            className="flex items-center gap-1 border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950"
            role="group"
            aria-label="Seleccionar tema de interfaz"
          >
            {opcionesTema.map(({ id, etiqueta, Icono }) => {
              const activo = temaModo === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTemaModo(id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activo
                      ? 'bg-[#0B3B69] text-white dark:bg-sky-700'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <Icono className="h-3 w-3" />
                  <span>{etiqueta}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <main className="flex-1">
        {cargando ? (
          <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
            <div className="space-y-4 border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="h-6 w-64 animate-pulse bg-slate-200 dark:bg-slate-800" />
              <div className="h-[420px] w-full animate-pulse bg-slate-100 dark:bg-slate-800/60" />
            </div>
          </div>
        ) : errorCarga || !criteriosActivos || !criteriosBase ? (
          <div className="mx-auto max-w-xl px-4 py-16 text-center">
            <p className="text-base font-semibold text-[#DC2626] dark:text-red-400">
              No fue posible cargar los archivos de configuración
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{errorCarga}</p>
          </div>
        ) : vista === 'tablero' ? (
          <TableroOperativo
            reportes={todosLosReportes}
            reportesLocalesCount={reportesLocales.length + Object.keys(overridesReportes).length}
            vias={vias}
            criterios={criteriosActivos}
            radioProximidad={radioProximidad}
            onCambiarRadioProximidad={setRadioProximidad}
            onConfirmarReporte={manejarConfirmarReporte}
            onToggleSolucionado={manejarToggleSolucionado}
            onImportarReportes={manejarImportarReportes}
            onLimpiarLocales={manejarLimpiarLocales}
            onIrACaptura={() => setVista('captura')}
            esOscuro={esOscuro}
          />
        ) : vista === 'captura' ? (
          <CapturaRapida
            vias={vias}
            criterios={criteriosActivos}
            reportesExistentes={todosLosReportes}
            radioProximidad={radioProximidad}
            onGuardarReporte={manejarGuardarReporte}
            onConfirmarReporte={manejarConfirmarReporte}
            onIrATablero={() => setVista('tablero')}
            esOscuro={esOscuro}
          />
        ) : vista === 'registros' ? (
          <TablaRegistros
            reportes={todosLosReportes}
            vias={vias}
            criterios={criteriosActivos}
            onConfirmarReporte={manejarConfirmarReporte}
            onToggleSolucionado={manejarToggleSolucionado}
            onActualizarFotoReporte={manejarActualizarFotoReporte}
          />
        ) : (
          <ModeloReglas
            criteriosActivos={criteriosActivos}
            criteriosBase={criteriosBase}
            vias={vias}
            reportes={todosLosReportes}
            onActualizarCriterios={setCriteriosActivos}
            onRestablecerCriterios={() => setCriteriosActivos(criteriosBase)}
          />
        )}
      </main>

      <footer className="no-print border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-2 px-4 py-4 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:px-6">
          <span>
            Vigía Vial Santa Marta · Prototipo ciudadano de control de mal parqueo e invasión del espacio público
          </span>
          <span>
            Calle 29H3 y Villa Marbella · Datos en JSON locales y almacenamiento del navegador
          </span>
        </div>
      </footer>
    </div>
  );
}
