import React, { useEffect, useMemo, useRef, useState } from 'react';
import L, { CapaCalorLeaflet, crearCapaCalor } from '../logic/leafletSetup';
import {
  agruparPorProximidad,
  calcularPesoCalorReporte,
  RADIO_PROXIMIDAD_DEFECTO,
  RADIO_PROXIMIDAD_MAX,
  RADIO_PROXIMIDAD_MIN,
} from '../logic/proximidad';
import {
  CuadraVia,
  ETIQUETAS_ACTOR,
  ETIQUETAS_CATEGORIA_CORTA,
  Reporte,
  ZonaProximidad,
} from '../types';

interface MapaSantaMartaProps {
  reportes: Reporte[];
  vias: CuadraVia[];
  modoSeleccion?: boolean;
  coordenadaSeleccionada?: { lat: number; lng: number } | null;
  onSeleccionarUbicacion?: (lat: number, lng: number) => void;
  onSeleccionarReporte?: (reporte: Reporte) => void;
  onSeleccionarZona?: (zona: ZonaProximidad) => void;
  onConfirmarReporte?: (reporteId: string) => void;
  puntoEnfocado?: {
    lat: number;
    lng: number;
    zoom?: number;
    etiqueta?: string;
  } | null;
  alturaClase?: string;
  mostrarControlesCapas?: boolean;
  radioProximidad?: number;
  onCambiarRadioProximidad?: (radio: number) => void;
  esOscuro?: boolean;
}

const CENTRO_ZONA_UNIMAG: [number, number] = [11.22455, -74.19105];

function colorPorNivel(nivel: string): string {
  if (nivel === 'Alto') return '#DC2626';
  if (nivel === 'Medio') return '#D97706';
  return '#15803D';
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const MapaSantaMarta: React.FC<MapaSantaMartaProps> = ({
  reportes,
  vias,
  modoSeleccion = false,
  coordenadaSeleccionada = null,
  onSeleccionarUbicacion,
  onSeleccionarReporte,
  onSeleccionarZona,
  onConfirmarReporte,
  puntoEnfocado = null,
  alturaClase = 'h-[460px] lg:h-[540px]',
  mostrarControlesCapas = true,
  radioProximidad: radioProp,
  onCambiarRadioProximidad,
  esOscuro = false,
}) => {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaTilesRef = useRef<L.TileLayer | null>(null);
  const capaCalorRef = useRef<CapaCalorLeaflet | null>(null);
  const capaZonasRef = useRef<L.LayerGroup | null>(null);
  const capaPuntosRef = useRef<L.LayerGroup | null>(null);
  const capaViasRef = useRef<L.LayerGroup | null>(null);
  const marcadorSeleccionRef = useRef<L.CircleMarker | null>(null);
  const marcadorBuscadoRef = useRef<L.CircleMarker | null>(null);
  const yaAjustoLimitesRef = useRef(false);

  const [verCalor, setVerCalor] = useState(!modoSeleccion);
  const [verPuntos, setVerPuntos] = useState(!modoSeleccion);
  const [verZonas, setVerZonas] = useState(!modoSeleccion);
  const [verCuadras, setVerCuadras] = useState(true);
  const [radioLocal, setRadioLocal] = useState(RADIO_PROXIMIDAD_DEFECTO);

  const radioActivo = radioProp ?? radioLocal;
  const actualizarRadio = (nuevo: number) => {
    const clamped = Math.max(
      RADIO_PROXIMIDAD_MIN,
      Math.min(RADIO_PROXIMIDAD_MAX, nuevo)
    );
    setRadioLocal(clamped);
    onCambiarRadioProximidad?.(clamped);
  };

  const onSeleccionarUbicacionRef = useRef(onSeleccionarUbicacion);
  onSeleccionarUbicacionRef.current = onSeleccionarUbicacion;

  const onSeleccionarReporteRef = useRef(onSeleccionarReporte);
  onSeleccionarReporteRef.current = onSeleccionarReporte;

  const onSeleccionarZonaRef = useRef(onSeleccionarZona);
  onSeleccionarZonaRef.current = onSeleccionarZona;

  const onConfirmarReporteRef = useRef(onConfirmarReporte);
  onConfirmarReporteRef.current = onConfirmarReporte;

  const agrupacion = useMemo(
    () => agruparPorProximidad(reportes, radioActivo),
    [reportes, radioActivo]
  );

  // Inicializar mapa base Leaflet
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;

    const mapa = L.map(contenedorRef.current, {
      center: CENTRO_ZONA_UNIMAG,
      zoom: 15,
      zoomControl: true,
    });

    const heatmapPane = mapa.createPane('heatmapPane');
    heatmapPane.style.zIndex = '350';
    heatmapPane.classList.add('leaflet-heatmap-pane');

    const capaTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap · Santa Marta',
      maxZoom: 19,
    }).addTo(mapa);
    capaTilesRef.current = capaTiles;

    capaViasRef.current = L.layerGroup().addTo(mapa);
    capaZonasRef.current = L.layerGroup().addTo(mapa);
    capaPuntosRef.current = L.layerGroup().addTo(mapa);

    mapa.on('click', (e: L.LeafletMouseEvent) => {
      if (onSeleccionarUbicacionRef.current) {
        onSeleccionarUbicacionRef.current(
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6))
        );
      }
    });

    // Permitir confirmar (+1) directamente desde botones dentro de popups de Leaflet
    const el = contenedorRef.current;
    const manejarClickPopup = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const btn = target?.closest('[data-confirmar-id]') as HTMLElement | null;
      if (btn) {
        const repId = btn.getAttribute('data-confirmar-id');
        if (repId) {
          ev.preventDefault();
          ev.stopPropagation();
          onConfirmarReporteRef.current?.(repId);
        }
      }
    };
    el.addEventListener('click', manejarClickPopup);

    mapaRef.current = mapa;

    // ResizeObserver para mantener canvas de mapa de calor siempre sincronizado
    const observer = new ResizeObserver(() => {
      if (!mapaRef.current) return;
      mapaRef.current.invalidateSize({ animate: false });
      capaCalorRef.current?.redraw();
    });
    observer.observe(el);

    const timer = window.setTimeout(() => {
      mapa.invalidateSize({ animate: false });
      capaCalorRef.current?.redraw();
    }, 120);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      el.removeEventListener('click', manejarClickPopup);
      mapa.remove();
      mapaRef.current = null;
      capaTilesRef.current = null;
      capaCalorRef.current = null;
      capaZonasRef.current = null;
      capaPuntosRef.current = null;
      capaViasRef.current = null;
      marcadorSeleccionRef.current = null;
      marcadorBuscadoRef.current = null;
      yaAjustoLimitesRef.current = false;
    };
  }, []);

  // Sincronizar clase visual de modo oscuro en el contenedor del mapa sin perder estructuras OSM
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const container = mapa.getContainer();
    container.classList.toggle('mapa-oscuro', esOscuro);
  }, [esOscuro]);

  // Dibujar segmentos de cuadras clasificadas (vias.json)
  useEffect(() => {
    const mapa = mapaRef.current;
    const capaVias = capaViasRef.current;
    if (!mapa || !capaVias) return;

    capaVias.clearLayers();
    if (!verCuadras) return;

    for (const via of vias) {
      const esArterial = via.tipo_via === 'arterial';
      const colorLinea = esArterial
        ? esOscuro
          ? '#38BDF8'
          : '#0B3B69'
        : esOscuro
          ? '#94A3B8'
          : '#64748B';

      const linea = L.polyline(via.tramo, {
        color: colorLinea,
        weight: esArterial ? 5 : 3.5,
        opacity: modoSeleccion ? 0.78 : esOscuro ? 0.55 : 0.45,
        dashArray: esArterial ? undefined : '5, 5',
      });

      linea.bindTooltip(
        `<div style="font-size:12px;"><strong>${escaparHtml(via.id)}</strong><br/>${escaparHtml(via.nombre)}<br/><em>${esArterial ? 'Arterial' : 'Secundaria'} · ${escaparHtml(via.sector)}</em></div>`,
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
      const puntos = [
        ...vias.flatMap((v) => v.tramo),
        ...reportes.map((r) => [r.lat, r.lng] as [number, number]),
      ];
      if (puntos.length > 0) {
        mapa.fitBounds(puntos, { padding: [42, 42], maxZoom: 17 });
        yaAjustoLimitesRef.current = true;
      }
    }
  }, [vias, reportes, verCuadras, modoSeleccion, esOscuro, puntoEnfocado]);

  // Capa de calor en tiempo real (HeatLayer de leaflet.heat) ponderada por criticidad, confirmaciones, antigüedad y estado
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (!verCalor || reportes.length === 0) {
      if (capaCalorRef.current) {
        mapa.removeLayer(capaCalorRef.current);
        capaCalorRef.current = null;
      }
      return;
    }

    const ahoraMs = Date.now();
    const puntosCalor: [number, number, number][] = [];

    for (const r of reportes) {
      const peso = calcularPesoCalorReporte(r, ahoraMs);
      puntosCalor.push([r.lat, r.lng, peso]);

      // Refuerzo adicional en el heatmap proporcional a confirmaciones (+1) en reportes activos
      const confirmacionesExtra =
        r.estado === 'solucionado' ? 0 : Math.min(4, Math.max(0, (r.confirmaciones ?? 1) - 1));
      for (let k = 0; k < confirmacionesExtra; k += 1) {
        puntosCalor.push([r.lat, r.lng, Math.min(1, peso * 0.75)]);
      }
    }

    const opcionesCalor = {
      pane: 'heatmapPane',
      radius: 19,
      blur: 14,
      maxZoom: 17,
      max: 1.0,
      minOpacity: 0.14,
      gradient: {
        0.2: '#2563EB',
        0.45: '#06B6D4',
        0.65: '#F59E0B',
        0.85: '#EA580C',
        1.0: '#DC2626',
      },
    };

    let efectoActivo = true;
    const aplicarCapaCalor = () => {
      if (!efectoActivo || !mapaRef.current) return;
      const size = mapa.getSize();
      if (size.x <= 0 || size.y <= 0) {
        mapa.invalidateSize({ animate: false });
      }

      if (capaCalorRef.current) {
        capaCalorRef.current.setOptions(opcionesCalor);
        capaCalorRef.current.setLatLngs(puntosCalor);
        capaCalorRef.current.redraw();
      } else {
        const heat = crearCapaCalor(puntosCalor, opcionesCalor);
        heat.addTo(mapa);
        capaCalorRef.current = heat;
      }
    };

    mapa.whenReady(() => {
      aplicarCapaCalor();
    });

    return () => {
      efectoActivo = false;
    };
  }, [reportes, verCalor]);

  // Capa de zonas acumulativas por proximidad (15-30 m)
  useEffect(() => {
    const capaZonas = capaZonasRef.current;
    if (!capaZonas) return;

    capaZonas.clearLayers();
    if (!verZonas || modoSeleccion) return;

    for (const zona of agrupacion.zonasAlerta) {
      const circulo = L.circle([zona.centro.lat, zona.centro.lng], {
        radius: zona.radioMetros,
        color: '#DC2626',
        weight: 2,
        dashArray: '6, 5',
        fillColor: '#EF4444',
        fillOpacity: esOscuro ? 0.14 : 0.1,
      });

      const horaUltimo = zona.ultimoReporte.replace('T', ' ');
      const popupHtml = `
        <div style="min-width:240px;font-family:inherit;line-height:1.45;">
          <div style="font-size:12px;font-weight:700;color:#DC2626;margin-bottom:4px;">
            Zona crítica acumulada (${zona.radioMetros} m)
          </div>
          <div style="font-size:11px;margin-bottom:6px;">
            ${escaparHtml(zona.mensajeAlerta)}
          </div>
          <div style="font-size:11px;border-top:1px solid ${esOscuro ? '#334155' : '#E2E8F0'};padding-top:6px;">
            <div><strong>Categoría:</strong> ${escaparHtml(ETIQUETAS_CATEGORIA_CORTA[zona.categoria])}</div>
            <div><strong>Reportes acumulados:</strong> ${zona.cantidadAcumulada} (${zona.cantidadRegistros} registro(s))</div>
            <div><strong>Último reporte:</strong> ${escaparHtml(horaUltimo)}</div>
            <div><strong>Tiempo entre primer y último:</strong> ${escaparHtml(zona.tiempoEntreReportesTexto)}</div>
          </div>
          ${
            onConfirmarReporteRef.current
              ? `<button type="button" data-confirmar-id="${escaparHtml(zona.reportePrincipal.id)}" style="margin-top:8px;width:100%;padding:6px 10px;background:#0B3B69;color:#FFFFFF;border:none;font-size:11px;font-weight:600;cursor:pointer;">Volver a reportar (+1)</button>`
              : ''
          }
        </div>
      `;

      circulo.bindPopup(popupHtml);
      circulo.on('click', () => {
        onSeleccionarZonaRef.current?.(zona);
        onSeleccionarReporteRef.current?.(zona.reportePrincipal);
      });
      circulo.addTo(capaZonas);

      // Insignia numérica en el centro de la zona para evitar marcadores duplicados
      const icono = L.divIcon({
        className: 'leaflet-cluster-badge',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        html: `<div style="width:32px;height:32px;border-radius:9999px;background:#DC2626;border:2px solid #FFFFFF;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${zona.cantidadAcumulada}</div>`,
      });

      const marcadorZona = L.marker([zona.centro.lat, zona.centro.lng], {
        icon: icono,
      });
      marcadorZona.bindPopup(popupHtml);
      marcadorZona.on('click', () => {
        onSeleccionarZonaRef.current?.(zona);
        onSeleccionarReporteRef.current?.(zona.reportePrincipal);
      });
      marcadorZona.addTo(capaZonas);
    }
  }, [agrupacion, verZonas, modoSeleccion, esOscuro]);

  // Capa de puntos individuales (omite puntos ya agrupados cuando Zonas está activo para evitar duplicación visual)
  useEffect(() => {
    const capaPuntos = capaPuntosRef.current;
    if (!capaPuntos) return;

    capaPuntos.clearLayers();
    if (!verPuntos) return;

    const listaPuntos =
      verZonas && !modoSeleccion ? agrupacion.reportesAislados : reportes;

    for (const r of listaPuntos) {
      const esSolucionado = r.estado === 'solucionado';
      const color = esSolucionado ? '#64748B' : colorPorNivel(r.criticidad.nivel);
      const confirmaciones = Math.max(1, r.confirmaciones ?? 1);

      const marcador = L.circleMarker([r.lat, r.lng], {
        radius: esSolucionado ? 5 : r.criticidad.nivel === 'Alto' ? 7.5 : 6,
        fillColor: color,
        color: esOscuro ? '#0F172A' : '#FFFFFF',
        weight: 2,
        opacity: esSolucionado ? 0.65 : 1,
        fillOpacity: esSolucionado ? 0.5 : 0.92,
      });

      const hora = (r.ultima_confirmacion ?? r.fecha_hora).replace('T', ' ');
      const contenidoPopup = `
        <div style="min-width:220px;font-family:inherit;line-height:1.4;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="font-size:13px;">${escaparHtml(r.id)} · ${escaparHtml(r.cuadra)}</strong>
            <span style="font-size:11px;font-weight:600;color:${color};">${esSolucionado ? 'Solucionado' : `${r.criticidad.nivel} (${r.criticidad.puntaje} pts)`}</span>
          </div>
          <div style="font-size:12px;margin-bottom:2px;">${escaparHtml(ETIQUETAS_CATEGORIA_CORTA[r.categoria])}</div>
          <div style="font-size:11px;opacity:0.8;margin-bottom:4px;">${escaparHtml(ETIQUETAS_ACTOR[r.actor])} · ${escaparHtml(hora)}</div>
          <div style="font-size:11px;font-weight:600;margin-bottom:4px;">Confirmaciones: ${confirmaciones}</div>
          ${r.observacion ? `<div style="font-size:11px;border-top:1px solid ${esOscuro ? '#334155' : '#E2E8F0'};padding-top:4px;margin-top:4px;">${escaparHtml(r.observacion)}</div>` : ''}
          ${
            !esSolucionado && onConfirmarReporteRef.current
              ? `<button type="button" data-confirmar-id="${escaparHtml(r.id)}" style="margin-top:8px;width:100%;padding:6px 10px;background:#0B3B69;color:#FFFFFF;border:none;font-size:11px;font-weight:600;cursor:pointer;">Volver a reportar (+1)</button>`
              : ''
          }
        </div>
      `;

      marcador.bindPopup(contenidoPopup);
      marcador.on('click', () => {
        onSeleccionarReporteRef.current?.(r);
      });
      marcador.addTo(capaPuntos);
    }
  }, [reportes, agrupacion, verPuntos, verZonas, modoSeleccion, esOscuro]);

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

  // Enfocar punto o dirección buscada
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !puntoEnfocado) return;

    if (marcadorBuscadoRef.current) {
      mapa.removeLayer(marcadorBuscadoRef.current);
      marcadorBuscadoRef.current = null;
    }

    mapa.setView([puntoEnfocado.lat, puntoEnfocado.lng], puntoEnfocado.zoom ?? 17, {
      animate: true,
    });

    if (puntoEnfocado.etiqueta && !modoSeleccion) {
      const pinBuscado = L.circleMarker([puntoEnfocado.lat, puntoEnfocado.lng], {
        radius: 9,
        fillColor: '#0EA5E9',
        color: '#FFFFFF',
        weight: 3,
        opacity: 1,
        fillOpacity: 0.95,
      }).addTo(mapa);
      pinBuscado.bindTooltip(escaparHtml(puntoEnfocado.etiqueta), {
        permanent: false,
        direction: 'top',
      });
      marcadorBuscadoRef.current = pinBuscado;
    }
  }, [puntoEnfocado, modoSeleccion]);

  return (
    <div className="relative w-full overflow-hidden border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
      {mostrarControlesCapas && (
        <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Capas del mapa:
              </span>
              <button
                type="button"
                onClick={() => setVerCalor((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  verCalor
                    ? 'bg-[#0B3B69] text-white dark:bg-sky-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Mapa de calor
              </button>
              <button
                type="button"
                onClick={() => setVerZonas((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  verZonas
                    ? 'bg-[#DC2626] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Zonas agrupadas ({agrupacion.zonasAlerta.length})
              </button>
              <button
                type="button"
                onClick={() => setVerPuntos((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  verPuntos
                    ? 'bg-[#0B3B69] text-white dark:bg-sky-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Puntos ({verZonas ? agrupacion.reportesAislados.length : reportes.length})
              </button>
              <button
                type="button"
                onClick={() => setVerCuadras((v) => !v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  verCuadras
                    ? 'bg-[#0B3B69] text-white dark:bg-sky-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Cuadras
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
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

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <label htmlFor="rango-proximidad" className="font-medium whitespace-nowrap">
                Radio de proximidad:
              </label>
              <input
                id="rango-proximidad"
                type="range"
                min={RADIO_PROXIMIDAD_MIN}
                max={RADIO_PROXIMIDAD_MAX}
                step={1}
                value={radioActivo}
                onChange={(e) => actualizarRadio(Number(e.target.value))}
                className="w-28 accent-[#0B3B69] dark:accent-sky-500 cursor-pointer"
              />
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {radioActivo} m
              </span>
              <span className="text-slate-400 dark:text-slate-500">(15–30 m)</span>
            </div>
            <span className="text-slate-500 dark:text-slate-400">
              El calor se intensifica con +1 confirmaciones y se atenúa en reportes antiguos o solucionados.
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
