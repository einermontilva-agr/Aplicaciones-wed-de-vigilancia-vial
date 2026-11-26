import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Eraser,
  Grid2x2,
  Loader2,
  LocateFixed,
  MapPin,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { calcularCriticidad } from '../logic/criticidad';
import {
  aplicarPixelacionEnZonas,
  detectarZonasPrivacidad,
  encontrarCuadraMasCercana,
  generarNuevoIdReporte,
  obtenerFechaHoraLocalActual,
  procesarYAnonimizarFoto,
  validarEvidenciaFoto,
} from '../logic/captura';
import { buscarIncidenteCercano } from '../logic/proximidad';
import {
  CategoriaObstruccion,
  CriteriosCriticidad,
  CuadraVia,
  ETIQUETAS_ACTOR,
  ETIQUETAS_CATEGORIA,
  ETIQUETAS_FRANJA,
  ETIQUETAS_VIA,
  Reporte,
  ResultadoBusquedaUbicacion,
  ResultadoValidacionFoto,
  TipoActor,
  ZonaPrivacidad,
} from '../types';
import { BuscadorUbicacion } from './BuscadorUbicacion';
import { MapaSantaMarta } from './MapaSantaMarta';

interface CapturaRapidaProps {
  vias: CuadraVia[];
  criterios: CriteriosCriticidad;
  reportesExistentes: Reporte[];
  radioProximidad: number;
  onGuardarReporte: (nuevo: Reporte) => void;
  onConfirmarReporte: (reporteId: string) => void;
  onIrATablero: () => void;
  esOscuro: boolean;
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
  radioProximidad,
  onGuardarReporte,
  onConfirmarReporte,
  onIrATablero,
  esOscuro,
}) => {
  const primeraCuadra = vias[0];

  const [cuadraId, setCuadraId] = useState<string>(primeraCuadra?.id ?? 'C29H3-T2');
  const [coordenada, setCoordenada] = useState<{ lat: number; lng: number }>({
    lat: primeraCuadra?.lat ?? 11.22462,
    lng: primeraCuadra?.lng ?? -74.19122,
  });
  const [puntoEnfocado, setPuntoEnfocado] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    seq?: number;
  } | null>(null);
  const [fechaHora, setFechaHora] = useState<string>(() => obtenerFechaHoraLocalActual());
  const [categoria, setCategoria] = useState<CategoriaObstruccion>('invasion_anden');
  const [actor, setActor] = useState<TipoActor>('mobiliario_comercial');
  const [observacion, setObservacion] = useState<string>('');

  const [fotoBaseOriginal, setFotoBaseOriginal] = useState<string | undefined>(undefined);
  const [fotoDataUrl, setFotoDataUrl] = useState<string | undefined>(undefined);
  const [fotoMeta, setFotoMeta] = useState<{ width: number; height: number; sizeKB: number } | null>(null);
  const [zonasPrivacidad, setZonasPrivacidad] = useState<ZonaPrivacidad[]>([]);
  const [tamanoPixel, setTamanoPixel] = useState<number>(14);
  const [avisoPrivacidad, setAvisoPrivacidad] = useState<string>('');
  const [errorPrivacidad, setErrorPrivacidad] = useState<string>('');
  const [validacionFoto, setValidacionFoto] = useState<ResultadoValidacionFoto | null>(null);
  const [confirmacionManualVehiculo, setConfirmacionManualVehiculo] = useState(false);
  const [errorValidacionServicio, setErrorValidacionServicio] = useState<string>('');
  const [validandoFoto, setValidandoFoto] = useState(false);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [dibujoInicio, setDibujoInicio] = useState<{ x: number; y: number } | null>(null);
  const [dibujoActual, setDibujoActual] = useState<{ x: number; y: number } | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const [estadoGps, setEstadoGps] = useState<string>('');
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [ultimoGuardado, setUltimoGuardado] = useState<{
    reporte: Reporte;
    duracionSegundos: number | null;
    esConfirmacion?: boolean;
  } | null>(null);
  const [errorForm, setErrorForm] = useState<string>('');

  // Cronómetro para verificar criterio de aceptación RF-01 (< 30 segundos)
  const [inicioPruebaMs, setInicioPruebaMs] = useState<number | null>(null);
  const [segundosTranscurridos, setSegundosTranscurridos] = useState<number>(0);
  const intervaloRef = useRef<number | null>(null);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (intervaloRef.current) {
        window.clearInterval(intervaloRef.current);
        intervaloRef.current = null;
      }
    };
  }, []);

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

  // Detección de incidente cercano del mismo tipo para ofrecer "Volver a reportar (+1)"
  const incidenteCercano = useMemo(
    () =>
      buscarIncidenteCercano(
        coordenada.lat,
        coordenada.lng,
        categoria,
        reportesExistentes,
        radioProximidad
      ),
    [coordenada.lat, coordenada.lng, categoria, reportesExistentes, radioProximidad]
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

  const manejarSeleccionBuscador = (res: ResultadoBusquedaUbicacion) => {
    iniciarCronometroSiNoCorre();
    setCoordenada({ lat: res.lat, lng: res.lng });
    setPuntoEnfocado({ lat: res.lat, lng: res.lng, zoom: res.zoom ?? 17, seq: Date.now() });
    const { cuadra, distancia } = encontrarCuadraMasCercana(res.lat, res.lng, vias);
    if (cuadra) {
      setCuadraId(cuadra.id);
      setEstadoGps(
        `Ubicación enfocada: ${res.nombre} · cuadra cercana: ${cuadra.id} (a ${distancia} m)`
      );
    }
  };

  const manejarCambioCuadra = (id: string) => {
    iniciarCronometroSiNoCorre();
    setCuadraId(id);
    const encontrada = vias.find((v) => v.id === id);
    if (encontrada) {
      setCoordenada({ lat: encontrada.lat, lng: encontrada.lng });
      setPuntoEnfocado({ lat: encontrada.lat, lng: encontrada.lng, zoom: 17, seq: Date.now() });
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

        if (cuadra && distancia <= 3000) {
          setCoordenada({ lat, lng });
          setPuntoEnfocado({ lat, lng, zoom: 17, seq: Date.now() });
          setCuadraId(cuadra.id);
          setEstadoGps(`GPS capturado (±${Math.round(pos.coords.accuracy)} m) · Cuadra ${cuadra.id}`);
        } else if (cuadra) {
          setEstadoGps(
            `GPS detectado a ${(distancia / 1000).toFixed(1)} km de la zona piloto. Toca el mapa de Santa Marta o usa el buscador de direcciones.`
          );
        }
      },
      () => {
        setBuscandoGps(false);
        setEstadoGps('No se pudo obtener el GPS. Toca directamente una calle en el mapa o usa el buscador.');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const reconstruirConZonas = async (
    baseOriginal: string,
    zonas: ZonaPrivacidad[],
    bloque = tamanoPixel
  ) => {
    const pixelada = await aplicarPixelacionEnZonas(baseOriginal, zonas, bloque);
    setFotoDataUrl(pixelada.dataUrl);
    setFotoMeta({
      width: pixelada.width,
      height: pixelada.height,
      sizeKB: pixelada.sizeKB,
    });
  };

  const ejecutarValidacionYPrivacidad = async (
    baseOriginal: string,
    categoriaActual: CategoriaObstruccion
  ) => {
    setValidandoFoto(true);
    setErrorValidacionServicio('');
    setValidacionFoto(null);
    setConfirmacionManualVehiculo(false);

    const { resultado, error: errVal, servicioNoDisponible } = await validarEvidenciaFoto(
      baseOriginal,
      categoriaActual
    );
    setValidandoFoto(false);

    if (errVal || !resultado) {
      if (servicioNoDisponible) {
        setErrorValidacionServicio(
          'El servicio de verificación automática de IA está saturado temporalmente; puedes publicar el reporte con tu fotografía o pixelar rostros y placas manualmente abajo.'
        );
        return;
      }
      setErrorValidacionServicio(errVal || 'No se pudo validar el formato de la imagen.');
      return;
    }

    setValidacionFoto(resultado);

    if (!resultado.valida) {
      setAvisoPrivacidad('');
      return;
    }

    await ejecutarDeteccionAutomatica(baseOriginal);
  };

  const ejecutarDeteccionAutomatica = async (baseOriginal: string) => {
    setProcesandoFoto(true);
    setErrorPrivacidad('');
    setAvisoPrivacidad('Detectando rostros y placas automáticamente...');

    const zonasManuales = zonasPrivacidad.filter((z) => z.origen === 'manual');
    const { zonas, error } = await detectarZonasPrivacidad(baseOriginal);

    if (error) {
      setZonasPrivacidad(zonasManuales);
      setErrorPrivacidad(
        `${error} Puedes usar "Pixelar toda la foto" o tocar/arrastrar sobre rostros y placas.`
      );
      setAvisoPrivacidad(
        'Detección automática no disponible en este momento: usa pixelado manual o completo debajo.'
      );
      await reconstruirConZonas(baseOriginal, zonasManuales);
      setProcesandoFoto(false);
      return;
    }

    const combinadas = [...zonas, ...zonasManuales];
    setZonasPrivacidad(combinadas);

    const rostros = zonas.filter((z) => z.tipo === 'rostro').length;
    const placas = zonas.filter((z) => z.tipo === 'placa').length;
    if (combinadas.length === 0) {
      setAvisoPrivacidad('No se detectaron rostros ni placas visibles; puedes pixelar manualmente debajo si deseas.');
    } else {
      setAvisoPrivacidad(
        `Pixelación aplicada: ${rostros} rostro(s), ${placas} placa(s) y ${zonasManuales.length} zona(s) manual(es).`
      );
    }

    await reconstruirConZonas(baseOriginal, combinadas);
    setProcesandoFoto(false);
  };

  const procesarFoto = async (file: File) => {
    setProcesandoFoto(true);
    setErrorForm('');
    setErrorPrivacidad('');
    setErrorValidacionServicio('');
    setValidacionFoto(null);
    try {
      const res = await procesarYAnonimizarFoto(file, 0, 800);
      setFotoBaseOriginal(res.dataUrl);
      setFotoDataUrl(res.dataUrl);
      setFotoMeta({ width: res.width, height: res.height, sizeKB: res.sizeKB });
      setProcesandoFoto(false);
      await ejecutarValidacionYPrivacidad(res.dataUrl, categoria);
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : 'Error al procesar la fotografía.');
      setProcesandoFoto(false);
    }
  };

  const manejarCambioArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    iniciarCronometroSiNoCorre();
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    await procesarFoto(archivo);
  };

  const limpiarFoto = () => {
    setFotoBaseOriginal(undefined);
    setFotoDataUrl(undefined);
    setFotoMeta(null);
    setZonasPrivacidad([]);
    setAvisoPrivacidad('');
    setErrorPrivacidad('');
    setValidacionFoto(null);
    setConfirmacionManualVehiculo(false);
    setErrorValidacionServicio('');
    if (inputFotoRef.current) inputFotoRef.current.value = '';
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
    if (!fotoBaseOriginal || procesandoFoto || validandoFoto) return;
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

    const esTap = xmax - xmin < 15 && ymax - ymin < 15;
    const nuevaZona: ZonaPrivacidad = esTap
      ? {
          id: `manual-${Date.now()}`,
          tipo: 'manual',
          xmin: Math.max(0, dibujoActual.x - 65),
          ymin: Math.max(0, dibujoActual.y - 45),
          xmax: Math.min(1000, dibujoActual.x + 65),
          ymax: Math.min(1000, dibujoActual.y + 45),
          origen: 'manual',
        }
      : {
          id: `manual-${Date.now()}`,
          tipo: 'manual',
          xmin,
          ymin,
          xmax,
          ymax,
          origen: 'manual',
        };

    if (!esTap && (xmax - xmin < 15 || ymax - ymin < 15)) return;

    const actualizadas = [...zonasPrivacidad, nuevaZona];
    setZonasPrivacidad(actualizadas);
    await reconstruirConZonas(fotoBaseOriginal, actualizadas);
    setAvisoPrivacidad(`Zona pixelada agregada (${actualizadas.length} área(s) protegida(s)).`);
  };

  const manejarPixelarTodaLaFoto = async () => {
    if (!fotoBaseOriginal) return;
    const zonaCompleta: ZonaPrivacidad = {
      id: `full-${Date.now()}`,
      tipo: 'manual',
      xmin: 0,
      ymin: 0,
      xmax: 1000,
      ymax: 1000,
      origen: 'manual',
    };
    const actualizadas = [zonaCompleta];
    setZonasPrivacidad(actualizadas);
    await reconstruirConZonas(fotoBaseOriginal, actualizadas);
    setErrorPrivacidad('');
    setAvisoPrivacidad('Pixelación completa aplicada sobre toda la fotografía.');
  };

  const manejarLimpiarZonasPixelado = async () => {
    if (!fotoBaseOriginal) return;
    setZonasPrivacidad([]);
    await reconstruirConZonas(fotoBaseOriginal, []);
    setAvisoPrivacidad('Se quitó el pixelado; la fotografía volvió a su estado original.');
  };

  const manejarCambiarTamanoPixel = async (nuevoTamano: number) => {
    setTamanoPixel(nuevoTamano);
    if (fotoBaseOriginal && zonasPrivacidad.length > 0) {
      await reconstruirConZonas(fotoBaseOriginal, zonasPrivacidad, nuevoTamano);
    }
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

  const manejarVolverAReportarExistente = () => {
    if (!incidenteCercano) return;
    const duracion = detenerCronometro();
    onConfirmarReporte(incidenteCercano.reporte.id);
    setUltimoGuardado({
      reporte: {
        ...incidenteCercano.reporte,
        confirmaciones: Math.max(1, incidenteCercano.reporte.confirmaciones ?? 1) + 1,
      },
      duracionSegundos: duracion,
      esConfirmacion: true,
    });
    setErrorForm('');
  };

  const fotoBloqueadaPorIA =
    Boolean(fotoDataUrl) &&
    (validandoFoto ||
      procesandoFoto ||
      (validacionFoto !== null && !validacionFoto.valida && !confirmacionManualVehiculo));

  const manejarEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm('');

    if (!cuadraId || !coordenada.lat || !coordenada.lng) {
      setErrorForm('Debes seleccionar una cuadra o ubicación en el mapa.');
      return;
    }

    if (fotoDataUrl) {
      if (validandoFoto || procesandoFoto) {
        setErrorForm('Espera un momento mientras termina el procesamiento de la fotografía.');
        return;
      }
      if (validacionFoto !== null && !validacionFoto.valida && !confirmacionManualVehiculo) {
        setErrorForm(
          validacionFoto.motivoRechazo ||
            'No se detectaron vehículos en la fotografía. Toma una nueva foto, confirma manualmente si sí hay un vehículo, o quítala para continuar.'
        );
        return;
      }
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
      confirmaciones: 1,
      ultima_confirmacion: fechaHora || obtenerFechaHoraLocalActual(),
      estado: 'activo',
      validacion_ia: validacionFoto
        ? {
            valida: validacionFoto.valida || confirmacionManualVehiculo,
            resumen: confirmacionManualVehiculo
              ? 'Presencia de vehículo confirmada manualmente por el usuario.'
              : validacionFoto.resumen,
          }
        : undefined,
      criticidad: {
        puntaje: desglose.puntaje,
        nivel: desglose.nivel,
      },
    };

    onGuardarReporte(nuevoReporte);
    setUltimoGuardado({ reporte: nuevoReporte, duracionSegundos: duracion });
    setObservacion('');
    limpiarFoto();
  };

  const colorNivel =
    desglose.nivel === 'Alto'
      ? 'text-[#DC2626] dark:text-red-400'
      : desglose.nivel === 'Medio'
        ? 'text-[#D97706] dark:text-amber-400'
        : 'text-[#15803D] dark:text-emerald-400';

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Registro ciudadano y de campo · Meta menor a 30 segundos
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Reportar obstrucción en Santa Marta
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
            <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span className="text-slate-600 dark:text-slate-300">Cronómetro:</span>
            <span
              className={`font-mono font-semibold tabular-nums ${
                segundosTranscurridos > 30
                  ? 'text-[#DC2626] dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {segundosTranscurridos.toFixed(1)} s
            </span>
          </div>
          <button
            type="button"
            onClick={reiniciarCronometro}
            className="flex min-h-[40px] items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            title="Reiniciar cronómetro de prueba"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar
          </button>
        </div>
      </div>

      {ultimoGuardado && (
        <div className="mb-6 flex flex-col justify-between gap-4 border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/35 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#15803D] dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {ultimoGuardado.esConfirmacion
                  ? `Confirmación (+1) sumada al reporte ${ultimoGuardado.reporte.id} sin duplicar marcador`
                  : `Reporte ${ultimoGuardado.reporte.id} guardado en el navegador`}
              </p>
              <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                {ultimoGuardado.reporte.cuadra} · {ETIQUETAS_CATEGORIA[ultimoGuardado.reporte.categoria]} · Criticidad{' '}
                <strong className="font-mono">
                  {ultimoGuardado.reporte.criticidad.nivel} ({ultimoGuardado.reporte.criticidad.puntaje} pts)
                </strong>
                {ultimoGuardado.esConfirmacion && (
                  <span> · Confirmaciones totales: {ultimoGuardado.reporte.confirmaciones}</span>
                )}
                {ultimoGuardado.duracionSegundos !== null && (
                  <span> · Tiempo registrado: {ultimoGuardado.duracionSegundos} s</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onIrATablero}
            className="min-h-[44px] bg-[#0B3B69] px-4 py-2 text-xs font-semibold text-white hover:bg-[#082c4f] dark:bg-sky-700 dark:hover:bg-sky-600 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver en mapa de calor
          </button>
        </div>
      )}

      <form onSubmit={manejarEnviar} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna izquierda: Ubicación en mapa y cuadra */}
        <div className="space-y-4 lg:col-span-6">
          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                1. Ubicación en la zona
              </h2>
              <button
                type="button"
                onClick={manejarUsarGPS}
                disabled={buscandoGps}
                className="flex min-h-[40px] items-center gap-2 bg-[#0B3B69] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#082c4f] disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600 whitespace-nowrap cursor-pointer"
              >
                <LocateFixed className="h-4 w-4" />
                {buscandoGps ? 'Ubicando...' : 'Usar mi ubicación'}
              </button>
            </div>

            <div className="mb-3">
              <BuscadorUbicacion
                vias={vias}
                onSeleccionarUbicacion={manejarSeleccionBuscador}
                compact={true}
              />
            </div>

            <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
              Toca el punto exacto sobre el mapa de Santa Marta, búscalo por dirección/coordenadas o selecciona la cuadra.
            </p>

            <MapaSantaMarta
              reportes={[]}
              vias={vias}
              modoSeleccion={true}
              coordenadaSeleccionada={coordenada}
              onSeleccionarUbicacion={manejarSeleccionMapa}
              puntoEnfocado={puntoEnfocado}
              alturaClase="h-[260px] sm:h-[300px]"
              mostrarControlesCapas={false}
              esOscuro={esOscuro}
            />

            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="select-cuadra"
                  className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Cuadra clasificada (vias.json)
                </label>
                <select
                  id="select-cuadra"
                  value={cuadraId}
                  onChange={(e) => manejarCambioCuadra(e.target.value)}
                  className="min-h-[44px] w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B3B69] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {vias.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} — {v.nombre} ({v.tipo_via === 'arterial' ? 'Arterial' : 'Secundaria'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 font-mono tabular-nums">
                  <MapPin className="h-3.5 w-3.5 text-[#0B3B69] dark:text-sky-400" />
                  {coordenada.lat.toFixed(5)}, {coordenada.lng.toFixed(5)}
                </span>
                <span>
                  {cuadraActual?.sector} · {ETIQUETAS_VIA[desglose.tipoVia]}
                </span>
              </div>

              {estadoGps && (
                <p className="text-xs text-slate-600 dark:text-slate-300">{estadoGps}</p>
              )}
            </div>
          </div>

          {/* Alerta de incidente existente cercano: Botón "Volver a reportar (+1)" */}
          {incidenteCercano && (
            <div className="border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706] dark:text-amber-400" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-amber-200">
                    Ya existe un reporte activo del mismo tipo a {incidenteCercano.distancia} m (radio configurado: {radioProximidad} m)
                  </p>
                  <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-mono font-semibold">{incidenteCercano.reporte.id}</span> ·{' '}
                    {ETIQUETAS_CATEGORIA[incidenteCercano.reporte.categoria]} · Confirmaciones:{' '}
                    <strong className="font-mono tabular-nums">
                      {Math.max(1, incidenteCercano.reporte.confirmaciones ?? 1)}
                    </strong>
                    {' · '}Última:{' '}
                    <span className="font-mono tabular-nums">
                      {(incidenteCercano.reporte.ultima_confirmacion ?? incidenteCercano.reporte.fecha_hora).replace('T', ' ')}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                    Para evitar duplicar marcadores, puedes confirmar que el problema continúa presente:
                  </p>
                  <button
                    type="button"
                    onClick={manejarVolverAReportarExistente}
                    className="mt-2.5 inline-flex min-h-[40px] items-center gap-2 bg-[#0B3B69] px-4 py-2 text-xs font-semibold text-white hover:bg-[#082c4f] dark:bg-sky-700 dark:hover:bg-sky-600 cursor-pointer"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Volver a reportar (+1)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Vista previa automática de criticidad */}
          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Cálculo automático del índice (RF-02)
              </span>
              <span className={`font-mono text-sm font-bold tabular-nums ${colorNivel}`}>
                {desglose.nivel} · {desglose.puntaje} pts
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Categoría</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  +{desglose.puntosCategoria} pts
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">{ETIQUETAS_VIA[desglose.tipoVia]}</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  +{desglose.puntosVia} pts
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">{ETIQUETAS_FRANJA[desglose.franja]}</p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  +{desglose.puntosFranja} pts
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha: Categoría, Actor, Hora y Foto validada por IA */}
        <div className="space-y-4 lg:col-span-6">
          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
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
                        ? 'border-[#0B3B69] bg-[#0B3B69]/5 text-slate-900 dark:border-sky-500 dark:bg-sky-950/40 dark:text-slate-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="pr-3">
                      <div className="text-sm font-semibold">{op.titulo}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{op.detalle}</div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                      +{criterios.categoria[op.id]} pts
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
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
                        ? 'border-[#0B3B69] bg-[#0B3B69] text-white dark:border-sky-500 dark:bg-sky-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {ETIQUETAS_ACTOR[act]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="input-fecha-hora"
                  className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
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
                  className="min-h-[44px] w-full border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#0B3B69] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="input-observacion"
                  className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
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
                  className="min-h-[44px] w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B69] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Carga de foto con validación inteligente IA + pixelación selectiva automática */}
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    4. Foto opcional (verificación IA y pixelación automática de rostros y placas)
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    No importa si la foto sale un poco borrosa; solo se bloquea la publicación si no aparece ningún vehículo. Rostros y placas se pixelan automáticamente.
                  </p>
                </div>

                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap">
                  <Camera className="h-4 w-4 text-[#0B3B69] dark:text-sky-400" />
                  <span>
                    {validandoFoto
                      ? 'Validando con IA...'
                      : procesandoFoto
                        ? 'Protegiendo foto...'
                        : fotoDataUrl
                          ? 'Tomar otra foto'
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
                <div className="mt-3 space-y-3 border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                  <div
                    ref={previewContainerRef}
                    onPointerDown={manejarPointerDown}
                    onPointerMove={manejarPointerMove}
                    onPointerUp={manejarPointerUp}
                    className="relative mx-auto w-full max-w-md select-none overflow-hidden border border-slate-300 bg-slate-900 touch-none cursor-crosshair dark:border-slate-700"
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

                      {/* Resultado de validación inteligente con IA */}
                      {validandoFoto && (
                        <div className="flex items-center gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span>Verificando que la fotografía incluya al menos un vehículo...</span>
                        </div>
                      )}

                      {!validandoFoto && errorValidacionServicio && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706] dark:text-amber-400" />
                            <span>{errorValidacionServicio}</span>
                          </div>
                          {fotoBaseOriginal && (
                            <button
                              type="button"
                              onClick={() => ejecutarValidacionYPrivacidad(fotoBaseOriginal, categoria)}
                              className="border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 cursor-pointer"
                            >
                              Reintentar
                            </button>
                          )}
                        </div>
                      )}

                  {!validandoFoto && validacionFoto && !validacionFoto.valida && !confirmacionManualVehiculo && (
                    <div className="flex items-start gap-2 border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626] dark:text-red-400" />
                      <div className="flex-1">
                        <p className="font-semibold">
                          Fotografía rechazada · Envío bloqueado (sin vehículos)
                        </p>
                        <p className="mt-0.5">{validacionFoto.motivoRechazo}</p>
                        <p className="mt-1 text-[11px] opacity-85">
                          Sube una fotografía donde se observe al menos un vehículo o quita la imagen para continuar.
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            setConfirmacionManualVehiculo(true);
                            setErrorForm('');
                            if (fotoBaseOriginal) {
                              await ejecutarDeteccionAutomatica(fotoBaseOriginal);
                            }
                          }}
                          className="mt-2 inline-flex min-h-[34px] items-center gap-1.5 border border-red-400 bg-white px-3 py-1 text-[11px] font-semibold text-red-900 hover:bg-red-100 dark:border-red-700 dark:bg-slate-900 dark:text-red-200 dark:hover:bg-red-950 cursor-pointer"
                        >
                          Sí hay un vehículo en esta foto (usar de todas formas)
                        </button>
                      </div>
                    </div>
                  )}

                  {!validandoFoto && validacionFoto && !validacionFoto.valida && confirmacionManualVehiculo && (
                    <div className="space-y-1 border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-[#15803D] dark:text-emerald-400" />
                        <span>Vehículo confirmado manualmente; fotografía lista para publicar.</span>
                      </div>
                      {avisoPrivacidad && (
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                          {avisoPrivacidad}
                        </p>
                      )}
                    </div>
                  )}

                  {!validandoFoto && validacionFoto?.valida && (
                    <div className="space-y-1 border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-[#15803D] dark:text-emerald-400" />
                        <span>Fotografía validada por IA: {validacionFoto.resumen}</span>
                      </div>
                      {avisoPrivacidad && (
                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                          {avisoPrivacidad}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Herramientas visibles de pixelado manual y automático */}
                  {fotoBaseOriginal && (
                    <div className="space-y-2.5 border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Herramientas de pixelado ({zonasPrivacidad.length} zona(s) aplicada(s))
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                          <label htmlFor="rango-pixel" className="whitespace-nowrap">
                            Tamaño de píxel:
                          </label>
                          <input
                            id="rango-pixel"
                            type="range"
                            min={8}
                            max={28}
                            step={2}
                            value={tamanoPixel}
                            onChange={(e) => manejarCambiarTamanoPixel(Number(e.target.value))}
                            className="w-24 accent-[#0B3B69] dark:accent-sky-500 cursor-pointer"
                          />
                          <span className="font-mono font-semibold tabular-nums">{tamanoPixel} px</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={procesandoFoto || validandoFoto}
                          onClick={() => ejecutarDeteccionAutomatica(fotoBaseOriginal)}
                          className="inline-flex min-h-[34px] items-center gap-1.5 bg-[#0B3B69] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#082c4f] disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600 cursor-pointer"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Pixelar rostros/placas (IA)
                        </button>

                        <button
                          type="button"
                          disabled={procesandoFoto || validandoFoto}
                          onClick={manejarPixelarTodaLaFoto}
                          className="inline-flex min-h-[34px] items-center gap-1.5 border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <Grid2x2 className="h-3.5 w-3.5 text-[#0B3B69] dark:text-sky-400" />
                          Pixelar toda la foto
                        </button>

                        {zonasPrivacidad.length > 0 && (
                          <>
                            <button
                              type="button"
                              disabled={procesandoFoto || validandoFoto}
                              onClick={manejarDeshacerUltimaZona}
                              className="inline-flex min-h-[34px] items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Deshacer
                            </button>
                            <button
                              type="button"
                              disabled={procesandoFoto || validandoFoto}
                              onClick={manejarLimpiarZonasPixelado}
                              className="inline-flex min-h-[34px] items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Eraser className="h-3.5 w-3.5" />
                              Quitar pixelado
                            </button>
                          </>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        También puedes <strong>tocar o arrastrar</strong> directamente sobre la fotografía para pixelar cualquier placa, rostro o detalle al instante.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      {errorPrivacidad && (
                        <p className="text-[11px] text-[#D97706] dark:text-amber-400">
                          {errorPrivacidad}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {fotoMeta ? `${fotoMeta.width}×${fotoMeta.height} px · ${fotoMeta.sizeKB} KB` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {fotoBaseOriginal && (
                        <button
                          type="button"
                          disabled={procesandoFoto || validandoFoto}
                          onClick={() => ejecutarValidacionYPrivacidad(fotoBaseOriginal, categoria)}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Revalidar vehículo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={limpiarFoto}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#DC2626] hover:underline dark:text-red-400 cursor-pointer"
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
            <p className="text-sm font-medium text-[#DC2626] dark:text-red-400">{errorForm}</p>
          )}

          <button
            type="submit"
            disabled={fotoBloqueadaPorIA}
            className="min-h-[52px] w-full bg-[#0B3B69] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#082c4f] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-700 dark:hover:bg-sky-600 cursor-pointer"
          >
            {validandoFoto || procesandoFoto
              ? 'Analizando fotografía...'
              : fotoBloqueadaPorIA
                ? 'Fotografía rechazada: no se detectaron vehículos'
                : `Guardar reporte en mapa (${desglose.nivel} · ${desglose.puntaje} pts)`}
          </button>
        </div>
      </form>
    </section>
  );
};
