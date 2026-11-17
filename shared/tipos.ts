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

// ===== Ríos: aforos medidos (Observatorio del Agua, MITECO), histórico (Anuario de Aforos) y previsión (GloFAS) =====

/** Aforo de río configurado en Meteostar. */
export interface AforoConfig {
  slug: string;
  nombre: string;
  rio: string;
  /** Código de la estación de aforo (ROEA) */
  codigo: string | null;
  confederacion: string | null;
  lat: number;
  lon: number;
  /** Embalse que regula el río aguas arriba (slug de la sección de embalses) */
  embalse: string | null;
  /** Año desde el que el río está regulado por ese embalse */
  reguladoDesde: number | null;
}

/** Tarjeta de un aforo: última lectura y cómo va. */
export interface Aforo extends AforoConfig {
  ultimo: { t: number; caudal: number | null; nivel: number | null } | null;
  /** Variación del caudal en las últimas 3 horas (m³/s) */
  tendencia: number | null;
  /** Umbrales oficiales de aviso (m³/s), de menor a mayor */
  umbrales: number[];
  /** Percentiles 10, 25, 50, 75 y 90 de esta época del año (si hay histórico) */
  normalHoy: [number, number, number, number, number] | null;
  /** Caudal de las últimas 48 h, una lectura por hora: [segundos, m³/s] */
  mini: [number, number][];
}

export interface RespuestaAforos {
  aforos: Aforo[];
}

/** Página de un aforo. */
export interface DetalleAforo extends Aforo {
  /** Últimos 30 días: [segundos, caudal m³/s, nivel m] */
  serie: [number, number | null, number | null][];
  /** Lluvia diaria en la estación de Meteostar más cercana */
  lluvia: { slug: string; nombre: string; km: number; dias: [string, number | null][] } | null;
  tieneHistorico: boolean;
}

/** Entrada del catálogo de aforos del Observatorio (para añadirlos). */
export interface AforoCatalogo {
  elemento: string;
  nombre: string;
  demarcacion: string;
  lat: number;
  lon: number;
  elegido: boolean;
}

export interface DiaRio {
  fecha: string;
  /** Caudal (m³/s); en la previsión, el escenario central */
  caudal: number | null;
  /** Escenarios centrales de la previsión: percentiles 25 y 75 (null en los días pasados) */
  minimo: number | null;
  maximo: number | null;
  /** Lo normal para la época y lo habitualmente alto (p90) */
  normal: number | null;
  alto: number | null;
  prevision: boolean;
}

export interface RespuestaRio {
  /** true: cifras corregidas con el histórico del aforo; false: solo sirve la tendencia */
  corregida: boolean;
  dias: DiaRio[];
  aviso: { nivel: "posible" | "probable"; fecha: string; caudal: number } | null;
}

export interface AnioAforo {
  /** Año hidrológico: 2021 = de octubre de 2021 a septiembre de 2022 */
  anio: number;
  media: number;
  /** Agua que ha pasado en el año (hm³) */
  volumen: number;
  maximo: number;
  fechaMaximo: string;
  dias: number;
}

export interface CrecidaAforo {
  fecha: string;
  caudal: number;
}

/** Corrección del modelo: cuantiles del modelo y del aforo para cada estación del año (dic-feb, mar-may, jun-ago, sep-nov). */
export interface CorreccionModelo {
  modelo: number[][];
  aforo: number[][];
  lat: number;
  lon: number;
}

export interface ResumenAforo {
  estacion: string;
  /** Percentiles 10, 25, 50, 75 y 90 del caudal diario para cada día del año hidrológico (0 = 1 de octubre) */
  normal: ([number, number, number, number, number] | null)[];
  /** Caudal medio de cada mes (enero = 0) en el periodo normal */
  mesesNormal: (number | null)[];
  periodoNormal: string;
  /** Años hidrológicos completos */
  anios: AnioAforo[];
  /** Años hidrológicos con algún dato (para elegir en la gráfica) */
  disponibles: number[];
  /** Mayores caudales medios diarios (episodios distintos) */
  crecidas: CrecidaAforo[];
  /** Mayores caudales instantáneos */
  puntas: CrecidaAforo[];
  /** Lo mismo desde que el río está regulado (si lo está) */
  reguladoDesde: number | null;
  crecidasRegulado: CrecidaAforo[];
  puntasRegulado: CrecidaAforo[];
  correccion: CorreccionModelo | null;
  desde: string | null;
  hasta: string | null;
}

/** [fecha, caudal medio, origen: a = anuario, m = medido en tiempo real] */
export type DiaAforo = [string, number | null, "a" | "m"];
