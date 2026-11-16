/** Una lectura de la estación, ya en unidades métricas. */
export interface Lectura {
  /** Segundos Unix (UTC), redondeado al minuto */
  ts: number;
  /** Conector del que viene: "directo", "ecowitt_api", "wunderground", "meteoclimatic", "aemet" (en datos antiguos, "push" o "api") */
  fuente: string;
  temp: number | null;
  hum: number | null;
  rocio: number | null;
  sensacion: number | null;
  presion: number | null;
  presion_abs: number | null;
  viento: number | null;
  racha: number | null;
  dir: number | null;
  lluvia_dia: number | null;
  intensidad: number | null;
  radiacion: number | null;
  uv: number | null;
  temp_int: number | null;
  hum_int: number | null;
}

export interface ResumenDiario {
  fecha: string;
  tmax: number | null;
  tmax_ts: number | null;
  tmin: number | null;
  tmin_ts: number | null;
  hum_max: number | null;
  hum_min: number | null;
  presion_max: number | null;
  presion_min: number | null;
  viento_max: number | null;
  racha_max: number | null;
  racha_max_ts: number | null;
  lluvia: number | null;
  intensidad_max: number | null;
  intensidad_max_ts: number | null;
  radiacion_max: number | null;
  uv_max: number | null;
  lecturas: number;
}

/** Datos públicos de una estación. */
export interface Estacion {
  id: number;
  slug: string;
  tipo: "particular" | "oficial";
  red: string | null;
  nombre: string;
  municipio: string;
  provincia: string;
  lat: number;
  lon: number;
  altitud: number;
  descripcion: string | null;
  equipo: string | null;
  meteoclimatic: string | null;
  fuente: string;
  /** Nombre del usuario al que pertenece (las particulares) */
  propietario: string | null;
}

/** Una estación con sus datos actuales (tarjetas de la portada y página de la estación). */
export interface RespuestaDatos {
  estacion: Estacion;
  actual: Lectura | null;
  hoy: ResumenDiario | null;
  ayer: ResumenDiario | null;
  /** Temperatura de hace una hora (para la tendencia) */
  temp1h: number | null;
  /** Hora del servidor (segundos Unix) */
  ahora: number;
}

/** Datos de la red para la portada. */
export interface Red {
  nombre: string;
  titulo: string;
  subtitulo: string;
  lugar: string;
  lat: number;
  lon: number;
  altitud: number;
}

export interface RespuestaRed {
  red: Red;
  estaciones: RespuestaDatos[];
  ahora: number;
}

/** Serie de temperatura por estación (gráfica comparativa): slug → [t, temp][] */
export type SeriesRed = Record<string, [number, number | null][]>;

/** Un lugar para la previsión. */
export interface Lugar {
  nombre: string;
  lat: number;
  lon: number;
  altitud: number;
}

/** Media de 5 minutos para las gráficas */
export interface PuntoHistorico {
  t: number;
  temp: number | null;
  rocio: number | null;
  hum: number | null;
  presion: number | null;
  viento: number | null;
  racha: number | null;
  dir: number | null;
  lluvia_dia: number | null;
  intensidad: number | null;
  radiacion: number | null;
  uv: number | null;
}

/** Un extremo: valor, día y (si se conoce) hora */
export interface Extremo {
  valor: number;
  fecha: string;
  ts: number | null;
}

export interface Extremos {
  tmax: Extremo | null;
  tmin: Extremo | null;
  hum_min: Extremo | null;
  viento_max: Extremo | null;
  racha_max: Extremo | null;
  presion_max: Extremo | null;
  presion_min: Extremo | null;
  lluvia_dia_max: Extremo | null;
  intensidad_max: Extremo | null;
  radiacion_max: Extremo | null;
  uv_max: Extremo | null;
  media_tmax: number | null;
  media_tmin: number | null;
  lluvia_total: number | null;
  dias_lluvia: number;
  dias: number;
  mes_mas_lluvioso: { mes: string; valor: number } | null;
}

export interface VientoMinuto {
  dir: number | null;
  viento: number | null;
  racha: number | null;
}

export interface RespuestaEstacion {
  ahora: number;
  actual: Lectura | null;
  hoy: ResumenDiario | null;
  ayer: ResumenDiario | null;
  hace1h: Lectura | null;
  hace3h: Lectura | null;
  hace24h: Lectura | null;
  vientoUltimaHora: VientoMinuto[];
  vientoMediaHoy: number | null;
  lluvia: {
    ultimaHora: number | null;
    h24: number | null;
    d7: number | null;
    mes: number | null;
    anio: number | null;
    /** Año hidrológico (desde el 1 de octubre) */
    hidrologico: number | null;
    /** Año agrícola (desde el 1 de septiembre) */
    agricola: number | null;
  };
  mes: Extremos;
  anio: Extremos;
  records: Extremos;
  /** Primer día con datos */
  desde: string | null;
}

export interface PrevisionHora {
  t: number;
  temp: number;
  hum: number;
  lluvia: number;
  prob: number;
  codigo: number;
  viento: number;
  racha: number;
  dir: number;
  dia: boolean;
}

export interface PrevisionDia {
  fecha: string;
  codigo: number;
  tmax: number;
  tmin: number;
  lluvia: number;
  prob: number;
  viento: number;
  racha: number;
  dir: number;
  salida: number;
  puesta: number;
}

export interface RespuestaPrevision {
  generado: number;
  horas: PrevisionHora[];
  dias: PrevisionDia[];
}

export interface RespuestaRadar {
  /** Imágenes del radar (RainViewer), de la más antigua a la más reciente: instante y plantilla de teselas con {z}/{x}/{y} */
  imagenes: { t: number; url: string }[];
  /** Zona archivada (fuera de ella solo hay radar de las 2 últimas horas): [[sur, oeste], [norte, este]] */
  zona: [[number, number], [number, number]];
}

export interface RespuestaSatelite {
  capa: string;
  /** Límites de la imagen: [[sur, oeste], [norte, este]] */
  limites: [[number, number], [number, number]];
  /** Imágenes de la animación, de la más antigua a la más reciente */
  imagenes: { t: string; url: string }[];
  /** Primera y última imagen que existen en el archivo de EUMETSAT (ISO 8601) */
  primera: string;
  ultima: string;
  /** Minutos entre imágenes */
  paso: number;
}

// ===== Cuentas y gestión =====

import type { Tema } from "./temas";
export type { Tema };

export interface UsuarioSesion {
  id: number;
  email: string;
  nombre: string;
  rol: "usuario" | "admin";
  tema: Tema;
}

export interface CampoConector {
  nombre: string;
  etiqueta: string;
  tipo: "texto" | "secreto";
  obligatorio: boolean;
  ayuda?: string;
  ejemplo?: string;
}

export interface InfoConector {
  id: string;
  nombre: string;
  descripcion: string;
  /** "envio": la estación envía; "consulta": el Worker la lee cada cierto tiempo */
  modo: "envio" | "consulta";
  intervalo: number;
  campos: CampoConector[];
  soloAdmin: boolean;
}

/** Estación tal como la ve su dueño (incluye la clave de envío y el estado). */
export interface EstacionPropia extends Estacion {
  token: string | null;
  publica: boolean;
  activa: boolean;
  /** Configuración del conector; los campos secretos llegan como "••••" si están puestos */
  config: Record<string, string>;
  ultima: number | null;
  ultima_consulta: number | null;
  ultimo_error: string | null;
}

export interface Ubicacion extends Lugar {
  id: number;
}

export interface RespuestaCuenta {
  usuario: UsuarioSesion;
  estaciones: EstacionPropia[];
  ubicaciones: Ubicacion[];
}

export interface Invitacion {
  codigo: string;
  email: string | null;
  nota: string | null;
  creada: number;
  caduca: number;
  usada: number | null;
  usada_por_nombre: string | null;
}

// ===== Embalses =====

export interface DatoReciente {
  /** Instante de la lectura (segundos Unix) */
  ts: number;
  volumen: number | null;
  porcentaje: number | null;
  nivel: number | null;
  fuente: string;
}

export interface Embalse {
  slug: string;
  nombre: string;
  rio: string | null;
  provincia: string;
  cuenca: string;
  lat: number | null;
  lon: number | null;
  capacidad: number | null;
  /** Dato semanal (boletín del MITECO) */
  volumen: number | null;
  porcentaje: number | null;
  variacion: number | null;
  fecha: string | null;
  /** Dato más reciente del SAIH, si es posterior al semanal */
  reciente: DatoReciente | null;
  /** Porcentaje semanal del último año: [fecha, %] */
  serie: [string, number | null][];
  maximo: { volumen: number; fecha: string } | null;
  minimo: { volumen: number; fecha: string } | null;
  /** Primer dato del histórico */
  desde: string | null;
  url: string;
  /** Porcentaje de la misma semana del año pasado */
  anioPasado: number | null;
  /** Porcentaje medio de esta semana en los años anteriores del histórico */
  media: { porcentaje: number; anios: number } | null;
}

export interface RespuestaEmbalses {
  fecha: string | null;
  embalses: Embalse[];
  /** Embalses configurados que no se han podido leer */
  errores: string[];
}

/** Entrada del catálogo para elegir embalses */
export interface EmbalseCatalogo {
  slug: string;
  nombre: string;
  provincia: string;
  cuenca: string;
  capacidad: number | null;
  porcentaje: number | null;
  elegido: boolean;
}

export interface SemanaEmbalse {
  fecha: string;
  volumen: number | null;
  porcentaje: number | null;
  variacion: number | null;
}

/** Página de un embalse: todo lo de la tarjeta más el histórico completo y comparativas. */
export interface DetalleEmbalse extends Embalse {
  municipio: string | null;
  anioConstruccion: number | null;
  uso: string | null;
  historico: SemanaEmbalse[];
  /** Misma semana del año pasado */
  haceUnAnio: SemanaEmbalse | null;
  /** Media de la misma semana en los años anteriores del histórico */
  mediaSemana: { volumen: number; porcentaje: number; anios: number } | null;
}

// ===== Río (caudal estimado por GloFAS) =====

export interface DiaRio {
  fecha: string;
  /** Caudal estimado (m³/s); en la previsión, el escenario central */
  caudal: number | null;
  /** Rango de los escenarios de la previsión (null en los días pasados) */
  minimo: number | null;
  maximo: number | null;
  /** Mediana de esta época del año en el histórico */
  normal: number | null;
  /** Percentil 90 de esta época: por encima, el río va alto */
  alto: number | null;
  prevision: boolean;
}

export interface RespuestaRio {
  lat: number;
  lon: number;
  /** Último día ya pasado con dato */
  actual: DiaRio | null;
  dias: DiaRio[];
  aviso: { nivel: "posible" | "probable"; fecha: string; caudal: number } | null;
  /** Primer año del histórico usado para lo normal */
  desde: string | null;
}
