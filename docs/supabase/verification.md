# Verificación de esta entrega

Verificado en el entorno de desarrollo el 3 de noviembre de 2026:

- TypeScript sin errores (`npm run typecheck`).
- Suite completa de 135 pruebas (`npm test`), incluyendo 29 del backend (se contabilizan también los grupos padre del runner).
- Build de producción de Next.js.
- Flujo de navegador de la demo JSON: login, mapas móvil, retos, fallos, premios, voto, rondas, encuestas, admin, Excel y modo sin conexión. La demo continúa sin depender de Supabase.
- API HTTP desplegada localmente sin configuración: devuelve 503 y `private, no-store`; no expone el servidor anterior ni abre datos de prueba como autenticación real.
- Migración nueva en PostgreSQL embebido, tanto sola como después de las dos históricas; permisos y RLS negados a anon/authenticated.
- Registro con correo único, códigos/credenciales, OTP con intentos limitados, revocación de sesiones, propiedad de datos, MFA claims después de verificación del proveedor, CSRF y límites de cuerpo.
- Rutas/asignaciones, intento incorrecto y evidencia, premios, conflictos de versión, solicitudes duplicadas, votos sin doble gasto, manuales incrementales y sorteos sin repetir tiquete.
- Administración de catálogo/agenda/niveles, protección de avances existentes y exportación Excel con historial de rifa.
- Auditoría npm de producción: sin avisos altos/críticos después de actualizar Nodemailer; persisten 11 moderados en la cadena transitiva existente de ExcelJS, descritos en seguridad.

No verificado por falta de proyecto/credenciales: conectividad remota de Supabase, políticas desplegadas, flujo real Auth/MFA/invitación, SMTP real, restauración de respaldo remoto ni capacidad con 1.500 usuarios. No se ha ejecutado el guion de carga ni enviado correos. El cliente visual aún no consume la API: la migración de pantallas y puesta en producción siguen pendientes.
