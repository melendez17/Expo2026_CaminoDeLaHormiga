import "server-only";
import nodemailer from "nodemailer";
import { z } from "zod";
import { decrypt } from "./security";
import type { BackendStore } from "./store";
import { BackendError } from "./errors";
const envelope = z
  .object({
    to: z.email(),
    subject: z.string().max(160),
    text: z.string().max(6000),
  })
  .strict();
export async function dispatchMail(store: BackendStore, encryptionKey: string) {
  if (process.env.EMAIL_ACCESS_ENABLED !== "true")
    throw new BackendError(
      503,
      "email_disabled",
      "El acceso por correo no está habilitado.",
    );
  const host = process.env.SMTP_HOST,
    user = process.env.SMTP_USER,
    password = process.env.SMTP_PASSWORD,
    from = process.env.MAIL_FROM,
    port = Number(process.env.SMTP_PORT ?? 587);
  if (!host || !user || !password || !from || ![465, 587].includes(port))
    throw new BackendError(
      503,
      "smtp_not_configured",
      "Configura SMTP antes de enviar correos.",
    );
  const transport = nodemailer.createTransport({
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user, pass: password },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 5000,
    socketTimeout: 10000,
    dnsTimeout: 5000,
  });
  const deadline = Date.now() + 35000;
  let sent = 0,
    failed = 0;
  try {
    for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
      const messages = await store.rpc<{ id: string; envelope: string }[]>(
        "camino_mail_claim",
        { p_limit: 20 },
      );
      if (!messages.length) break;
      // At most five SMTP operations at once; process remaining messages in bounded groups.
      for (let index = 0; index < messages.length; index += 5) {
        if (Date.now() >= deadline) break;
        await Promise.all(
          messages.slice(index, index + 5).map(async (message) => {
            let success = false;
            try {
              const payload = envelope.parse(
                decrypt(message.envelope, encryptionKey),
              );
              await transport.sendMail({
                from,
                to: payload.to,
                subject: payload.subject,
                text: payload.text,
                disableFileAccess: true,
                disableUrlAccess: true,
              });
              success = true;
              sent++;
            } catch {
              failed++;
            }
            await store.rpc("camino_mail_complete", {
              p_id: message.id,
              p_success: success,
            });
          }),
        );
      }
      if (messages.length < 20) break;
    }
  } finally {
    transport.close();
  }
  return { sent, failed };
}
