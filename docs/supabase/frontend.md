# Frontend conectado a la API

Las entradas `/` y `/admin` usan `ApiJourney`. Todas las acciones reales pasan por `/api/v1`; el navegador ya no lee usuarios/retos desde `public/data`, ni guarda progreso/catálogos en localStorage. No hay regreso automático a JSON si Supabase falla.

## Activar sobre una base ya configurada

1. Actualizar la rama `implementacionbackend` y ejecutar `npm ci`.
2. En Supabase SQL Editor, ejecutar **solo si está pendiente** `supabase/migrations/202611030004_frontend_api.sql`. Las migraciones 001, 002 y 003 deben estar aplicadas previamente. Esta migración agrega funciones, no borra tablas ni registros.
3. Revisar `.env.local`: `CAMINO_BACKEND_ENABLED=true`, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del mismo proyecto, APP_ORIGIN exacto y las claves privadas configuradas en los pasos anteriores. No crear variables NEXT_PUBLIC para la clave privada.
4. Reiniciar Next.js con `npm run dev` (en PowerShell puede usarse `npm.cmd run dev`). Abrir `http://localhost:3000` y entrar con un token real de `camino.profiles`.
5. No ejecutar de nuevo el seed o el primer administrador si ya existen. Los cambios de pantalla ahora escriben directamente en esa base.

En producción, APP_ORIGIN debe coincidir con el dominio HTTPS desplegado, sin barra final. Configurar variables de servidor en el hosting y desplegar la rama actual. La aplicación requiere Next.js con runtime de servidor; no sirve como exportación de archivos estáticos.

Si necesitas comprobar la conexión en PowerShell:

```powershell
node ".\node_modules\tsx\dist\cli.mjs" ".\scripts\supabase\check-connection.ts"
node ".\node_modules\tsx\dist\cli.mjs" ".\scripts\supabase\smoke-api.ts" --token-file "private/data/admin-token.json"
```

Usar la ubicación real del archivo privado del administrador. No copiar claves ni tokens en Git, capturas o chats.

## Pantallas y operaciones

| Pantalla | API |
|---|---|
| Ingreso y restauración de sesión | POST `/auth/login`, GET `/auth/session`, POST `/auth/logout` |
| Bienvenida | POST `/me/start` |
| Retos y evidencia de fallos | GET `/me`, POST `/me/answers`, POST `/me/next-round` |
| Mi resumen y encuesta | GET `/me`, POST `/me/survey`, GET `/me/export` |
| Votación y top de proyectos | GET `/catalog`, GET `/leaderboard`, POST `/me/votes` |
| Agenda y mapa | GET `/catalog`, ubicaciones y proyectos por edificio |
| Resumen administrativo | GET `/admin/metrics`, GET `/admin/users`, GET `/leaderboard` |
| Usuarios | GET/POST `/admin/users`, PATCH/DELETE `/admin/users/:id` |
| Administradores | POST `/admin/staff`, PATCH/DELETE `/admin/staff/:id` |
| Respuestas y asignación individual | GET `/admin/users/:id`, GET `/:id/replacements`, POST `/:id/assignments` |
| Proyectos, retos y agenda | GET `/admin/catalog`, POST/PUT/DELETE de cada recurso |
| Distribución | PUT `/admin/assignment-rules` |
| Tiquetes y rifa | GET/POST `/admin/tickets`, GET `/admin/raffle-status`, GET/POST `/admin/raffles` |
| Respaldo y reportes | GET `/admin/backup`, GET `/admin/export?format=csv` |

La edición de usuarios conserva el token. Eliminar un usuario significa desactivarlo: quedan sus respuestas y su historial; la casilla Usuario activo permite reactivarlo. El administrador no puede desactivar su propio acceso. No se puede convertir un participante en administrador editando su rol; los administradores se crean por su operación específica.

## Confirmaciones y sincronización

- La última persona creada se consulta desde el servidor por administrador, incluso después de recargar.
- Una acción muestra éxito después de recibir la confirmación del servidor. Retos, premios y votos no se calculan ni se conceden en el cliente.
- Los usuarios se consultan con paginación, búsqueda, estado y orden en servidor. Las respuestas completas solo se descargan al abrir la ficha de una persona.
- Las pantallas se actualizan con la respuesta del comando y vuelven a consultar periódicamente (30 segundos en pestañas visibles), al recuperar foco/conexión y al navegar en el recorrido. Otros dispositivos no requieren compartir navegador.
- El catálogo se descarga otra vez cuando cambia su versión, evitando repetir su carga completa en cada actualización del progreso.
- El ranking utiliza conteos agregados reales. La lista del mapa usa los proyectos/actividades del catálogo central.
- Los errores conservan los formularios. Una respuesta incorrecta es un intento guardado: se muestra la X roja, la corrección que devuelve el servidor, el bloqueo del original y su reemplazo.
- Los reintentos de un comando cuya respuesta se perdió conservan requestId en memoria. No se duplica por reintentar el mismo formulario sin recargar. Si se cerró/recargó la pestaña después de una respuesta ambigua, revisar el registro antes de emitir otra acción.
- Si otra pestaña inicia sesión con otra persona, se rechazan acciones desde la vista anterior antes de escribir, para no mezclar usuarios.
- Las ediciones usan expectedVersion del registro/catálogo leído; un conflicto pide recargar y revisar, sin sobrescribir a ciegas.

## Conexión y privacidad

La sesión usa cookie HttpOnly; las credenciales de Supabase permanecen en Next.js. Se mantienen roles, RLS privado, correo único, límites y transacciones. El token corto sigue siendo la única credencial elegida para todos los roles; mantenerlo privado.

El service worker de la demo se retira y borra sus cachés públicas. No se guardan API privada ni premios para uso offline. Sin conexión puede seguir visible la última vista en memoria, pero no se confirma ninguna operación ni se encolan votos o premios locales.

Los avances antiguos guardados en navegadores no se importan automáticamente: conservan su respaldo original y requieren revisión administrativa antes de una migración confiable. No se ofrece importar un Excel local para modificar premios reales; la recuperación de una base se hace mediante el procedimiento PostgreSQL. El Excel de consulta incluye datos del servidor.

## Pruebas

```bash
npm run typecheck
npm test
npm run build
npm start -- --port 3008
```

En otra terminal:

```bash
BASE_URL=http://localhost:3008 npm run test:api-browser
```

En PowerShell, establecer `$env:BASE_URL="http://localhost:3008"` y ejecutar `npm.cmd run test:api-browser`. Instalar Chromium con `npx playwright install chromium` si no está disponible; PLAYWRIGHT_CHROMIUM_EXECUTABLE permite usar uno del sistema.

La prueba ejecuta la interfaz compilada y dirige sus solicitudes HTTP al handler real con PostgreSQL embebido: no usa datos personales, no envía correo y no necesita credenciales Supabase. Incluye persistencia, segundo navegador, evidencia de fallos, voto, alta/edición, distribución, catálogo/niveles, asignación, agenda compartida, manual con respuesta perdida, sorteo y Excel. La conexión remota y la carga del hosting deben verificarse con el proyecto del colegio.
