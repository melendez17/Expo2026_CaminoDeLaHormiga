# Verificación de la versión conectada

Comprobado localmente, sin datos personales ni servicios remotos:

- TypeScript y build de producción de Next.js.
- 143 pruebas automatizadas, incluidas 37 del backend (el runner contabiliza también los grupos padre).
- Migraciones de producción solas y después de las históricas, sin eliminar tablas anteriores. RLS y RPC niegan acceso directo a anon/authenticated.
- Correo único, tokens reutilizables, sesiones revocables, propiedad de datos, CSRF, límites de cuerpo e intentos. La autenticación Auth/MFA heredada sigue probada como alternativa, pero no se requiere para el acceso actual por token.
- Reglas de visitantes/admisión, niveles, premios, fallos con evidencia/reemplazo, asignaciones por categoría, protección de completados, versiones e idempotencia.
- Voto sin doble gasto, manuales incrementales, rifa uniforme sin repetir tiquete ganador y Excel con su historial.
- Contratos del frontend: sesión actual, catálogo público sin claves, paginación/filtros globales, edición de staff y protección de acciones si otra pestaña cambió el usuario de la cookie.

La prueba `test:api-browser` abre las páginas compiladas y dirige sus solicitudes al handler real con PostgreSQL embebido. Verifica:

- Login, inicio, fallo/corrección/evidencia bloqueada, reemplazo, completados y tiquete.
- Voto, encuesta, descarga del avance y rondas adicionales.
- Persistencia al recargar y desde otro contexto de navegador.
- Creación/edición/desactivación/reactivación, última persona creada conservada en servidor y respuestas por usuario.
- Distribución sin alterar rutas iniciadas y reemplazos por categoría.
- Proyecto y reto de especialidad con nivel, CRUD del catálogo y agenda compartida.
- Manual con una respuesta de red perdida: al reintentar queda un solo tiquete.
- Sorteo y descarga de un Excel real.
- Cero lecturas de JSON públicos y cero escrituras de progreso/catálogo privado en localStorage; sesión HttpOnly y diseño móvil/desktop conservado.

Las páginas `/` y `/admin` ya utilizan la API. La migración `202611030004_frontend_api.sql` debe aplicarse a una base que todavía no la tenga. El service worker anterior se retira: no se utiliza la demo offline como respaldo de una operación real fallida.

No verificado aquí: conexión al proyecto Supabase del colegio, configuración efectiva del hosting/HTTPS, SMTP real, recuperación de respaldos remotos ni carga de 1.500 usuarios. No se enviaron correos ni se ejecutó carga externa. La auditoría anterior documentó 11 avisos moderados heredados en la cadena de ExcelJS; no se añadieron dependencias de producción en esta integración.
