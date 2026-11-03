# Configuración de Supabase paso a paso

No se necesitan credenciales para probar la demo actual ni las pruebas automatizadas. Los siguientes pasos los realiza una persona administradora del colegio en un proyecto de pruebas antes de producción. No enviar claves ni contraseñas por chats, repositorio o capturas.

## 1. Crear el proyecto

1. Crear una organización/proyecto en Supabase, elegir región próxima al público y guardar la contraseña de PostgreSQL en el gestor de contraseñas del colegio.
2. Anotar **Project URL** y la clave **service_role** (o secret key del servidor compatible con el SDK). Se usan únicamente en Next.js y scripts privados. La clave publishable/anon nunca autoriza administración.
3. En Authentication, deshabilitar registro público por correo y proveedores que no se utilicen. Habilitar TOTP MFA para administradores. Configurar Site URL y Redirect URLs con el origen HTTPS final y `/admin`. `supabase/config.toml` documenta la configuración local; no modifica automáticamente el proyecto alojado.
4. Mantener únicamente `public` como esquema expuesto por la Data API. **No exponer `camino`**. No otorgar permisos a `anon` o `authenticated` sobre él.

## 2. Crear las tablas

La migración vigente es `supabase/migrations/202611030001_production.sql`. En un proyecto nuevo se puede copiar completa al SQL Editor y ejecutar una sola vez. Crea el esquema privado, tablas, índices, RLS y funciones de servidor. No requiere ejecutar las dos migraciones antiguas.

También se puede usar la CLI de Supabase: vincular el proyecto con `supabase link --project-ref TU_REFERENCIA`, revisar `supabase db push --dry-run` y aplicar con `supabase db push`. La CLI aplica las tres migraciones en orden; la nueva convive con las anteriores sin borrar sus tablas. **No ejecutar `db reset` contra una base con datos reales**. Revisar la lista de migraciones con `supabase migration list` antes de aplicar cambios posteriores.

Las tablas históricas de `public` se conservan si existían. La API nueva usa exclusivamente `camino`; no convierte automáticamente las tablas históricas. `supabase/seed.example.sql` es legado y no es la semilla de producción.

## 3. Variables del servidor

Copiar `.env.example` a `.env.local`, que está ignorado por Git. Configurar:

```dotenv
CAMINO_BACKEND_ENABLED=true
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=CLAVE_PRIVADA_DEL_SERVIDOR
APP_ORIGIN=http://localhost:3000
TOKEN_PEPPER=SECRETO_ALEATORIO_INDEPENDIENTE
APP_ENCRYPTION_KEY=64_CARACTERES_HEXADECIMALES
ADMIN_REQUIRE_MFA=true
PARTICIPANT_SESSION_SECONDS=43200
TRUST_PROXY=false
EMAIL_ACCESS_ENABLED=false
JOBS_SECRET=OTRO_SECRETO_ALEATORIO
```

Generar **cada secreto por separado** localmente con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guardarlos en el gestor del colegio. No reutilizar service_role como pepper o clave de cifrado. No usar prefijo `NEXT_PUBLIC` en claves privadas. En Vercel/otro hosting se colocan en sus variables de entorno del servidor; volver a desplegar después.

En producción, `APP_ORIGIN` debe ser el origen HTTPS exacto, sin ruta ni barra final. Las cookies de producción son Secure y las mutaciones exigen el encabezado Origin de ese mismo sitio. Para desarrollo HTTP usar `npm run dev`; un build de producción requiere HTTPS en el origen configurado.

## 4. Inicializar el catálogo

Preparar un JSON privado con `projects`, `challenges`, `agenda`, `settings`, `assignmentRules` y demás campos del catálogo. Puede partir del respaldo local. Las respuestas correctas, códigos reales y datos personales **no van en `public/data` ni en Git**. Cambiar `settings.dataVersion` por una versión real del evento. Completar todos los proyectos de décimo/undécimo y suficientes extras de sustitución.

```bash
mkdir -p private
npm run db:seed -- --file private/catalogo.json --production
npm run db:seed -- --file private/catalogo.json --production --apply
```

Sin `--apply` solo valida, sin conexión ni escritura. El script no importa usuarios de ejemplo. Sin `--file` sirve para sembrar el catálogo ficticio en staging, no para la feria. La validación conserva los cinco marcadores `isBase` del formato anterior; la cantidad efectiva de ruta depende del rol y de la distribución por área.

Una base ya inicializada se modifica con la API administrativa. `--replace-empty` permite sustituir el catálogo solo si aún no hay progreso/participantes; la base rechaza la operación si los hay.

## 5. Crear el primer administrador

En Authentication → Users crear/invitar una cuenta real del colegio, completar su contraseña y copiar su UUID. Deshabilitar signup público no impide crearla desde el panel administrativo. No usar la cuenta de un participante.

```bash
npm run db:bootstrap-admin -- --id UUID_AUTH --email admin@colegio.cr --first Nombre --surname1 Apellido1 --surname2 Apellido2
npm run db:bootstrap-admin -- --id UUID_AUTH --email admin@colegio.cr --first Nombre --surname1 Apellido1 --surname2 Apellido2 --apply
```

El script comprueba que el UUID y el correo corresponden al usuario real de Supabase Auth; la función solo permite crear el primer administrador. Los siguientes se invitan mediante `POST /api/v1/admin/staff`. No registrar administradores por `POST /admin/users`.

Para probar MFA sin una interfaz nueva, usar una terminal privada:

```bash
read -rsp 'Contraseña de admin: ' CAMINO_ADMIN_PASSWORD
export CAMINO_ADMIN_PASSWORD
npm run admin:session -- --email admin@colegio.cr --enroll --output private/totp.svg
```

Abrir localmente `private/totp.svg` y escanearlo con una app autenticadora. Luego:

```bash
read -rsp 'Código TOTP: ' CAMINO_TOTP_CODE
export CAMINO_TOTP_CODE
npm run admin:session -- --email admin@colegio.cr --output private/admin-session.json
unset CAMINO_ADMIN_PASSWORD CAMINO_TOTP_CODE
```

El segundo comando verifica el factor y guarda una sesión AAL2. El QR y el archivo de sesión son secretos; eliminarlos al terminar. Para sesiones posteriores no repetir `--enroll`. Si la cuenta fue invitada, completar antes la activación y contraseña en Supabase Auth. La pantalla `/admin` existente **todavía es el administrador de la demo**, no este acceso MFA.

## 6. Verificar la conexión

```bash
npm run db:check
npm run dev
```

En otra terminal:

```bash
npm run api:check -- --session-file private/admin-session.json
```

`db:check` consulta la base y muestra solamente conteos. `api:check` comprueba la ruta HTTP administrativa y su rol; consultar `GET /api/v1/health` solo verifica que arranca la configuración, no sustituye la comprobación de base. Un `503 backend_disabled/not_configured` significa que no están listas las variables; no hay caída silenciosa al almacenamiento local.

El siguiente paso será conectar las pantallas con `createApiClient` y Supabase Auth MFA, consumir el fragmento `#access` y borrarlo inmediatamente del historial. La API ya devuelve el enlace privado, pero el login de la demo todavía no lo consume. Durante esa integración hay que desactivar el service worker de la demo para datos privados: nunca almacenar `/api/v1/me`, `/admin` ni sesiones en cachés offline. Los participantes reales necesitan conexión para confirmar respuestas/votos.

## 7. Ver los datos

En Supabase Table Editor seleccionar el esquema `camino`; si la interfaz no lo ofrece, usar SQL Editor. Abrir `profiles`, `projects`, `agenda`, `completions`, `attempts`, `tickets`, `votes` y `raffles`. La cuenta administradora del panel puede consultarlos; un navegador con clave anon no.

Ejecutar [queries.sql](queries.sql) en el SQL Editor para ver datos legibles con sus relaciones. Para DBeaver/pgAdmin usar la cadena **Connect** del panel, SSL y usuario autorizado del colegio. Para funciones serverless preferir la Data API/RPC ya implementada; no abrir una conexión PostgreSQL nueva por cada petición ni publicar la contraseña de PostgreSQL en frontend.
