import { useEffect, useMemo, useState } from 'react';
import {
  cargarReportesLocales,
  combinarSinDuplicados,
  guardarReportesLocales,
  limpiarReportesLocales,
} from './logic/captura';
import { recalcularReportes } from './logic/criticidad';
import { CriteriosCriticidad, CuadraVia, Reporte } from './types';
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
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string>('');

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
    return recalcularReportes(combinados, vias, criteriosActivos);
  }, [reportesBase, reportesLocales, vias, criteriosActivos]);

  const manejarGuardarReporte = (nuevo: Reporte) => {
    setReportesLocales((prev) => {
      const actualizados = [nuevo, ...prev];
      guardarReportesLocales(actualizados);
      return actualizados;
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
  };

  const enlaces: { id: VistaActiva; etiqueta: string }[] = [
    { id: 'tablero', etiqueta: 'Tablero' },
    { id: 'captura', etiqueta: 'Captura rápida' },
    { id: 'registros', etiqueta: 'Registros' },
    { id: 'modelo', etiqueta: 'Modelo y reglas' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Barra superior: contrato estricto de 3 zonas */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => setVista('tablero')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
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
                      ? 'border-[#0B3B69] text-[#0B3B69]'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
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
              className="min-h-[40px] bg-[#0B3B69] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#082c4f] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reportar incidente
            </button>
          </div>
        </div>

        {/* Navegación móvil compacta */}
        <nav
          aria-label="Navegación móvil"
          className="flex items-center justify-around border-t border-slate-100 bg-white px-2 py-1.5 md:hidden"
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
                    ? 'border-b-2 border-[#0B3B69] text-[#0B3B69]'
                    : 'text-slate-600'
                }`}
              >
                {item.etiqueta}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Contenido principal */}
      <main className="flex-1">
        {cargando ? (
          <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6">
            <div className="space-y-4 border border-slate-200 bg-white p-6">
              <div className="h-6 w-64 animate-pulse bg-slate-200" />
              <div className="h-[420px] w-full animate-pulse bg-slate-100" />
            </div>
          </div>
        ) : errorCarga || !criteriosActivos || !criteriosBase ? (
          <div className="mx-auto max-w-xl px-4 py-16 text-center">
            <p className="text-base font-semibold text-[#DC2626]">
              No fue posible cargar los archivos de configuración
            </p>
            <p className="mt-1 text-xs text-slate-600">{errorCarga}</p>
          </div>
        ) : vista === 'tablero' ? (
          <TableroOperativo
            reportes={todosLosReportes}
            reportesLocalesCount={reportesLocales.length}
            vias={vias}
            criterios={criteriosActivos}
            onImportarReportes={manejarImportarReportes}
            onLimpiarLocales={manejarLimpiarLocales}
            onIrACaptura={() => setVista('captura')}
          />
        ) : vista === 'captura' ? (
          <CapturaRapida
            vias={vias}
            criterios={criteriosActivos}
            reportesExistentes={todosLosReportes}
            onGuardarReporte={manejarGuardarReporte}
            onIrATablero={() => setVista('tablero')}
          />
        ) : vista === 'registros' ? (
          <TablaRegistros
            reportes={todosLosReportes}
            vias={vias}
            criterios={criteriosActivos}
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

      <footer className="no-print border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6">
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
