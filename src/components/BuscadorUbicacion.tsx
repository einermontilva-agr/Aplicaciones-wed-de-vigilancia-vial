import React, { useEffect, useRef, useState } from 'react';
import { Compass, Loader2, MapPin, Search, X } from 'lucide-react';
import {
  buscarUbicacionesCompletas,
  buscarUbicacionesLocales,
} from '../logic/busqueda';
import { CuadraVia, ResultadoBusquedaUbicacion } from '../types';

interface BuscadorUbicacionProps {
  vias: CuadraVia[];
  onSeleccionarUbicacion: (resultado: ResultadoBusquedaUbicacion) => void;
  placeholder?: string;
  compact?: boolean;
}

const ETIQUETA_TIPO: Record<ResultadoBusquedaUbicacion['tipo'], string> = {
  coordenada: 'Coordenadas',
  cuadra: 'Cuadra',
  barrio: 'Barrio',
  lugar: 'Lugar',
  direccion: 'Dirección',
};

export const BuscadorUbicacion: React.FC<BuscadorUbicacionProps> = ({
  vias,
  onSeleccionarUbicacion,
  placeholder = 'Buscar dirección, calle, carrera, barrio, lugar o coordenadas (ej. 11.2244, -74.1909)...',
  compact = false,
}) => {
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusquedaUbicacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [ultimoSeleccionado, setUltimoSeleccionado] = useState<string>('');
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const manejarClickFuera = (e: MouseEvent) => {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(e.target as Node)
      ) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', manejarClickFuera);
    return () => document.removeEventListener('mousedown', manejarClickFuera);
  }, []);

  useEffect(() => {
    const q = consulta.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }

    const locales = buscarUbicacionesLocales(q, vias);
    setResultados(locales);
    setAbierto(true);

    if (q.length < 3) {
      setBuscando(false);
      return;
    }

    setBuscando(true);
    const timer = window.setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const completos = await buscarUbicacionesCompletas(q, vias, controller.signal);
      if (!controller.signal.aborted) {
        setResultados(completos);
        setBuscando(false);
        setAbierto(true);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [consulta, vias]);

  const elegirResultado = (res: ResultadoBusquedaUbicacion) => {
    setConsulta(res.nombre);
    setUltimoSeleccionado(`${res.nombre} (${res.lat.toFixed(5)}, ${res.lng.toFixed(5)})`);
    setAbierto(false);
    onSeleccionarUbicacion(res);
  };

  const manejarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = consulta.trim();
    if (q.length < 2) return;

    if (resultados.length > 0) {
      elegirResultado(resultados[0]);
      return;
    }

    setBuscando(true);
    const encontrados = await buscarUbicacionesCompletas(q, vias);
    setBuscando(false);
    setResultados(encontrados);
    if (encontrados.length > 0) {
      elegirResultado(encontrados[0]);
    } else {
      setAbierto(true);
    }
  };

  return (
    <div ref={contenedorRef} className="relative w-full">
      <form onSubmit={manejarSubmit} className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={consulta}
            onFocus={() => {
              if (resultados.length > 0) setAbierto(true);
            }}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder={placeholder}
            aria-label="Buscador preciso de direcciones y coordenadas"
            className={`w-full border border-slate-300 bg-white pl-9 pr-9 text-slate-900 placeholder:text-slate-400 focus:border-[#0B3B69] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500 ${
              compact ? 'min-h-[38px] text-xs' : 'min-h-[42px] text-xs sm:text-sm'
            }`}
          />
          {consulta && (
            <button
              type="button"
              onClick={() => {
                setConsulta('');
                setResultados([]);
                setUltimoSeleccionado('');
                setAbierto(false);
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="submit"
          className={`flex items-center gap-1.5 bg-[#0B3B69] px-3.5 text-xs font-medium text-white hover:bg-[#082c4f] dark:bg-sky-700 dark:hover:bg-sky-600 whitespace-nowrap shrink-0 cursor-pointer ${
            compact ? 'min-h-[38px]' : 'min-h-[42px]'
          }`}
        >
          {buscando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Compass className="h-3.5 w-3.5" />
          )}
          <span>Ubicar</span>
        </button>
      </form>

      {ultimoSeleccionado && !abierto && (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          Ubicación enfocada: {ultimoSeleccionado}
        </p>
      )}

      {abierto && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {buscando && resultados.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Buscando en Santa Marta...
            </div>
          ) : resultados.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
              No se encontraron ubicaciones para "{consulta}". Prueba con una calle, carrera, barrio, lugar conocido o coordenadas (`11.2244, -74.1909`).
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {resultados.map((res) => (
                <li key={res.id}>
                  <button
                    type="button"
                    onClick={() => elegirResultado(res)}
                    className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0B3B69] dark:text-sky-400" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {res.nombre}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {res.detalle}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0B3B69] dark:text-sky-400">
                        {ETIQUETA_TIPO[res.tipo]}
                      </span>
                      <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {res.lat.toFixed(4)}, {res.lng.toFixed(4)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
