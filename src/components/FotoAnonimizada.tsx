import React, { useState } from 'react';
import {
  CategoriaObstruccion,
  ETIQUETAS_ACTOR,
  ETIQUETAS_CATEGORIA_CORTA,
  TipoActor,
} from '../types';

interface FotoAnonimizadaProps {
  foto?: string;
  reporteId: string;
  categoria: CategoriaObstruccion;
  actor: TipoActor;
  cuadra: string;
  className?: string;
  compact?: boolean;
}

/**
 * Renderiza la evidencia visual del reporte sin desenfoque ni pixelación:
 * - Si el usuario cargó una fotografía, se muestra nítida tal como fue capturada.
 * - Si pertenece a los registros precargados de campo, muestra un esquema vectorial nítido
 *   de la escena urbana (sin bloques borrosos ni pixelados).
 */
export const FotoAnonimizada: React.FC<FotoAnonimizadaProps> = ({
  foto,
  reporteId,
  categoria,
  actor,
  cuadra,
  className = '',
  compact = false,
}) => {
  const [errorCarga, setErrorCarga] = useState(false);

  const esDataUrl = Boolean(foto && foto.startsWith('data:image/'));

  if (esDataUrl && !errorCarga && foto) {
    return (
      <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
        <img
          src={foto}
          alt={`Evidencia fotográfica ${reporteId} en ${cuadra}`}
          referrerPolicy="no-referrer"
          onError={() => setErrorCarga(true)}
          className="h-full w-full object-cover"
        />
        {!compact && (
          <div className="absolute bottom-2 left-2 bg-slate-950/75 px-2 py-1 font-mono text-[11px] font-medium text-white">
            {reporteId} · {cuadra}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-slate-100 ${className}`}
      role="img"
      aria-label={`Evidencia ${reporteId}: ${ETIQUETAS_CATEGORIA_CORTA[categoria]} (${ETIQUETAS_ACTOR[actor]})`}
    >
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        className="block h-full w-full"
      >
        {/* Cielo y edificaciones nítidas */}
        <rect x="0" y="0" width="320" height="72" fill="#E0F2FE" />
        <rect x="0" y="24" width="76" height="48" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1" />
        <rect x="82" y="16" width="110" height="56" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />
        <rect x="198" y="28" width="122" height="44" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1" />

        {/* Andén y bordillo */}
        <rect x="0" y="72" width="320" height="32" fill="#E2E8F0" />
        <rect x="0" y="102" width="320" height="4" fill="#F59E0B" />

        {/* Calzada */}
        <rect x="0" y="106" width="320" height="74" fill="#334155" />
        <line x1="12" y1="142" x2="72" y2="142" stroke="#F8FAFC" strokeWidth="3" strokeDasharray="18 14" />
        <line x1="110" y1="142" x2="210" y2="142" stroke="#F8FAFC" strokeWidth="3" strokeDasharray="18 14" />
        <line x1="245" y1="142" x2="308" y2="142" stroke="#F8FAFC" strokeWidth="3" strokeDasharray="18 14" />

        {/* Cebra peatonal cuando corresponde */}
        {categoria === 'bloqueo_rampa_cebra_paradero' && (
          <g fill="#F8FAFC" opacity="0.9">
            <rect x="120" y="110" width="12" height="62" />
            <rect x="142" y="110" width="12" height="62" />
            <rect x="164" y="110" width="12" height="62" />
            <rect x="186" y="110" width="12" height="62" />
          </g>
        )}

        {/* Actor nítido según el tipo de obstrucción */}
        {actor === 'vehiculo_carga' && (
          <g transform={categoria === 'invasion_anden' ? 'translate(86,58)' : 'translate(86,92)'}>
            <rect x="0" y="0" width="106" height="46" rx="4" fill="#B45309" />
            <rect x="108" y="12" width="36" height="34" rx="4" fill="#D97706" />
            <rect x="118" y="16" width="20" height="14" rx="2" fill="#BAE6FD" />
            <circle cx="24" cy="48" r="8" fill="#0F172A" />
            <circle cx="88" cy="48" r="8" fill="#0F172A" />
            <circle cx="126" cy="48" r="8" fill="#0F172A" />
          </g>
        )}

        {actor === 'vehiculo_particular' && (
          <g transform={categoria === 'invasion_anden' ? 'translate(95,70)' : 'translate(95,102)'}>
            <path d="M12,18 L30,4 L84,4 L106,18 L122,22 L122,38 L0,38 L0,22 Z" fill="#0B3B69" />
            <polygon points="34,8 56,8 56,18 22,18" fill="#BAE6FD" />
            <polygon points="62,8 82,8 96,18 62,18" fill="#BAE6FD" />
            <circle cx="26" cy="39" r="8" fill="#0F172A" />
            <circle cx="96" cy="39" r="8" fill="#0F172A" />
          </g>
        )}

        {actor === 'motocicleta' && (
          <g transform={categoria === 'invasion_anden' ? 'translate(115,64)' : 'translate(115,98)'}>
            <circle cx="18" cy="32" r="10" fill="none" stroke="#0F172A" strokeWidth="4" />
            <circle cx="66" cy="32" r="10" fill="none" stroke="#0F172A" strokeWidth="4" />
            <path d="M18,32 L34,14 L54,14 L66,32 M38,14 L32,6 L42,6" fill="none" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" />
          </g>
        )}

        {actor === 'mobiliario_comercial' && (
          <g transform="translate(86,52)">
            <path d="M10,20 L54,0 L98,20 Z" fill="#DC2626" />
            <line x1="54" y1="20" x2="54" y2="48" stroke="#475569" strokeWidth="3" />
            <rect x="18" y="34" width="76" height="16" rx="2" fill="#0F766E" />
            <rect x="104" y="30" width="38" height="20" rx="2" fill="#D97706" />
          </g>
        )}
      </svg>

      {!compact && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent px-3 py-2 text-[11px] text-white">
          <span className="font-mono font-medium">{reporteId} · {cuadra}</span>
          <span className="text-slate-200">{ETIQUETAS_CATEGORIA_CORTA[categoria]}</span>
        </div>
      )}
    </div>
  );
};
