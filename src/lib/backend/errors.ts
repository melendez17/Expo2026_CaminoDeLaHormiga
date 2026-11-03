export class BackendError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function conflict(
  message = "Los datos cambiaron. Vuelve a intentarlo.",
) {
  return new BackendError(409, "conflict", message);
}
export function mapDatabaseError(error: {
  code?: string;
  message?: string;
}): BackendError {
  const message = error.message ?? "";
  if (error.code === "23505")
    return new BackendError(
      409,
      message.includes("email")
        ? "email_exists"
        : message.includes("public_token")
          ? "token_collision"
          : "duplicate",
      message.includes("email")
        ? "Ya existe una persona con ese correo."
        : "El registro ya existe.",
    );
  const known: Record<string, [number, string]> = {
    revision_conflict: [409, "Los datos cambiaron. Reintenta la operación."],
    idempotency_conflict: [
      409,
      "El identificador de solicitud ya se utilizó con otros datos.",
    ],
    not_found: [404, "Registro no disponible."],
    forbidden: [403, "Esta operación no está permitida."],
    invalid_credential: [401, "Acceso inválido o vencido."],
    no_tickets: [409, "No hay tiquetes disponibles para el sorteo."],
    voting_closed: [409, "La votación está cerrada."],
    raffle_closed: [409, "La rifa no está habilitada."],
    invalid_state: [422, "El cambio no conserva las reglas del recorrido."],
    rate_limited: [429, "Demasiados intentos. Espera un momento."],
    already_initialized: [409, "La base de datos ya fue inicializada."],
  };
  const found = known[message];
  if (found) return new BackendError(found[0], message, found[1]);
  if (["23503", "23514", "22P02", "22023"].includes(error.code ?? ""))
    return new BackendError(
      422,
      "invalid_data",
      "Los datos no cumplen las reglas de la base de datos.",
    );
  return new BackendError(
    500,
    "database_error",
    "No se pudo completar la operación.",
  );
}
