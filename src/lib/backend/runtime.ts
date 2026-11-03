import "server-only";
import { createBackendHandler } from "./handler";
import { BackendService } from "./service";
import {
  backendConfiguration,
  serverSupabase,
  SupabaseBackendStore,
  verifyAdminBearer,
} from "./supabase";
import { dispatchMail } from "./mail";
import { BackendError } from "./errors";
export async function productionHandler(request: Request) {
  try {
    if (process.env.CAMINO_BACKEND_ENABLED !== "true")
      throw new BackendError(
        503,
        "backend_disabled",
        "El backend real todavía no está habilitado.",
      );
    const configuration = backendConfiguration(),
      client = serverSupabase(),
      store = new SupabaseBackendStore(client, configuration.url),
      service = new BackendService(store, configuration);
    const handler = createBackendHandler({
      service,
      production: process.env.NODE_ENV === "production",
      emailEnabled: process.env.EMAIL_ACCESS_ENABLED === "true",
      jobsSecret: process.env.JOBS_SECRET,
      verifyAdmin: (req) => verifyAdminBearer(req, client),
      dispatchMail: () => dispatchMail(store, configuration.encryptionKey),
      createAdmin: (input, actor, requestId, fingerprint) =>
        service.createAdmin(input, actor, requestId, fingerprint),
    });
    return handler(request);
  } catch (error) {
    const status = error instanceof BackendError ? error.status : 503;
    return Response.json(
      {
        error: {
          code:
            error instanceof BackendError ? error.code : "configuration_error",
          message:
            error instanceof BackendError
              ? error.message
              : "No se pudo iniciar el backend.",
        },
      },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}
