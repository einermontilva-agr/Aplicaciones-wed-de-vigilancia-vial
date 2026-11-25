export type CategoriaObstruccion =
  | 'doble_fila'
  | 'bloqueo_rampa_cebra_paradero'
  | 'invasion_anden';

export type TipoActor =
  | 'vehiculo_particular'
  | 'motocicleta'
  | 'vehiculo_carga'
  | 'mobiliario_comercial';

export type TipoVia = 'arterial' | 'secundaria';

export type FranjaHoraria = 'pico' | 'valle';

export type NivelCriticidad = 'Bajo' | 'Medio' | 'Alto';

export type OrigenReporte = 'campo' | 'ciudadano' | 'importado';

export type EstadoReporte = 'activo' | 'solucionado';

export interface CuadraVia {
  id: string;
  nombre: string;
  sector: string;
  tipo_via: TipoVia;
  lat: number;
  lng: number;
  tramo: [number, number][];
}

export interface CriteriosCriticidad {
  categoria: Record<CategoriaObstruccion, number>;
  via: Record<TipoVia, number>;
  franja: Record<FranjaHoraria, number>;
  horas_pico: string[];
  niveles: Record<NivelCriticidad, [number, number]>;
}

export interface DesgloseCriticidad {
  puntaje: number;
  nivel: NivelCriticidad;
  puntosCategoria: number;
  puntosVia: number;
  puntosFranja: number;
  tipoVia: TipoVia;
  franja: FranjaHoraria;
}

export interface Reporte {
  id: string;
  origen: OrigenReporte;
  fecha_hora: string;
  lat: number;
  lng: number;
  cuadra: string;
  categoria: CategoriaObstruccion;
  actor: TipoActor;
  foto?: string;
  observacion?: string;
  confirmaciones?: number;
  ultima_confirmacion?: string;
  estado?: EstadoReporte;
  solucionado_en?: string;
  validacion_ia?: {
    valida: boolean;
    resumen: string;
  };
  criticidad: {
    puntaje: number;
    nivel: NivelCriticidad;
  };
}

export interface OverrideReporte {
  confirmaciones?: number;
  ultima_confirmacion?: string;
  estado?: EstadoReporte;
  solucionado_en?: string;
}

export interface ZonaProximidad {
  id: string;
  categoria: CategoriaObstruccion;
  centro: { lat: number; lng: number };
  radioMetros: number;
  reportes: Reporte[];
  cantidadRegistros: number;
  cantidadAcumulada: number;
  primerReporte: string;
  ultimoReporte: string;
  tiempoEntreReportesTexto: string;
  tiempoDesdeUltimoTexto: string;
  esAlerta: boolean;
  mensajeAlerta: string;
  reportePrincipal: Reporte;
}

export interface ResultadoBusquedaUbicacion {
  id: string;
  nombre: string;
  detalle: string;
  lat: number;
  lng: number;
  tipo: 'coordenada' | 'cuadra' | 'barrio' | 'lugar' | 'direccion';
  zoom?: number;
}

export interface ResultadoValidacionFoto {
  valida: boolean;
  muyBorrosa: boolean;
  iluminacionInsuficiente: boolean;
  imagenBlancaONegra: boolean;
  observaIncidente: boolean;
  correspondeCategoria: boolean;
  posibleFalsaOCaptura: boolean;
  motivoRechazo: string;
  resumen: string;
}

export interface FiltrosActivos {
  sector: string; // 'todos' o nombre de sector
  cuadra: string; // 'todas' o id de cuadra
  franja: 'todas' | FranjaHoraria;
  horaDesde: string; // HH:mm o ''
  horaHasta: string; // HH:mm o ''
  categoria: 'todas' | CategoriaObstruccion;
  actor: 'todos' | TipoActor;
  nivel: 'todos' | NivelCriticidad;
}

export interface RecomendacionCuadra {
  cuadraId: string;
  nombre: string;
  sector: string;
  tipoVia: TipoVia;
  totalReportes: number;
  puntajeAcumulado: number;
  promedioPuntaje: number;
  reportesAltoPico: number;
  reportesAlto: number;
  categoriaDominante: CategoriaObstruccion;
  actorDominante: TipoActor;
  recomendacion: string;
  reglaId: string;
  reglaTexto: string;
}

export interface ZonaPrivacidad {
  id: string;
  tipo: 'rostro' | 'placa' | 'manual';
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  origen: 'ia' | 'manual';
}

export const ETIQUETAS_CATEGORIA: Record<CategoriaObstruccion, string> = {
  doble_fila: 'Estacionamiento en vía prohibida o doble fila',
  bloqueo_rampa_cebra_paradero: 'Bloqueo de rampa peatonal, cebra o paradero',
  invasion_anden: 'Invasión de andén por comercio o mercancía',
};

export const ETIQUETAS_CATEGORIA_CORTA: Record<CategoriaObstruccion, string> = {
  doble_fila: 'Doble fila / vía prohibida',
  bloqueo_rampa_cebra_paradero: 'Rampa, cebra o paradero',
  invasion_anden: 'Invasión de andén',
};

export const ETIQUETAS_ACTOR: Record<TipoActor, string> = {
  vehiculo_particular: 'Vehículo particular',
  motocicleta: 'Motocicleta',
  vehiculo_carga: 'Vehículo de carga descargando',
  mobiliario_comercial: 'Mobiliario comercial',
};

export const ETIQUETAS_VIA: Record<TipoVia, string> = {
  arterial: 'Vía arterial',
  secundaria: 'Vía secundaria',
};

export const ETIQUETAS_FRANJA: Record<FranjaHoraria, string> = {
  pico: 'Hora pico',
  valle: 'Hora valle',
};
