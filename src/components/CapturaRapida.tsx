import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  LocateFixed,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react';
import { calcularCriticidad } from '../logic/criticidad';
import {
  aplicarPixelacionEnZonas,
  detectarZonasPrivacidad,
  encontrarCuadraMasCercana,
  generarNuevoIdReporte,
  procesarYAnonimizarFoto,
} from '../logic/captura';
import {
  CategoriaObstruccion,
  CriteriosCriticidad,
  CuadraVia,
  ETIQUETAS_ACTOR,
  ETIQUETAS_CATEGORIA,
  ETIQUETAS_FRANJA,
  ETIQUETAS_VIA,
  Reporte,
  TipoActor,
  ZonaPrivacidad,
} from '../types';
import { MapaSantaMarta } from './MapaSantaMarta';

interface CapturaRapidaProps {
  vias: CuadraVia[];
  criterios: CriteriosCriticidad;
  reportesExistentes: Reporte[];
  onGuardarReporte: (nuevo: Reporte) => void;
  onIrATablero: () => void;
}

function obtenerFechaHoraLocalActual(): string {
  const ahora = new Date();
  const offset = ahora.getTimezoneOffset();
  const local = new Date(ahora.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

const CATEGORIAS_OPCIONES: { id: CategoriaObstruccion; titulo: string; detalle: string }[] = [
  {
    id: 'doble_fila',
    titulo: 'Doble fila o vía prohibida',
    detalle: 'Vehículo detenido reduciendo carril de circulación',
  },
  {
    id: 'bloqueo_rampa_cebra_paradero',
    titulo: 'Bloqueo de rampa, cebra o paradero',
    detalle: 'Obstrucción de paso peatonal, accesibilidad o parada',
  },
  {
    id: 'invasion_anden',
    titulo: 'Invasión de andén por comercio o mercancía',
    detalle: 'Mercancía, mesas o motos obligando al peatón a la calzada',
  },
];

const ACTORES_OPCIONES: TipoActor[] = [
  'vehiculo_particular',
  'motocicleta',
  'vehiculo_carga',
  'mobiliario_comercial',
];

export const CapturaRapida: React.FC<CapturaRapidaProps> = ({
  vias,
  criterios,
  reportesExistentes,
  onGuardarReporte,
  onIrATablero,
}) => {
  const primeraCuadra = vias[0];

  const [cuadraId, setCuadraId] = useState<string>(primeraCuadra?.id ?? 'C29H3-T2');
  const [coordenada, setCoordenada] = useState<{ lat: number; lng: number }>({
    lat: primeraCuadra?.lat ?? 11.2244,
    lng: primeraCuadra?.lng ?? -74.1909,
  });
  const [fechaHora, setFechaHora] = useState<string>(() => obtenerFechaHoraLocalActual());
  const [categoria, setCategoria] = useState<CategoriaObstruccion>('invasion_anden');
  const [actor, setActor] = useState<TipoActor>('mobiliario_comercial');
  const [observacion, setObservacion] = useState<string>('');

  const [fotoBaseOriginal, setFotoBaseOriginal] = useState<string | undefined>(undefined);
  const [fotoDataUrl, setFotoDataUrl] = useState<string | undefined>(undefined);
  const [fotoMeta, setFotoMeta] = useState<{ width: number; height: number; sizeKB: number } | null>(null);
  const [zonasPrivacidad, setZonasPrivacidad] = useState<ZonaPrivacidad[]>([]);
  const [avisoPrivacidad, setAvisoPrivacidad] = useState<string>('');
  const [errorPrivacidad, setErrorPrivacidad] = useState<string>('');
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [dibujoInicio, setDibujoInicio] = useState<{ x: number; y: number } | null>(null);
  const [dibujoActual, setDibujoActual] = useState<{ x: number; y: number } | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const [estadoGps, setEstadoGps] = useState<string>('');
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [ultimoGuardado, setUltimoGuardado] = useState<{
    reporte: Reporte;
    duracionSegundos: number | null;
  } | null>(null);
  const [errorForm, setErrorForm] = useState<string>('');

  // Cronómetro para verificar criterio de aceptación RF-01 (< 30 segundos)
  const [inicioPruebaMs, setInicioPruebaMs] = useState<number | null>(null);
  const [segundosTranscurridos, setSegundosTranscurridos] = useState<number>(0);
  const intervaloRef = useRef<number | null>(null);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);

  const iniciarCronometroSiNoCorre = () => {
    if (inicioPruebaMs !== null) return;
    const inicio = Date.now();
    setInicioPruebaMs(inicio);
    intervaloRef.current = window.setInterval(() => {
      setSegundosTranscurridos(Number(((Date.now() - inicio) / 1000).toFixed(1)));
    }, 100);
  };

  const reiniciarCronometro = () => {
    if (intervaloRef.current) {
      window.clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    setInicioPruebaMs(null);
    setSegundosTranscurridos(0);
  };

  const detenerCronometro = (): number | null => {
    if (inicioPruebaMs === null) return null;
    const total = Number(((Date.now() - inicioPruebaMs) / 1000).toFixed(1));
    if (intervaloRef.current) {
      window.clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    setSegundosTranscurridos(total);
    return total;
  };

  const desglose = useMemo(
    () =>
      calcularCriticidad(
        { categoria, cuadra: cuadraId, fecha_hora: fechaHora },
        vias,
        criterios
      ),
    [categoria, cuadraId, fechaHora, vias, criterios]
  );

  const cuadraActual = useMemo(
    () => vias.find((v) => v.id === cuadraId) ?? vias[0],
    [vias, cuadraId]
  );

  const manejarSeleccionMapa = (lat: number, lng: number) => {
    iniciarCronometroSiNoCorre();
    setCoordenada({ lat, lng });
    const { cuadra, distancia } = encontrarCuadraMasCercana(lat, lng, vias);
    if (cuadra) {
      setCuadraId(cuadra.id);
      setEstadoGps(`Ubicación fijada en mapa · cuadra asignada: ${cuadra.id} (a ${distancia} m)`);
    }
  };

  const manejarCambioCuadra = (id: string) => {
    iniciarCronometroSiNoCorre();
    setCuadraId(id);
    const encontrada = vias.find((v) => v.id === id);
    if (encontrada) {
      setCoordenada({ lat: encontrada.lat, lng: encontrada.lng });
      setEstadoGps(`Cuadra seleccionada: ${encontrada.nombre}`);
    }
  };

  const manejarUsarGPS = () => {
    iniciarCronometroSiNoCorre();
    if (!('geolocation' in navigator)) {
      setEstadoGps('Tu navegador no admite geolocalización. Toca el mapa o elige la cuadra.');
      return;
    }

    setBuscandoGps(true);
    setEstadoGps('Obteniendo señal GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoGps(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const { cuadra, distancia } = encontrarCuadraMasCercana(lat, lng, vias);

        // Si el usuario está a más de 3 km (p. ej. probando fuera de Santa Marta), mantenemos su vista centrada
        if (cuadra && distancia <= 3000) {
          setCoordenada({ lat, lng });
          setCuadraId(cuadra.id);
          setEstadoGps(`GPS capturado (±${Math.round(pos.coords.accuracy)} m) · Cuadra ${cuadra.id}`);
        } else if (cuadra) {
          setEstadoGps(
            `GPS detectado a ${(distancia / 1000).toFixed(1)} km de la zona piloto. Toca el mapa de Santa Marta o elige la cuadra manualmente.`
          );
        }
      },
      () => {
        setBuscandoGps(false);
        setEstadoGps('No se pudo obtener el GPS. Toca directamente una calle en el mapa o selecciona la cuadra.');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const reconstruirConZonas = async (baseOriginal: string, zonas: ZonaPrivacidad[]) => {
    const pixelada = await aplicarPixelacionEnZonas(baseOriginal, zonas, 11);
    setFotoDataUrl(pixelada.dataUrl);
    setFotoMeta({
      width: pixelada.width,
      height: pixelada.height,
      sizeKB: pixelada.sizeKB,
    });
  };

  const ejecutarDeteccionAutomatica = async (baseOriginal: string) => {
    setProcesandoFoto(true);
    setErrorPrivacidad('');
    setAvisoPrivacidad('Detectando rostros y placas automáticamente...');

    const { zonas, error } = await detectarZonasPrivacidad(baseOriginal);
    setZonasPrivacidad(zonas);

    if (error) {
      setErrorPrivacidad(error);
      setAvisoPrivacidad('Sin detección automática: dibuja un recuadro sobre rostros o placas si lo necesitas.');
      await reconstruirConZonas(baseOriginal, []);
      setProcesandoFoto(false);
      return;
    }

    const rostros = zonas.filter((z) => z.tipo === 'rostro').length;
    const placas = zonas.filter((z) => z.tipo === 'placa').length;
    if (zonas.length === 0) {
      setAvisoPrivacidad('No se detectaron rostros ni placas visibles; la foto se mantiene nítida.');
    } else {
      setAvisoPrivacidad(
        `Pixelación selectiva aplicada: ${rostros} rostro(s) y ${placas} placa(s) protegidos.`
      );
    }

    await reconstruirConZonas(baseOriginal, zonas);
    setProcesandoFoto(false);
  };

  const procesarFoto = async (file: File) => {
    setProcesandoFoto(true);
    setErrorForm('');
    setErrorPrivacidad('');
    try {
      const res = await procesarYAnonimizarFoto(file, 0, 800);
      setFotoBaseOriginal(res.dataUrl);
      setFotoDataUrl(res.dataUrl);
      setFotoMeta({ width: res.width, height: res.height, sizeKB: res.sizeKB });
      await ejecutarDeteccionAutomatica(res.dataUrl);
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : 'Error al procesar la fotografía.');
      setProcesandoFoto(false);
    }
  };

  const manejarCambioArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    iniciarCronometroSiNoCorre();
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    await procesarFoto(archivo);
  };

  const obtenerCoordNormalizada = (clientX: number, clientY: number) => {
    const el = previewContainerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(1000, Math.round(((clientX - rect.left) / rect.width) * 1000)));
    const y = Math.max(0, Math.min(1000, Math.round(((clientY - rect.top) / rect.height) * 1000)));
    return { x, y };
  };

  const manejarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!fotoBaseOriginal || procesandoFoto) return;
    const pt = obtenerCoordNormalizada(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDibujoInicio(pt);
    setDibujoActual(pt);
  };

  const manejarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dibujoInicio) return;
    const pt = obtenerCoordNormalizada(e.clientX, e.clientY);
    if (pt) setDibujoActual(pt);
  };

  const manejarPointerUp = async () => {
    if (!dibujoInicio || !dibujoActual || !fotoBaseOriginal) {
      setDibujoInicio(null);
      setDibujoActual(null);
      return;
    }

    const xmin = Math.min(dibujoInicio.x, dibujoActual.x);
    const xmax = Math.max(dibujoInicio.x, dibujoActual.x);
    const ymin = Math.min(dibujoInicio.y, dibujoActual.y);
    const ymax = Math.max(dibujoInicio.y, dibujoActual.y);

    setDibujoInicio(null);
    setDibujoActual(null);

    if (xmax - xmin < 15 || ymax - ymin < 15) return;

    const nuevaZona: ZonaPrivacidad = {
      id: `manual-${Date.now()}`,
      tipo: 'manual',
      xmin,
      ymin,
      xmax,
      ymax,
      origen: 'manual',
    };

    const actualizadas = [...zonasPrivacidad, nuevaZona];
    setZonasPrivacidad(actualizadas);
    await reconstruirConZonas(fotoBaseOriginal, actualizadas);
    setAvisoPrivacidad(`Zona manual agregada (${actualizadas.length} área(s) pixelada(s)).`);
  };

  const manejarDeshacerUltimaZona = async () => {
    if (!fotoBaseOriginal || zonasPrivacidad.length === 0) return;
    const actualizadas = zonasPrivacidad.slice(0, -1);
    setZonasPrivacidad(actualizadas);
    await reconstruirConZonas(fotoBaseOriginal, actualizadas);
    setAvisoPrivacidad(
      actualizadas.length === 0
        ? 'Se quitaron las zonas pixeladas; la fotografía vuelve a estar sin censura.'
        : `Quedan ${actualizadas.length} área(s) pixelada(s).`
    );
  };

  const manejarEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm('');

    if (!cuadraId || !coordenada.lat || !coordenada.lng) {
      setErrorForm('Debes seleccionar una cuadra o ubicación en el mapa.');
      return;
    }

    const duracion = detenerCronometro();
    const nuevoId = generarNuevoIdReporte(reportesExistentes);

    const nuevoReporte: Reporte = {
      id: nuevoId,
      origen: 'ciudadano',
      fecha_hora: fechaHora || obtenerFechaHoraLocalActual(),
      lat: coordenada.lat,
      lng: coordenada.lng,
      cuadra: cuadraId,
      categoria,
      actor,
      foto: fotoDataUrl,
      observacion: observacion.trim() || undefined,
      criticidad: {
        puntaje: desglose.puntaje,
        nivel: desglose.nivel,
      },
    };

    onGuardarReporte(nuevoReporte);
    setUltimoGuardado({ reporte: nuevoReporte, duracionSegundos: duracion });
    setObservacion('');
    setFotoBaseOriginal(undefined);
    setFotoDataUrl(undefined);
    setFotoMeta(null);
    setZonasPrivacidad([]);
    setAvisoPrivacidad('');
    setErrorPrivacidad('');
    if (inputFotoRef.current) inputFotoRef.current.value = '';
  };

  const colorNivel =
    desglose.nivel === 'Alto'
      ? 'text-[#DC2626]'
      : desglose.nivel === 'Medio'
        ? 'text-[#D97706]'
        : 'text-[#15803D]';

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Registro ciudadano y de campo · Meta menor a 30 segundos
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Reportar obstrucción en Santa Marta
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs">
            <Clock className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600">Cronómetro:</span>
            <span
              className={`font-mono font-semibold tabular-nums ${
                segundosTranscurridos > 30 ? 'text-[#DC2626]' : 'text-slate-900'
              }`}
            >
              {segundosTranscurridos.toFixed(1)} s
            </span>
          </div>
          <button
            type="button"
            onClick={reiniciarCronometro}
            className="flex min-h-[40px] items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            title="Reiniciar cronómetro de prueba"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar
          </button>
        </div>
      </div>

      {ultimoGuardado && (
        <div className="mb-6 flex flex-col justify-between gap-4 border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#15803D]" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Reporte {ultimoGuardado.reporte.id} guardado en el navegador
              </p>
              <p className="mt-0.5 text-xs text-slate-700">
                {ultimoGuardado.reporte.cuadra} · {ETIQUETAS_CATEGORIA[ultimoGuardado.reporte.categoria]} · Criticidad{' '}
                <strong className="font-mono">
                  {ultimoGuardado.reporte.criticidad.nivel} ({ultimoGuardado.reporte.criticidad.puntaje} pts)
                </strong>
                {ultimoGuardado.duracionSegundos !== null && (
                  <span> · Tiempo registrado: {ultimoGuardado.duracionSegundos} s</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onIrATablero}
            className="min-h-[44px] bg-[#0B3B69] px-4 py-2 text-xs font-semibold text-white hover:bg-[#082c4f] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver en mapa de calor
          </button>
        </div>
      )}

      <form onSubmit={manejarEnviar} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna izquierda: Ubicación en mapa y cuadra */}
        <div className="space-y-4 lg:col-span-6">
          <div className="border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                1. Ubicación en la zona
              </h2>
              <button
                type="button"
                onClick={manejarUsarGPS}
                disabled={buscandoGps}
                className="flex min-h-[40px] items-center gap-2 bg-[#0B3B69] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#082c4f] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <LocateFixed className="h-4 w-4" />
                {buscandoGps ? 'Ubicando...' : 'Usar mi ubicación'}
              </button>
            </div>

            <p className="mb-3 text-xs text-slate-600">
              Toca el punto exacto sobre el mapa de Santa Marta o selecciona la cuadra directamente.
            </p>

            <MapaSantaMarta
              reportes={[]}
              vias={vias}
              modoSeleccion={true}
              coordenadaSeleccionada={coordenada}
              onSeleccionarUbicacion={manejarSeleccionMapa}
              puntoEnfocado={{ lat: coordenada.lat, lng: coordenada.lng, zoom: 16 }}
              alturaClase="h-[260px] sm:h-[300px]"
              mostrarControlesCapas={false}
            />

            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="select-cuadra"
                  className="mb-1 block text-xs font-medium text-slate-700"
                >
                  Cuadra clasificada (vias.json)
                </label>
                <select
                  id="select-cuadra"
                  value={cuadraId}
                  onChange={(e) => manejarCambioCuadra(e.target.value)}
                  className="min-h-[44px] w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3B69] focus:outline-none"
                >
                  {vias.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} — {v.nombre} ({v.tipo_via === 'arterial' ? 'Arterial' : 'Secundaria'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5 font-mono tabular-nums">
                  <MapPin className="h-3.5 w-3.5 text-[#0B3B69]" />
                  {coordenada.lat.toFixed(5)}, {coordenada.lng.toFixed(5)}
                </span>
                <span>
                  {cuadraActual?.sector} · {ETIQUETAS_VIA[desglose.tipoVia]}
                </span>
              </div>

              {estadoGps && (
                <p className="text-xs text-slate-600">{estadoGps}</p>
              )}
            </div>
          </div>

          {/* Vista previa automática de criticidad */}
          <div className="border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Cálculo automático del índice (RF-02)
              </span>
              <span className={`font-mono text-sm font-bold tabular-nums ${colorNivel}`}>
                {desglose.nivel} · {desglose.puntaje} pts
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
              <div>
                <p className="text-slate-500">Categoría</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                  +{desglose.puntosCategoria} pts
                </p>
              </div>
              <div>
                <p className="text-slate-500">{ETIQUETAS_VIA[desglose.tipoVia]}</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                  +{desglose.puntosVia} pts
                </p>
              </div>
              <div>
                <p className="text-slate-500">{ETIQUETAS_FRANJA[desglose.franja]}</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                  +{desglose.puntosFranja} pts
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha: Categoría, Actor, Hora y Foto anonimizada */}
        <div className="space-y-4 lg:col-span-6">
          <div className="border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              2. Tipo de obstrucción
            </h2>
            <div className="space-y-2">
              {CATEGORIAS_OPCIONES.map((op) => {
                const activo = categoria === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => {
                      iniciarCronometroSiNoCorre();
                      setCategoria(op.id);
                    }}
                    className={`flex min-h-[52px] w-full items-center justify-between border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                      activo
                        ? 'border-[#0B3B69] bg-[#0B3B69]/5 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="pr-3">
                      <div className="text-sm font-semibold">{op.titulo}</div>
                      <div className="text-xs text-slate-500">{op.detalle}</div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                      +{criterios.categoria[op.id]} pts
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              3. Actor que obstruye
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ACTORES_OPCIONES.map((act) => {
                const activo = actor === act;
                return (
                  <button
                    key={act}
                    type="button"
                    onClick={() => {
                      iniciarCronometroSiNoCorre();
                      setActor(act);
                    }}
                    className={`min-h-[48px] border px-3.5 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer ${
                      activo
                        ? 'border-[#0B3B69] bg-[#0B3B69] text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {ETIQUETAS_ACTOR[act]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="input-fecha-hora"
                  className="mb-1 block text-xs font-medium text-slate-700"
                >
                  Fecha y hora del incidente
                </label>
                <input
                  id="input-fecha-hora"
                  type="datetime-local"
                  value={fechaHora}
                  onChange={(e) => {
                    iniciarCronometroSiNoCorre();
                    setFechaHora(e.target.value);
                  }}
                  className="min-h-[44px] w-full border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#0B3B69] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="input-observacion"
                  className="mb-1 block text-xs font-medium text-slate-700"
                >
                  Observación breve (opcional)
                </label>
                <input
                  id="input-observacion"
                  type="text"
                  maxLength={140}
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Ej. Vehículo detenido sobre la Calle 29H3"
                  className="min-h-[44px] w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B69] focus:outline-none"
                />
              </div>
            </div>

            {/* Carga de foto con pixelación selectiva automática de rostros y placas */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    4. Foto opcional (pixelación automática de rostros y placas)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Detectamos rostros y placas al instante para pixelar solo esas zonas y mantener nítido el resto.
                  </p>
                </div>

                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap">
                  <Camera className="h-4 w-4 text-[#0B3B69]" />
                  <span>
                    {procesandoFoto
                      ? 'Protegiendo foto...'
                      : fotoDataUrl
                        ? 'Cambiar foto'
                        : 'Tomar o adjuntar foto'}
                  </span>
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={manejarCambioArchivo}
                    className="sr-only"
                  />
                </label>
              </div>

              {fotoDataUrl && (
                <div className="mt-3 border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div
                    ref={previewContainerRef}
                    onPointerDown={manejarPointerDown}
                    onPointerMove={manejarPointerMove}
                    onPointerUp={manejarPointerUp}
                    className="relative mx-auto w-full max-w-md select-none overflow-hidden border border-slate-300 bg-slate-900 touch-none cursor-crosshair"
                  >
                    <img
                      src={fotoDataUrl}
                      alt="Evidencia con rostros y placas pixeladas"
                      draggable={false}
                      className="block h-auto w-full"
                    />

                    {dibujoInicio && dibujoActual && (
                      <div
                        className="pointer-events-none absolute border-2 border-[#0B3B69] bg-[#0B3B69]/20"
                        style={{
                          left: `${Math.min(dibujoInicio.x, dibujoActual.x) / 10}%`,
                          top: `${Math.min(dibujoInicio.y, dibujoActual.y) / 10}%`,
                          width: `${Math.abs(dibujoActual.x - dibujoInicio.x) / 10}%`,
                          height: `${Math.abs(dibujoActual.y - dibujoInicio.y) / 10}%`,
                        }}
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-medium text-[#15803D]">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span>{avisoPrivacidad || 'Foto lista para guardar'}</span>
                      </div>
                      {errorPrivacidad && (
                        <p className="text-[11px] text-[#D97706]">{errorPrivacidad}</p>
                      )}
                      <p className="text-[11px] text-slate-500">
                        {fotoMeta ? `${fotoMeta.width}×${fotoMeta.height} px · ${fotoMeta.sizeKB} KB · ` : ''}
                        Arrastra sobre la foto si deseas pixelar manualmente una zona adicional.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {fotoBaseOriginal && (
                        <button
                          type="button"
                          disabled={procesandoFoto}
                          onClick={() => ejecutarDeteccionAutomatica(fotoBaseOriginal)}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Re-detectar
                        </button>
                      )}
                      {zonasPrivacidad.length > 0 && (
                        <button
                          type="button"
                          disabled={procesandoFoto}
                          onClick={manejarDeshacerUltimaZona}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Deshacer ({zonasPrivacidad.length})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setFotoBaseOriginal(undefined);
                          setFotoDataUrl(undefined);
                          setFotoMeta(null);
                          setZonasPrivacidad([]);
                          setAvisoPrivacidad('');
                          setErrorPrivacidad('');
                          if (inputFotoRef.current) inputFotoRef.current.value = '';
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#DC2626] hover:underline cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar foto
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {errorForm && (
            <p className="text-sm font-medium text-[#DC2626]">{errorForm}</p>
          )}

          <button
            type="submit"
            className="min-h-[52px] w-full bg-[#0B3B69] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#082c4f] cursor-pointer"
          >
            Guardar reporte en mapa ({desglose.nivel} · {desglose.puntaje} pts)
          </button>
        </div>
      </form>
    </section>
  );
};
