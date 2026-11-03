import "server-only";
import { randomInt } from "node:crypto";
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
import type { Profile } from "./store";
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
      inviteAdmin: async (input, actor, requestId, requestHash) => {
        const cached = await service.cached(actor, requestId, requestHash);
        if (cached) return cached;
        if (await store.rpc("camino_profile_lookup", { p_email: input.email }))
          throw new BackendError(
            409,
            "email_exists",
            "Ya existe una persona con ese correo.",
          );
        const invited = await client.auth.admin.inviteUserByEmail(input.email, {
          redirectTo: configuration.origin + "/admin",
        });
        if (invited.error || !invited.data.user)
          throw new BackendError(
            502,
            "invitation_failed",
            "No se pudo enviar la invitación. Revisa la configuración de correo de Supabase.",
          );
        try {
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
          for (let attempt = 0; attempt < 36; attempt++) {
            try {
              return await store.rpc<Profile>("camino_add_admin", {
                p_id: invited.data.user.id,
                p_first: input.firstName,
                p_surname1: input.firstSurname,
                p_surname2: input.secondSurname,
                p_email: input.email,
                p_token: "ADM" + alphabet[randomInt(alphabet.length)],
                p_actor: actor,
                p_request: requestId,
                p_hash: requestHash,
              });
            } catch (error) {
              if (
                error instanceof BackendError &&
                error.code === "token_collision"
              )
                continue;
              throw error;
            }
          }
          throw new BackendError(
            409,
            "staff_capacity",
            "No hay códigos administrativos disponibles.",
          );
        } catch (error) {
          await client.auth.admin.deleteUser(invited.data.user.id);
          throw error;
        }
      },
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
