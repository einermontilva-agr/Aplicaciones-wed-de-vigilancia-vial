import React, { useEffect, useRef, useState } from 'react';
import L from '../logic/leafletSetup';
import {
  CuadraVia,
  ETIQUETAS_ACTOR,
  ETIQUETAS_CATEGORIA_CORTA,
  Reporte,
} from '../types';

interface MapaSantaMartaProps {
  reportes: Reporte[];
  vias: CuadraVia[];
  modoSeleccion?: boolean;
  coordenadaSeleccionada?: { lat: number; lng: number } | null;
  onSeleccionarUbicacion?: (lat: number, lng: number) => void;
  onSeleccionarReporte?: (reporte: Reporte) => void;
  puntoEnfocado?: { lat: number; lng: number; zoom?: number } | null;
  alturaClase?: string;
  mostrarControlesCapas?: boolean;
}

const CENTRO_ZONA_UNIMAG: [number, number] = [11.2241, -74.1908];

function colorPorNivel(nivel: string): string {
  if (nivel === 'Alto') return '#DC2626';
  if (nivel === 'Medio') return '#D97706';
  return '#15803D';
}

export const MapaSantaMarta: React.FC<MapaSantaMartaProps> = ({
  reportes,
  vias,
  modoSeleccion = false,
  coordenadaSeleccionada = null,
  onSeleccionarUbicacion,
  onSeleccionarReporte,
  puntoEnfocado = null,
  alturaClase = 'h-[460px] lg:h-[540px]',
  mostrarControlesCapas = true,
}) => {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaCalorRef = useRef<L.HeatLayer | null>(null);
  const capaPuntosRef = useRef<L.LayerGroup | null>(null);
  const capaViasRef = useRef<L.LayerGroup | null>(null);
  const marcadorSeleccionRef = useRef<L.CircleMarker | null>(null);
  const yaAjustoLimitesRef = useRef(false);

  const [verCalor, setVerCalor] = useState(!modoSeleccion);
  const [verPuntos, setVerPuntos] = useState(!modoSeleccion);
  const [verCuadras, setVerCuadras] = useState(true);

  const onSeleccionarUbicacionRef = useRef(onSeleccionarUbicacion);
  onSeleccionarUbicacionRef.current = onSeleccionarUbicacion;

  const onSeleccionarReporteRef = useRef(onSeleccionarReporte);
  onSeleccionarReporteRef.current = onSeleccionarReporte;

  // Inicializar mapa base OpenStreetMap
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;

    const mapa = L.map(contenedorRef.current, {
      center: CENTRO_ZONA_UNIMAG,
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap · Santa Marta',
      maxZoom: 19,
    }).addTo(mapa);

    capaViasRef.current = L.layerGroup().addTo(mapa);
    capaPuntosRef.current = L.layerGroup().addTo(mapa);

    mapa.on('click', (e: L.LeafletMouseEvent) => {
      if (onSeleccionarUbicacionRef.current) {
        onSeleccionarUbicacionRef.current(
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6))
        );
      }
    });

    mapaRef.current = mapa;

    // Ajuste de tamaño tras montaje inicial
    const timer = window.setTimeout(() => {
      mapa.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(timer);
      mapa.remove();
      mapaRef.current = null;
      capaCalorRef.current = null;
      capaPuntosRef.current = null;
      capaViasRef.current = null;
      marcadorSeleccionRef.current = null;
      yaAjustoLimitesRef.current = false;
    };
  }, []);

  // Dibujar segmentos de cuadras clasificadas (vias.json)
  useEffect(() => {
    const mapa = mapaRef.current;
    const capaVias = capaViasRef.current;
    if (!mapa || !capaVias) return;

    capaVias.clearLayers();
    if (!verCuadras) return;

    for (const via of vias) {
      const esArterial = via.tipo_via === 'arterial';
      const linea = L.polyline(via.tramo, {
        color: esArterial ? '#0B3B69' : '#64748B',
        weight: esArterial ? 5 : 3.5,
        opacity: modoSeleccion ? 0.75 : 0.45,
        dashArray: esArterial ? undefined : '5, 5',
      });

      linea.bindTooltip(
        `<div style="font-size:12px;"><strong>${via.id}</strong><br/>${via.nombre}<br/><em>${esArterial ? 'Arterial' : 'Secundaria'} · ${via.sector}</em></div>`,
        { sticky: true }
      );

      if (modoSeleccion && onSeleccionarUbicacionRef.current) {
        linea.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          onSeleccionarUbicacionRef.current?.(
            Number(e.latlng.lat.toFixed(6)),
            Number(e.latlng.lng.toFixed(6))
          );
        });
      }

      linea.addTo(capaVias);
    }

    if (!modoSeleccion && !yaAjustoLimitesRef.current && vias.length > 0 && !puntoEnfocado) {
      const puntos = vias.flatMap((v) => v.tramo);
      if (puntos.length > 0) {
        mapa.fitBounds(puntos, { padding: [28, 28], maxZoom: 16 });
        yaAjustoLimitesRef.current = true;
      }
    }
  }, [vias, verCuadras, modoSeleccion]);

  // Actualizar capa de calor (Leaflet.heat) ponderada por criticidad.puntaje
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (capaCalorRef.current) {
      mapa.removeLayer(capaCalorRef.current);
      capaCalorRef.current = null;
    }

    if (!verCalor || reportes.length === 0) return;

    const puntosCalor: L.HeatLatLngTuple[] = reportes.map((r) => [
      r.lat,
      r.lng,
      Math.max(0.2, Math.min(1, r.criticidad.puntaje / 9)),
    ]);

    if (typeof L.heatLayer === 'function') {
      const heat = L.heatLayer(puntosCalor, {
        radius: 28,
        blur: 20,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.38,
        gradient: {
          0.25: '#2563EB',
          0.55: '#F59E0B',
          0.8: '#EA580C',
          1.0: '#DC2626',
        },
      });
      heat.addTo(mapa);
      capaCalorRef.current = heat;
    }
  }, [reportes, verCalor]);

  // Actualizar capa de puntos individuales
  useEffect(() => {
    const capaPuntos = capaPuntosRef.current;
    if (!capaPuntos) return;

    capaPuntos.clearLayers();
    if (!verPuntos) return;

    for (const r of reportes) {
      const color = colorPorNivel(r.criticidad.nivel);
      const marcador = L.circleMarker([r.lat, r.lng], {
        radius: r.criticidad.nivel === 'Alto' ? 7.5 : 6,
        fillColor: color,
        color: '#FFFFFF',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.92,
      });

      const hora = r.fecha_hora.replace('T', ' ');
      const contenidoPopup = `
        <div style="min-width:210px;font-family:inherit;line-height:1.4;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="font-size:13px;color:#0F172A;">${r.id} · ${r.cuadra}</strong>
            <span style="font-size:11px;font-weight:600;color:${color};">${r.criticidad.nivel} (${r.criticidad.puntaje} pts)</span>
          </div>
          <div style="font-size:12px;color:#334155;margin-bottom:2px;">${ETIQUETAS_CATEGORIA_CORTA[r.categoria]}</div>
          <div style="font-size:11px;color:#64748B;margin-bottom:4px;">${ETIQUETAS_ACTOR[r.actor]} · ${hora}</div>
          ${r.observacion ? `<div style="font-size:11px;color:#475569;border-top:1px solid #E2E8F0;padding-top:4px;margin-top:4px;">${r.observacion}</div>` : ''}
        </div>
      `;

      marcador.bindPopup(contenidoPopup);
      marcador.on('click', () => {
        onSeleccionarReporteRef.current?.(r);
      });
      marcador.addTo(capaPuntos);
    }
  }, [reportes, verPuntos]);

  // Marcador de ubicación seleccionada en modo captura
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (marcadorSeleccionRef.current) {
      mapa.removeLayer(marcadorSeleccionRef.current);
      marcadorSeleccionRef.current = null;
    }

    if (coordenadaSeleccionada) {
      const pin = L.circleMarker(
        [coordenadaSeleccionada.lat, coordenadaSeleccionada.lng],
        {
          radius: 10,
          fillColor: '#0B3B69',
          color: '#FFFFFF',
          weight: 3,
          opacity: 1,
          fillOpacity: 1,
        }
      ).addTo(mapa);
      marcadorSeleccionRef.current = pin;
    }
  }, [coordenadaSeleccionada]);

  // Enfocar un punto o cuadra cuando el usuario lo selecciona desde la tabla o resumen
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !puntoEnfocado) return;
    mapa.setView([puntoEnfocado.lat, puntoEnfocado.lng], puntoEnfocado.zoom ?? 17, {
      animate: true,
    });
  }, [puntoEnfocado]);

  return (
    <div className="relative w-full overflow-hidden border border-slate-200 bg-slate-100">
      {mostrarControlesCapas && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-600">Capas del mapa:</span>
            <button
              type="button"
              onClick={() => setVerCalor((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                verCalor
                  ? 'bg-[#0B3B69] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Mapa de calor
            </button>
            <button
              type="button"
              onClick={() => setVerPuntos((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                verPuntos
                  ? 'bg-[#0B3B69] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Puntos ({reportes.length})
            </button>
            <button
              type="button"
              onClick={() => setVerCuadras((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                verCuadras
                  ? 'bg-[#0B3B69] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Cuadras monitoreadas
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#DC2626]" />
              Alto (7–9)
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#D97706]" />
              Medio (5–6)
            </span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#15803D]" />
              Bajo (0–4)
            </span>
          </div>
        </div>
      )}

      <div
        ref={contenedorRef}
        className={`w-full ${alturaClase} ${modoSeleccion ? 'cursor-crosshair' : ''}`}
      />
    </div>
  );
};
