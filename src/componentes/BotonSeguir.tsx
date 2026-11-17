// Estrella para seguir un río o un embalse (solo con cuenta). Va dentro de tarjetas que son enlaces.
export default function BotonSeguir({ activo, ocupado, onClick, nombre }: { activo: boolean; ocupado: boolean; onClick: () => void; nombre: string }) {
  return (
    <button
      type="button"
      className={`boton-seguir ${activo ? "activo" : ""}`}
      aria-pressed={activo}
      aria-label={activo ? `Dejar de seguir ${nombre}` : `Seguir ${nombre}`}
      title={activo ? "Dejar de seguir" : "Seguir: aparecerá arriba"}
      disabled={ocupado}
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onClick();
      }}
    >
      {activo ? "★" : "☆"}
    </button>
  );
}
