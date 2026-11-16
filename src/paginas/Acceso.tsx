// Entrar, registrarse con una invitación y crear la primera cuenta de administrador.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { enviar, navegar, usePeticion, useSesion } from "../datos";

function Formulario({ titulo, intro, children, onSubmit, error, ocupado, boton }: {
  titulo: string;
  intro?: ReactNode;
  children: ReactNode;
  onSubmit: () => Promise<void>;
  error: string | null;
  ocupado: boolean;
  boton: string;
}) {
  const enviarForm = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <div className="acceso-pagina">
      <form className="tarjeta formulario" onSubmit={enviarForm}>
        <h1>{titulo}</h1>
        {intro && <p className="suave">{intro}</p>}
        {children}
        {error && (
          <p className="error-form" role="alert">
            {error}
          </p>
        )}
        <button className="boton-principal" disabled={ocupado}>
          {ocupado ? "Un momento…" : boton}
        </button>
      </form>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

function useEnvio(accion: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ejecutar = async () => {
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };
  return { error, ocupado, ejecutar };
}

export function Entrar() {
  const sesion = useSesion();
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const envio = useEnvio(async () => {
    await enviar("/api/auth/entrar", "POST", { email, contrasena });
    await sesion.recargar();
    navegar("/cuenta");
  });
  useEffect(() => {
    if (sesion.necesitaConfiguracion) navegar("/primeros-pasos", true);
  }, [sesion.necesitaConfiguracion]);
  return (
    <Formulario titulo="Entrar" intro="Accede para gestionar tus estaciones y tus lugares." onSubmit={envio.ejecutar} error={envio.error} ocupado={envio.ocupado} boton="Entrar">
      <Campo etiqueta="Email">
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo etiqueta="Contraseña">
        <input type="password" autoComplete="current-password" required value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
      </Campo>
      <p className="suave pequeno">Meteostar funciona por invitación. Si quieres añadir tu estación, pide una invitación al administrador.</p>
    </Formulario>
  );
}

export function Registro({ codigo }: { codigo: string }) {
  const sesion = useSesion();
  const { datos: inv } = usePeticion<{ valida: boolean; email?: string | null }>(codigo ? `/api/auth/invitacion/${encodeURIComponent(codigo)}` : null, 0);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  useEffect(() => {
    if (inv?.email) setEmail(inv.email);
  }, [inv?.email]);
  const envio = useEnvio(async () => {
    await enviar("/api/auth/registro", "POST", { codigo, nombre, email, contrasena });
    await sesion.recargar();
    navegar("/cuenta/estacion/nueva");
  });
  if (!codigo || (inv && !inv.valida)) {
    return (
      <div className="acceso-pagina">
        <div className="tarjeta formulario">
          <h1>Invitación no válida</h1>
          <p className="suave">El enlace no es válido, ya se ha usado o ha caducado. Pide una nueva invitación al administrador.</p>
        </div>
      </div>
    );
  }
  return (
    <Formulario
      titulo="Crear tu cuenta"
      intro="Te han invitado a Meteostar. Crea tu cuenta y después añade tu estación."
      onSubmit={envio.ejecutar}
      error={envio.error}
      ocupado={envio.ocupado || !inv}
      boton="Crear cuenta"
    >
      <Campo etiqueta="Tu nombre" ayuda="Se muestra como responsable de tus estaciones">
        <input required maxLength={80} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <Campo etiqueta="Email">
        <input type="email" required autoComplete="email" value={email} readOnly={!!inv?.email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo etiqueta="Contraseña" ayuda="Al menos 10 caracteres">
        <input type="password" required minLength={10} autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
      </Campo>
    </Formulario>
  );
}

export function PrimerosPasos() {
  const sesion = useSesion();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const envio = useEnvio(async () => {
    await enviar("/api/auth/primeros-pasos", "POST", { codigo, nombre, email, contrasena });
    await sesion.recargar();
    navegar("/admin");
  });
  if (sesion.cargada && !sesion.necesitaConfiguracion) {
    return (
      <div className="acceso-pagina">
        <div className="tarjeta formulario">
          <h1>Meteostar ya está configurado</h1>
          <p className="suave">
            Ya existe una cuenta de administrador. <a href="/entrar">Entrar</a>
          </p>
        </div>
      </div>
    );
  }
  return (
    <Formulario
      titulo="Primeros pasos"
      intro="Crea la cuenta de administrador. Solo se puede hacer una vez, con el código de configuración (el secreto SETUP_TOKEN del Worker)."
      onSubmit={envio.ejecutar}
      error={envio.error}
      ocupado={envio.ocupado}
      boton="Crear administrador"
    >
      <Campo etiqueta="Código de configuración">
        <input required autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
      </Campo>
      <Campo etiqueta="Tu nombre">
        <input required maxLength={80} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <Campo etiqueta="Email">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo etiqueta="Contraseña" ayuda="Al menos 10 caracteres">
        <input type="password" required minLength={10} autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
      </Campo>
    </Formulario>
  );
}
