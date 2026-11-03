/** Operator-only diagnostics. Never include RPC arguments, HTTP headers or SQL row details. */
export function databaseDiagnostic(
  rpc: string,
  error: { code?: string; message?: string },
) {
  let message = error.message ?? "Sin mensaje del servidor.";
  message = message
    .replace(/https?:\/\/\S+/gi, "[URL omitida]")
    .replace(/Bearer\s+\S+/gi, "Bearer [credencial omitida]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[credencial omitida]")
    .replace(
      /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
      "[credencial omitida]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo omitido]");
  // PostgreSQL can echo a supplied value in a type conversion error.
  if (error.code === "22P02")
    message = message.replace(/(:\s*).+$/s, "$1[valor omitido]");
  return `RPC: ${rpc}\nCódigo: ${error.code ?? "sin código"}\nMensaje: ${message.replace(/\s+/g, " ").slice(0, 600)}`;
}
