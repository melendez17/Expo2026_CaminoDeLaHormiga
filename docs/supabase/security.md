# Arquitectura y seguridad

## Límites de confianza

El navegador llama a Next.js. Next.js autentica, valida con Zod, ejecuta el mismo motor de reglas probado en la demo y realiza una RPC de Supabase. La RPC aplica el cambio en una transacción PostgreSQL. Nunca se aceptan desde participantes un rol, saldo, lista de completados, ganador, propietario o progreso arbitrario.

```mermaid
flowchart LR
  U[Navegador participante] -->|Cookie HttpOnly| N[API Next.js]
  A[Admin por token] -->|Cookie HttpOnly| N
  N -->|service_role privada| R[RPC service-only]
  R --> C[(Esquema privado camino)]
  N --> E[Outbox cifrado y SMTP opcional]
```

El esquema `camino` tiene tablas normalizadas para consultas y conserva una instantánea JSON canónica de catálogo/progreso. Esto permite reutilizar exactamente `local-game`, asignaciones, premios y evidencia histórica sin implementar otra versión de las reglas. Las proyecciones SQL (respuestas, intentos, asignaciones, tiquetes, votos) y el JSON se escriben en **una misma transacción**. No editar directamente las proyecciones: la siguiente operación las deriva del estado canónico.

Esta frontera confía en el backend. La función de commit no es una API pública para enviar progreso: aunque comprueba actor, versión, premios y monotonicidad, **no sustituye al motor de validación de respuestas del servidor**. Un robo de service_role compromete la base; RLS no protege contra esa clave. Guardarla y restringir su acceso es esencial.

## Accesos

- Participantes: ingreso únicamente por token reutilizable de cuatro hexadecimales, entregado por información; no requiere QR ni correo. El token es una credencial secreta de baja entropía (65.536 combinaciones), elegida expresamente para el evento. Se aplican límites por token (6 intentos cada 5 minutos) y red (30/minuto con IP de proxy confiable; 3.000/minuto compartidos sin ella para admitir Wi-Fi escolar). Son mitigaciones parciales: alguien que adivine u obtenga un token puede entrar como esa persona. No publicar tokens, códigos de tiquetes que los incluyan ni archivos de usuarios reales. Los campos heredados claim_hash/enlace y OTP permanecen solo para compatibilidad, sin ser requisitos del acceso.
- Sesión opaca aleatoria en cookie `__Host-camino_session`, Secure, HttpOnly, SameSite=Strict y Path=/ en producción. SHA-256 en base; vence por defecto en doce horas. Baja, cambio de correo o reemisión revocan sesiones/credenciales previas. No se almacena el secreto en localStorage.
- Administradores: ingresan directamente con token y reciben la misma clase de cookie protegida. En cada operación se consulta el perfil activo y se exige rol admin de la base. No hay contraseña ni segundo factor en este flujo; no se acepta un rol elegido por cliente. La alternativa JWT/MFA anterior permanece como compatibilidad opcional y no se ejecuta cuando se usa la sesión por token.
- No hay registro público. Otros administradores se crean únicamente desde una sesión admin, mediante una transacción SQL con token aleatorio y correo único. No se crean cuentas Supabase Auth ni se envían invitaciones. El primer administrador se inicializa con una herramienta privada service-only que rechaza ejecutarse de nuevo si ya existe alguno.


Como alternativa heredada, los enlaces de acceso usan fragmento `#access=...` para no enviar la credencial a logs del servidor/referrers. Si se reutiliza esa alternativa, la interfaz debe consumirlo y eliminarlo con `history.replaceState`, sin analítica ni recursos externos en ese paso. La API devuelve el token al administrador que lo entrega; la pantalla de ingreso solo lo solicita y obtiene una cookie protegida. Los resultados idempotentes de alta están cifrados AES-256-GCM en la base, así como el contenido del outbox.

## Base y autorización

- Esquema no expuesto, RLS habilitado y forzado en todas sus tablas; sin acceso para roles `anon`/`authenticated`. No hay políticas que abran datos personales al navegador.
- RPC `public.camino_*` SECURITY DEFINER con search_path fijo y ejecución revocada a PUBLIC/anon/authenticated, permitida solo a service_role. Las funciones de inicialización también son privadas del servidor.
- Correo único normalizado con trim/minúsculas en perfiles, incluso en baja lógica. No se deducen ni inventan nombres o correos. Rol/área y relación especialidad/edificio/nivel tienen restricciones SQL y validación del servidor.
- UUID internos para personas; códigos cortos y códigos de tiquete únicos. Voto tiene relación única a un tiquete, impidiendo gastar dos veces su crédito. Llaves foráneas protegen respuestas, proyectos y ganadores.
- Privacidad por propietario: todas las rutas `/me` deducen al participante de su sesión. El catálogo público excluye usuarios, códigos y respuestas. Preguntas asignadas no incluyen `correctIndex`; las correcciones se revelan solo después de registrar ese fallo.

## Concurrencia y fraude

Versiones de catálogo/perfil/progreso y bloqueo por participante impiden perder actualizaciones. Los cambios de catálogo verifican todas las versiones leídas durante su validación antes de aplicar la edición; si alguien avanzó, devuelven conflicto. Los comandos del juego reintentan un conflicto hasta cuatro veces. No se recalculan rutas antiguas al editar distribución.

La clave de idempotencia es `(actor, requestId)` y guarda huella canónica del comando y resultado. Un mismo requestId con otro contenido se rechaza. La votación, emisión de premios y las proyecciones se confirman atómicamente. Completados, manuales y votos previos no se pueden borrar a través de un comando normal.

La rifa elige un índice con `crypto.randomInt` sobre todos los tiquetes activos no ganadores y verifica/bloquea el conjunto al confirmar. No usa `Math.random`, no pondera por persona y no repite tiquete ganador. No equivale a una certificación externa de sorteo; conservar el registro y reglas del evento.

## HTTP, límites y registros

Mutaciones con Origin exacto, bloqueo cross-site, cuerpos limitados por lectura incremental (16 KiB general, 256 KiB catálogo), esquemas estrictos y límites de campos. Sin CORS permisivo. Sesiones y descargas privadas no se cachean; ranking/catálogo públicos tienen caché compartida de diez segundos. Los errores no exponen SQL/stack/PII y logs de fallos inesperados solo guardan ID de traza y tipo de error.

Hay límites persistentes para login por token, activación heredada, OTP, comandos y admin. `TRUST_PROXY=false` agrupa accesos de red sin confiar en headers falsificables; el límite de activación compartido es 3.000/minuto para admitir una red escolar. Solo habilitar TRUST_PROXY si el proveedor garantiza reemplazar x-forwarded-for. Configurar protección de abuso/WAF en el hosting y ajustar con pruebas: el límite de la aplicación no sustituye una defensa de infraestructura.

## Datos sensibles y tareas pendientes antes de producción

Recoger solo lo necesario. El registro guarda fecha de consentimiento administrativo confirmado, pero el texto/alcance legal, autorizaciones de menores, permisos del personal, conservación/borrado y atención de derechos deben acordarse con el colegio. No se afirma cumplimiento legal automático. El servidor no cifra cada nombre/correo con una clave propia porque se consultan operacionalmente; dependen de controles y cifrado en tránsito/en reposo del proveedor. Las sesiones se guardan como hash y los sobres heredados/outbox se cifran. Los tokens cortos están en profiles.public_token en texto para consulta y entrega administrativa; proteger el acceso a esa tabla y sus respaldos es esencial. Copias Excel/JSON contienen datos personales y requieren acceso restringido.

Pendiente de verificar en el proyecto real: políticas efectivas con claves reales, login administrativo por token, SMTP/dominio de correo, hostname HTTPS/cookies/proxy, recuperación de respaldos y carga. Faltan las pantallas conectadas a la API; la demo JSON contiene respuestas ficticias públicas y no es un modo seguro para datos reales.

`npm audit --omit=dev` debe revisarse antes de publicar. Se actualizó la dependencia de correo a Nodemailer 10.3.1 para corregir los avisos de la versión anterior. La cadena heredada de ExcelJS 4.4 todavía tiene avisos moderados en dependencias transitivas (glob/minimatch/uuid y archivado), sin arreglo directo compatible publicado para toda la cadena. No se expone una importación pública de Excel en esta API; no procesar respaldos de orígenes no confiables. No forzar cambios mayores transitivos sin probar lectura/escritura de respaldos.
