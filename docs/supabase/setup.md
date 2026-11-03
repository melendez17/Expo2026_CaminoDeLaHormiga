# Configurar Supabase con acceso por token

Los participantes **y administradores** ingresan con su token. No se requieren contraseña, QR, verificación por correo ni doble factor. Los permisos se obtienen del rol activo en la base, no de lo que envíe el navegador.

La interfaz actual usa la API. Estos pasos preparan la base y el servidor para que las pantallas consulten y guarden datos reales. No publicar personas o respuestas reales en los JSON públicos de ejemplo.

## 1. Crear el proyecto

Crear una organización/proyecto en Supabase, elegir una región próxima y guardar la contraseña PostgreSQL en el gestor del colegio. Anotar Project URL y service_role/secret key del servidor. No compartirlas en chats, capturas ni repositorio.

Mantener solo `public` expuesto en la Data API; no exponer `camino` ni concederle acceso a `anon`/`authenticated`. No es necesario crear usuarios en Authentication para el acceso por token. Deshabilitar el signup público de Auth si no se usa; los ajustes MFA de ese servicio no afectan este acceso.

## 2. Ejecutar migraciones

En un proyecto nuevo, ejecutar completas y en orden desde SQL Editor:

1. `supabase/migrations/202611030001_production.sql`
2. `supabase/migrations/202611030002_token_login.sql`
3. `supabase/migrations/202611030003_admin_token_login.sql`
4. `supabase/migrations/202611030004_frontend_api.sql`

Si ya aplicaste alguna, ejecutar únicamente las pendientes. La tercera habilita el token para admins y elimina la necesidad de un vínculo Auth para sus perfiles; conserva datos y permisos SQL privados.

Con CLI: `supabase link --project-ref TU_REFERENCIA`, revisar `supabase db push --dry-run` y después `supabase db push`. La CLI también incluye las dos migraciones históricas anteriores: seis archivos en total. No ejecutar `db reset` en una base con datos reales. Las tablas viejas de `public` se conservan; la API vigente usa `camino`. `seed.example.sql` es histórico, no una semilla de producción.

## 3. Variables privadas del servidor

Copiar `.env.example` a `.env.local` (ignorado por Git):

```dotenv
CAMINO_BACKEND_ENABLED=true
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=CLAVE_PRIVADA
APP_ORIGIN=http://localhost:3000
TOKEN_PEPPER=SECRETO_ALEATORIO_INDEPENDIENTE
APP_ENCRYPTION_KEY=64_CARACTERES_HEXADECIMALES
PARTICIPANT_SESSION_SECONDS=43200
TRUST_PROXY=false
EMAIL_ACCESS_ENABLED=false
JOBS_SECRET=OTRO_SECRETO_ALEATORIO
```

Generar cada secreto por separado con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, en una terminal privada. Guardarlos fuera del repositorio. No usar `NEXT_PUBLIC` para secretos, ni reutilizar service_role como pepper/clave.

En producción APP_ORIGIN debe ser el origen HTTPS exacto, sin ruta/barra final; cookies Secure y mutaciones con Origin coincidente. Para desarrollo HTTP usar `npm run dev`. En el hosting configurar variables del servidor y desplegar de nuevo; el dominio del colegio no configura Supabase automáticamente.

## 4. Inicializar catálogo

Preparar un JSON privado con proyectos, retos, agenda, reglas y settings. Puede partir de un respaldo local revisado. Nunca guardar respuestas/códigos reales o personas en `public/data` o Git. Usar una dataVersion del evento real y suficiente catálogo de décimo, undécimo y extras.

```bash
mkdir -p private
npm run db:seed -- --file private/catalogo.json --production
npm run db:seed -- --file private/catalogo.json --production --apply
```

Sin --apply solo valida. No importa usuarios de ejemplo. Sin --file sirve para staging ficticio; no usar ese catálogo en la feria. Se conservan los cinco marcadores isBase del formato; la cantidad efectiva depende de distribución/rol.

Para cambiar un catálogo ya utilizado emplear la API. --replace-empty solo funciona sin progreso/participantes.

## 5. Primer administrador: sin Auth ni MFA

```bash
npm run db:bootstrap-admin -- --email admin@colegio.cr --first Nombre --surname1 Apellido1 --surname2 Apellido2
npm run db:bootstrap-admin -- --email admin@colegio.cr --first Nombre --surname1 Apellido1 --surname2 Apellido2 --token-output private/admin-token.json --apply
```

El script genera UUID y token aleatorios, crea el primer perfil admin y guarda el resultado privado con permisos 0600. No imprime el token en consola. Abrir el archivo en un equipo privado y entregar el token al responsable; no publicarlo ni enviarlo a analítica. No se necesita correo de verificación ni cuenta Supabase Auth.

El comando solo permite el primer administrador. Los siguientes se crean desde `POST /api/v1/admin/staff`, con una sesión administrativa válida. No usar tokens de ejemplo del repositorio para producción. Si ya había administradores con Auth, conservan sus tokens y ahora también pueden usarlos directamente.

## 6. Comprobar conexión

```bash
npm run db:check
npm run dev
```

En otra terminal:

```bash
npm run api:check -- --token-file private/admin-token.json
```

Esta prueba inicia sesión con el token del archivo, consulta `/admin/me` y cierra la sesión; solo imprime estado y rol. `db:check` muestra conteos, sin personas/secretos. `/health` solo comprueba la configuración habilitada, no sustituye consultar la base.

Un 503 backend_disabled/not_configured significa que faltan variables. Un 401 indica token inválido/inactivo/sesión vencida; 403 en el panel indica rol sin permiso; 429 pide esperar por límite de intentos.

Las pantallas se conectan mediante `createApiClient().login(token)` y cookies HttpOnly. El admin consultará `/admin/me`; los participantes `/me`. No enviar un rol escogido por el usuario para autorizar. La pantalla `/admin` actual usa esta API; crear usuarios o emitir tiquetes allí escribe en Supabase. Las herramientas antiguas admin:session y admin-auth.ts quedan como compatibilidad Auth opcional; no se necesitan para ingresar por token.

No guardar sesiones/usuarios privados en el service worker de la demo ni reimportar progreso de participantes como premios reales. Confirmar respuestas/votos reales requiere conexión.

## 7. Consultar datos

En Table Editor seleccionar `camino` o usar SQL Editor y [queries.sql](queries.sql). Perfiles, respuestas, fallos, tiquetes, votos y sorteos están relacionados con UUID y claves foráneas. El operador del panel puede consultarlos; una clave anon no.

En DBeaver/pgAdmin usar la cadena Connect del panel con SSL y cuenta autorizada. El backend Next.js ya usa RPC/Data API, sin abrir una conexión PostgreSQL por participante. No modificar a mano proyecciones/snapshots: el backend las sincroniza en transacciones.

## Protección del token

El token es toda la credencial, también para un administrador. Quien lo obtenga tendrá sus permisos; cuatro caracteres ofrecen poca resistencia a adivinación. No publicar tokens ni códigos de tiquete que los contengan. Los límites, sesiones revocables y validación de rol se conservan, pero no equivalen a un segundo factor. El colegio ha elegido este acceso simplificado para esta etapa.

## Si el seed solo muestra «No se pudo completar la operación»

Actualizar la rama y ejecutar el diagnóstico desde la carpeta del proyecto:

```powershell
node ".\node_modules\tsx\dist\cli.mjs" ".\scripts\supabase\seed-catalog.ts" --apply --debug
```

El modo debug de las herramientas privadas muestra nombre de RPC, código de PostgreSQL/PostgREST y mensaje técnico acotado. No imprime argumentos, claves del entorno, cabeceras ni detalles de filas; también oculta credenciales/correos detectados en el mensaje. Las respuestas de la API pública siguen siendo genéricas.

Si la inicialización falla dentro de la transacción, los cambios de esa llamada se revierten. Primero revisar ese código/mensaje para corregir la causa; un catálogo ausente no significa necesariamente que falten todas las tablas. No volver a crear el proyecto para diagnosticarlo.

## Error `21000: DELETE requires a WHERE clause`

Aplica `supabase/migrations/202611030005_catalog_safe_delete.sql` completo desde el SQL Editor de Supabase antes de repetir el seed. Esta migración reemplaza únicamente la función interna que escribe el catálogo y añade el filtro explícito a la eliminación de preguntas que se reconstruyen. Conserva las tablas, sus permisos y la protección de Supabase contra eliminaciones sin `WHERE`. No requiere reiniciar ni borrar la base de datos.

Después ejecuta en PowerShell:

```powershell
node ".\node_modules\tsx\dist\cli.mjs" ".\scripts\supabase\seed-catalog.ts" --apply --debug
node ".\node_modules\tsx\dist\cli.mjs" ".\scripts\supabase\check-connection.ts"
```
