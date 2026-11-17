// Ríos y embalses que sigue el usuario. Sin cuenta (o si no ha elegido ninguno) se usan los de por defecto.
import { useState } from "react";
import { enviar, useSesion } from "./datos";

export type TipoSeguido = "rio" | "embalse";

export function useSeguidos(tipo: TipoSeguido, porDefecto: string[]) {
  const sesion = useSesion();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const usuario = sesion.usuario;
  const propios = usuario ? (tipo === "rio" ? usuario.favoritos.rios : usuario.favoritos.embalses) : [];
  return {
    usuario: !!usuario,
    /** Los que sigue el usuario (vacío si no ha elegido o no tiene cuenta) */
    propios,
    /** Los que se muestran destacados: los suyos o, si no hay, los de por defecto */
    destacados: propios.length ? propios : porDefecto,
    sonPropios: propios.length > 0,
    sigue: (slug: string) => propios.includes(slug),
    ocupado,
    alternar: async (slug: string) => {
      if (!usuario) return;
      setOcupado(slug);
      try {
        await enviar("/api/cuenta/favoritos", "PUT", { tipo, slug, seguir: !propios.includes(slug) });
        await sesion.recargar();
      } finally {
        setOcupado(null);
      }
    },
  };
}
