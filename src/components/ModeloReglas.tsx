import React, { useMemo, useState } from 'react';
import { Download, Printer, RotateCcw } from 'lucide-react';
import { calcularCriticidad, obtenerFranja } from '../logic/criticidad';
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

const ARCHIVOS_PROYECTO: { archivo: string; capa: string; responsabilidad: string }[] = [
  {
    archivo: 'index.html / src/App.tsx',
    capa: 'Presentación',
    responsabilidad:
      'Carga los archivos JSON, coordina la navegación (Tablero, Captura rápida, Registros, Modelo y reglas), persiste reportes y confirmaciones (+1) en localStorage y sincroniza el tema claro/oscuro/automático.',
  },
  {
    archivo: 'src/components/CapturaRapida.tsx',
    capa: 'Presentación',
    responsabilidad:
      'Formulario móvil (<30 s con cronómetro) para marcar ubicación en mapa/GPS/buscador, elegir categoría/actor, validar presencia de vehículo, pixelar rostros/placas o confirmar con "Volver a reportar (+1)".',
  },
  {
    archivo: 'src/components/TableroOperativo.tsx',
    capa: 'Presentación',
    responsabilidad:
      'Tablero de supervisión con filtros en vivo, alertas por proximidad (15–30 m), mapa de calor, Top 5 cuadras críticas imprimible y exportación/importación JSON sin duplicados.',
  },
  {
    archivo: 'src/components/MapaSantaMarta.tsx',
    capa: 'Presentación',
    responsabilidad:
      'Mapa base OpenStreetMap, capa de calor Leaflet.heat en panel translúcido (con estructuras viales visibles), zonas agrupadas por radio y marcadores individuales interactivos.',
  },
  {
    archivo: 'src/logic/criticidad.ts',
    capa: 'Lógica',
    responsabilidad:
      'Función pura calcularCriticidad() que cruza categoría, tipo_via de vias.json y franja horaria contra criterios.json para devolver puntaje (0–9) y nivel (Bajo, Medio, Alto).',
  },
  {
    archivo: 'src/logic/filtros.ts',
    capa: 'Lógica',
    responsabilidad:
      'Itera sobre todos los reportes con condiciones acumulativas (sector, cuadra, franja, rango horario, categoría, actor y nivel) y calcula porcentajes por categoría.',
  },
  {
    archivo: 'src/logic/resumen.ts',
    capa: 'Lógica',
    responsabilidad:
      'Agrupa incidentes activos por cuadra, pondera confirmaciones (+1), ordena el Top 5 por puntaje acumulado y aplica las reglas R1–R5 de intervención.',
  },
  {
    archivo: 'src/logic/proximidad.ts',
    capa: 'Lógica',
    responsabilidad:
      'Agrupa reportes cercanos del mismo tipo en un radio configurable (15–30 m), calcula tiempo entre primer y último reporte y pondera el peso térmico por criticidad, confirmaciones, antigüedad y estado.',
  },
  {
    archivo: 'src/logic/captura.ts / busqueda.ts',
    capa: 'Lógica',
    responsabilidad:
      'Redimensionamiento de fotos a max 800 px, pixelación selectiva en canvas, gestión de localStorage, deduplicación por id y geocodificación local/Nominatim de Santa Marta.',
  },
  {
    archivo: 'public/datos/*.json',
    capa: 'Datos',
    responsabilidad:
      'reportes.json (30 registros de Calle 29H3 y Villa Marbella), vias.json (6 cuadras clasificadas) y criterios.json (pesos, horas pico y rangos modificables sin tocar código).',
  },
  {
    archivo: 'server.ts',
    capa: 'Servicios API',
    responsabilidad:
      'Proxy Express para detección de rostros/placas (/api/detectar-privacidad), verificación de vehículos en evidencia (/api/validar-evidencia) y búsqueda de direcciones (/api/buscar-direccion).',
  },
];

const BITACORA_FALLOS_IA: {
  id: string;
  loQueSePidio: string;
  loQueEntrego: string;
  comoLoNotaron: string;
  comoLoCorrigieron: string;
  instruccionFinal: string;
}[] = [
  {
    id: 'Fallo 1',
    loQueSePidio: 'Integrar la capa de calor con Leaflet.heat sobre OpenStreetMap usando Vite y TypeScript.',
    loQueEntrego: 'Llamada directa a L.heatLayer(...), que lanzaba "L.heatLayer is not a function" en el empaquetado ESM de leaflet.heat v1.0.1.',
    comoLoNotaron: 'Al cargar el Tablero en el navegador, la capa de calor no se dibujaba y la consola mostraba error de constructor indefinido.',
    comoLoCorrigieron: 'Se creó src/logic/leafletSetup.ts importando la clase HeatLayer de leaflet.heat y envolviéndola en crearCapaCalor() con ResizeObserver.',
    instruccionFinal: 'Inspecciona el export real de leaflet.heat v1.0.1 e instancia HeatLayer mediante un adaptador tipado en leafletSetup.ts antes de añadirlo al mapa.',
  },
  {
    id: 'Fallo 2',
    loQueSePidio: 'Mostrar el mapa de calor en tiempo real junto con modo oscuro en toda la aplicación.',
    loQueEntrego: 'Tiles oscuros sin detalle predial y un canvas térmico opaco que tapaba las calles y edificaciones de la Calle 29H3 y Villa Marbella.',
    comoLoNotaron: 'Al revisar el mapa en modo claro y oscuro, las estructuras de las manzanas y calles quedaban ocultas bajo manchas sólidas.',
    comoLoCorrigieron: 'Se mantuvo OpenStreetMap con filtro CSS en .mapa-oscuro .leaflet-tile-pane y se movió el calor a un heatmapPane dedicado con opacidad 0.62 y blur 16.',
    instruccionFinal: 'Conserva OpenStreetMap para mostrar calles y edificaciones en ambos temas y ubica el mapa de calor en un pane translúcido debajo de los marcadores.',
  },
  {
    id: 'Fallo 3',
    loQueSePidio: 'Validar con IA que las fotografías adjuntas en Captura rápida representen evidencia real.',
    loQueEntrego: 'Un validador estricto que bloqueaba fotos válidas por ligero desenfoque o bajo contraste antes de enviarlas.',
    comoLoNotaron: 'Al subir fotos reales de celular ligeramente movidas o con poca luz, el botón "Guardar reporte" quedaba bloqueado injustificadamente.',
    comoLoCorrigieron: 'Se eliminó el bloqueo previo por contraste/borrosidad en captura.ts y se ajustó /api/validar-evidencia para exigir únicamente presencia de al menos un vehículo.',
    instruccionFinal: 'Acepta fotografías borrosas o movidas y bloquea la publicación únicamente cuando no se observe ningún vehículo en la imagen.',
  },
];

const ROLES_EQUIPO = [
  {
    rol: 'Analista de campo y privacidad',
    responsabilidad:
      'Clasificación de cuadras de Calle 29H3 y Villa Marbella, recorridos en hora pico y valle (30 registros) y verificación de pixelación de rostros y placas.',
  },
  {
    rol: 'Integrador del mapa e instrucciones para la IA',
    responsabilidad:
      'Mapa base OpenStreetMap, capa de calor Leaflet.heat, zonas acumulativas (15–30 m), buscador preciso y redacción/ajuste de prompts para la IA.',
  },
  {
    rol: 'Ingeniero de lógica y clasificación',
    responsabilidad:
      'Diseño de criterios.json, índice de criticidad, filtros acumulativos sin recarga y reglas R1–R5 del resumen operativo.',
  },
  {
    rol: 'Diseñador de interfaz y documentador',
    responsabilidad:
      'Formulario de captura rápida (<30 s con cronómetro), tablero legible con modo oscuro, bitácora de iteración y diagrama de arquitectura.',
  },
];

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

  const resumenCampo = useMemo(() => {
    let pico = 0;
    let valle = 0;
    let alto = 0;
    const porCuadra = new Map<string, { pico: number; valle: number; total: number }>();

    for (const v of vias) {
      porCuadra.set(v.id, { pico: 0, valle: 0, total: 0 });
    }

    for (const r of reportes) {
      const fr = obtenerFranja(r.fecha_hora, criteriosActivos);
      if (fr === 'pico') pico += 1;
      else valle += 1;
      if (r.criticidad.nivel === 'Alto') alto += 1;

      const actual = porCuadra.get(r.cuadra) ?? { pico: 0, valle: 0, total: 0 };
      if (fr === 'pico') actual.pico += 1;
      else actual.valle += 1;
      actual.total += 1;
      porCuadra.set(r.cuadra, actual);
    }

    return { total: reportes.length, pico, valle, alto, porCuadra };
  }, [reportes, vias, criteriosActivos]);

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

  const descargarCriteriosJSON = () => {
    const blob = new Blob([JSON.stringify(criteriosActivos, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'criterios.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6">
      {/* Encabezado visible solo al imprimir */}
      <div className="print-only mb-4 border-b border-slate-400 pb-3">
        <h1 className="text-xl font-bold text-black">
          Vigía Vial Santa Marta · Arquitectura, Bitácora y Anexo de Campo (Reto No. 2)
        </h1>
        <p className="mt-1 text-xs text-slate-700">
          Universidad del Magdalena · Ingeniería de Sistemas · Zona: Calle 29H3 y Villa Marbella ({resumenCampo.total} registros)
        </p>
      </div>

      <div className="no-print flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Transparencia algorítmica y documentación del Reto No. 2 · criterios.json, vias.json, arquitectura y bitácora
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Modelo de criticidad, reglas y sustentación
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={descargarCriteriosJSON}
            className="flex min-h-[40px] items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-[#0B3B69] dark:text-sky-400" />
            Descargar criterios.json
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-[40px] items-center gap-1.5 border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-[#0B3B69] dark:text-sky-400" />
            Imprimir anexo / bitácora
          </button>

          {criteriosModificados && (
            <button
              type="button"
              onClick={onRestablecerCriterios}
              className="flex min-h-[40px] items-center gap-1.5 border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restablecer pesos
            </button>
          )}
        </div>
      </div>

      {/* Simulador de pesos y verificación manual de 2 casos */}
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

      {/* Justificación de pesos y reglas + Anexo de evidencia de campo */}
      <div className="print-break-inside-avoid grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Justificación del modelo de criticidad (criterios.json)
          </h2>
          <div className="space-y-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            <p>
              <strong className="text-slate-900 dark:text-slate-100">Categoría (2–3 pts):</strong>{' '}
              <em>Doble fila</em> (3 pts) y <em>bloqueo de rampa/cebra</em> (3 pts) reciben la puntuación máxima porque suprimen un carril completo de circulación o impiden el paso seguro de adultos mayores y personas en silla de ruedas. La <em>invasión de andén</em> (2 pts) obliga al peatón a caminar por la calzada, pero alcanza nivel Alto cuando coincide con vía arterial y hora pico.
            </p>
            <p>
              <strong className="text-slate-900 dark:text-slate-100">Tipo de vía (3 vs 1 pt):</strong>{' '}
              Los tramos de <strong>Calle 29H3</strong> (<span className="font-mono">C29H3-T1..T3</span>) se clasifican como <em>arteriales</em> (3 pts) por conectar el flujo universitario y comercial cercano a la Universidad del Magdalena; las calles internas de <strong>Villa Marbella</strong> (<span className="font-mono">VM-T1..T3</span>) se clasifican como <em>secundarias</em> (1 pt).
            </p>
            <p>
              <strong className="text-slate-900 dark:text-slate-100">Franja horaria (3 vs 1 pt):</strong>{' '}
              Las ventanas pico (<span className="font-mono">06:30–08:30</span>, <span className="font-mono">11:30–14:00</span> y <span className="font-mono">17:00–19:30</span>) corresponden a ingreso, salida de mediodía y retorno de jornada académica y comercial.
            </p>
            <p>
              <strong className="text-slate-900 dark:text-slate-100">Pensamiento computacional (Filtros y CU-01):</strong>{' '}
              <span className="font-mono">filtrarReportes()</span> opera como una <em>repetición con condición</em>: recorre cada registro y lo conserva únicamente si cumple sector, cuadra, franja, rango horario, categoría, actor y nivel seleccionados.
            </p>
          </div>
        </div>

        <div className="space-y-3 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Anexo de evidencia de campo (dos recorridos)
            </h2>
            <span className="font-mono text-xs font-semibold text-[#0B3B69] dark:text-sky-400 tabular-nums">
              {resumenCampo.total} registros · {resumenCampo.alto} Alto
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Total levantados</p>
              <p className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {resumenCampo.total}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Recorrido hora pico</p>
              <p className="mt-0.5 font-mono text-base font-bold text-[#DC2626] dark:text-red-400 tabular-nums">
                {resumenCampo.pico}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Recorrido hora valle</p>
              <p className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {resumenCampo.valle}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <th className="px-3 py-2">Cuadra</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2 text-right">Pico</th>
                  <th className="px-3 py-2 text-right">Valle</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {vias.map((v) => {
                  const stat = resumenCampo.porCuadra.get(v.id) ?? { pico: 0, valle: 0, total: 0 };
                  return (
                    <tr key={v.id}>
                      <td className="px-3 py-1.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {v.id}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{v.sector}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{stat.pico}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{stat.valle}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {stat.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Cumplimiento Ley 1581 de 2012: los registros precargados omiten datos personales y toda foto ciudadana cargada pixela selectivamente rostros y placas antes de guardarse en localStorage.
          </p>
        </div>
      </div>

      {/* Diagrama de arquitectura del equipo (Figura 1 adaptada) + Guía de archivos */}
      <div className="print-break-inside-avoid space-y-4 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Diagrama de arquitectura del sistema (Versión del equipo · Figura 1)
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Organización en cuatro capas reales del prototipo: Presentación, Lógica de negocio, Datos locales y Servicios externos.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="border border-sky-200 bg-sky-50/60 p-3.5 text-xs dark:border-sky-900 dark:bg-sky-950/30">
            <p className="font-mono text-[11px] font-bold uppercase text-[#0B3B69] dark:text-sky-400">
              1. Presentación (UI)
            </p>
            <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
              <li>• <span className="font-mono">CapturaRapida.tsx</span> (&lt;30 s)</li>
              <li>• <span className="font-mono">TableroOperativo.tsx</span></li>
              <li>• <span className="font-mono">MapaSantaMarta.tsx</span></li>
              <li>• <span className="font-mono">BuscadorUbicacion.tsx</span></li>
              <li>• <span className="font-mono">TablaRegistros.tsx</span> / <span className="font-mono">ModeloReglas.tsx</span></li>
            </ul>
          </div>

          <div className="border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-700 dark:bg-slate-950">
            <p className="font-mono text-[11px] font-bold uppercase text-slate-800 dark:text-slate-200">
              2. Lógica (Módulos TS)
            </p>
            <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
              <li>• <span className="font-mono">captura.ts</span> (foto ≤800 px, pixelado, JSON)</li>
              <li>• <span className="font-mono">criticidad.ts</span> (puntaje y nivel)</li>
              <li>• <span className="font-mono">filtros.ts</span> (selección sin recarga)</li>
              <li>• <span className="font-mono">resumen.ts</span> (Top 5 y reglas R1–R5)</li>
              <li>• <span className="font-mono">proximidad.ts</span> (radio 15–30 m y peso calor)</li>
            </ul>
          </div>

          <div className="border border-emerald-200 bg-emerald-50/50 p-3.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/25">
            <p className="font-mono text-[11px] font-bold uppercase text-[#15803D] dark:text-emerald-400">
              3. Datos locales
            </p>
            <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
              <li>• <span className="font-mono">reportes.json</span> ({resumenCampo.total} reg. de campo)</li>
              <li>• <span className="font-mono">vias.json</span> ({vias.length} cuadras clasificadas)</li>
              <li>• <span className="font-mono">criterios.json</span> (pesos y horas pico)</li>
              <li>• <span className="font-mono">localStorage</span> (nuevos reportes y +1)</li>
            </ul>
          </div>

          <div className="border border-amber-200 bg-amber-50/60 p-3.5 text-xs dark:border-amber-900 dark:bg-amber-950/25">
            <p className="font-mono text-[11px] font-bold uppercase text-[#D97706] dark:text-amber-400">
              4. Servicios externos / API
            </p>
            <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
              <li>• OpenStreetMap + Leaflet.heat</li>
              <li>• <span className="font-mono">/api/buscar-direccion</span> (Nominatim)</li>
              <li>• <span className="font-mono">/api/validar-evidencia</span> (vehículo)</li>
              <li>• <span className="font-mono">/api/detectar-privacidad</span> (rostros/placas)</li>
            </ul>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <th className="px-4 py-2.5">Archivo / Módulo</th>
                <th className="px-4 py-2.5">Capa</th>
                <th className="px-4 py-2.5">Responsabilidad exacta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {ARCHIVOS_PROYECTO.map((item) => (
                <tr key={item.archivo} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {item.archivo}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {item.capa}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {item.responsabilidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bitácora de iteración con IA (5 columnas) y preguntas de ingeniería */}
      <div className="print-break-inside-avoid space-y-4 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Bitácora de iteración con IA (Registro de fallos y correcciones)
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Documentación de fallos reales detectados en pruebas y su resolución técnica según el formato del Reto No. 2.
          </p>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <th className="px-3 py-2.5">Registro</th>
                <th className="px-3 py-2.5">Lo que se pidió</th>
                <th className="px-3 py-2.5">Lo que entregó</th>
                <th className="px-3 py-2.5">Cómo lo notaron</th>
                <th className="px-3 py-2.5">Cómo lo corrigieron</th>
                <th className="px-3 py-2.5">Instrucción final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 align-top dark:divide-slate-800">
              {BITACORA_FALLOS_IA.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#0B3B69] dark:text-sky-400 whitespace-nowrap">
                    {f.id}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{f.loQueSePidio}</td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{f.loQueEntrego}</td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{f.comoLoNotaron}</td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{f.comoLoCorrigieron}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                    {f.instruccionFinal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 text-xs dark:border-slate-800 md:grid-cols-3">
          <div className="border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              1. ¿Cómo definieron las reglas de criticidad y por qué esos pesos?
            </p>
            <p className="mt-1.5 leading-relaxed text-slate-600 dark:text-slate-300">
              Sumando 3 componentes independientes (categoría + vía + franja, máximo 9 pts). Se dio mayor peso a doble fila/bloqueo de rampa (3 pts) y vía arterial (3 pts) porque multiplican la congestión sobre la Calle 29H3 frente a las vías internas de Villa Marbella.
            </p>
          </div>
          <div className="border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              2. ¿Qué problemas tuvieron en la calle y con la IA?
            </p>
            <p className="mt-1.5 leading-relaxed text-slate-600 dark:text-slate-300">
              En campo, proteger la privacidad evitando capturar rostros y placas directamente; con la IA, ajustar Leaflet.heat para mantener visibles calles/edificaciones y evitar rechazos excesivos en fotos reales algo borrosas exigiendo únicamente la presencia de un vehículo.
            </p>
          </div>
          <div className="border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              3. ¿Qué patrones encontraron en la zona?
            </p>
            <p className="mt-1.5 leading-relaxed text-slate-600 dark:text-slate-300">
              En la Calle 29H3 predominan vehículos particulares, motocicletas y casos puntuales de carga descargando en doble fila e invasión de andén entre las 11:30 y 14:00 (nivel Alto), mientras que en Villa Marbella predominan vehículos particulares y motocicletas sobre rampas peatonales y bordes de andén.
            </p>
          </div>
        </div>
      </div>

      {/* Tabla de cuadras vias.json y roles del equipo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
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
                  <th className="px-4 py-2.5 text-right">Coordenadas</th>
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

        <div className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Roles del equipo (Sustentación Reto No. 2)
            </h2>
          </div>
          <div className="divide-y divide-slate-200 text-xs dark:divide-slate-800">
            {ROLES_EQUIPO.map((item) => (
              <div key={item.rol} className="px-5 py-3">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{item.rol}</p>
                <p className="mt-0.5 text-slate-600 dark:text-slate-400">{item.responsabilidad}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
