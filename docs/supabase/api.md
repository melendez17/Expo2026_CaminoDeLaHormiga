# API v1

Prefijo `/api/v1`, JSON UTF-8, mismo origen. Node.js en Next.js. Los participantes ingresan solo con su token hexadecimal de cuatro caracteres; los administradores también ingresan por token, sin contraseña ni MFA. No hay CORS público.

## Autorización y comandos

Participante: cookie HttpOnly de sesión; no se envían IDs de otra persona para actuar. Administrador: la misma cookie HttpOnly obtenida al iniciar con su token, y perfil activo `admin` verificado en base en cada petición. Un token de visitante no adquiere permisos administrativos. El Bearer de Supabase Auth queda solo como alternativa heredada. **La service_role nunca se usa desde el navegador**.

Toda mutación normal requiere `Origin: APP_ORIGIN` y `Content-Type: application/json`. Los comandos de juego/admin incluyen `requestId` UUID v4 generado **una vez por intención**; un reintento de la misma operación reutiliza exactamente cuerpo, ruta y UUID. El servidor guarda la huella y resultado siete días. El mismo UUID con otro contenido da `409`. Tras ese plazo no reutilizar solicitudes antiguas. No reintentar un alta, voto, tiquete o sorteo creando un UUID nuevo por un error de red. `api-client.ts` conserva el identificador cuando se pierde la respuesta.

Editar perfil requiere `expectedVersion` del perfil. Editar catálogo/reglas/configuración requiere `expectedVersion` del catálogo. Un conflicto exige volver a leer, revisar y confirmar la edición; no sobrescribir a ciegas. Las respuestas de comandos contienen `state` actualizado y `result`. El cliente envía `X-Camino-User` con la identidad de su vista para rechazar (`409 session_changed`) acciones si otra pestaña cambió la sesión; esa cabecera no concede permisos. El avance y las asignaciones se calculan en servidor, no se aceptan contadores/completados enviados por participantes.

Paginación: `?offset=0&limit=50&search=texto`; usuarios admite `status=Completado|En proceso|Sin activar` y `sort=name|tickets|progress`; máximo 100 por petición pública/administrativa. Las listas devuelven `total` e `items` donde procede. El ranking usa `rank: null` si no hay votos y comparte puestos en empates.

## Acceso y consulta pública

| Método | Ruta | Cuerpo/resultado |
|---|---|---|
| GET | `/health` | Configuración habilitada; no verifica por sí sola toda la base |
| GET | `/catalog` | Proyectos, agenda, configuración pública y reglas. Sin usuarios, respuestas ni códigos |
| GET | `/leaderboard` | Proyectos, puestos y conteos agregados; sin votantes |
| GET | `/auth/session` | Usuario y rol de la sesión propia, para restaurar el acceso |
| POST | `/auth/login` | `{ "token": "A12F" }`; inicia una sesión con cookie, sin QR ni correo |
| POST | `/auth/activate` | `{ "credential": "SECRETO_PRIVADO_DE_43_CARACTERES" }`; consume el acceso y fija cookie |
| POST | `/auth/request-email` | `{ "email":"persona@ejemplo.cr", "token":"A12F" }`; devuelve challengeId aun si no coincide, para evitar enumeración |
| POST | `/auth/verify-email` | `{ "challengeId":"UUID", "code":"12345678" }`; fija cookie si es correcto |
| POST | `/auth/logout` | Revoca sesión y borra cookie |

Credencial/QR: aleatoria de 256 bits, un uso, 24 horas. Sesión: 12 horas por defecto, revocable. OTP: ocho dígitos, diez minutos y cinco intentos; solicitar otro invalida el anterior. El correo requiere SMTP y trabajo programado configurados. El acceso principal es `/auth/login`: el token es reutilizable. Las rutas de enlace/OTP se conservan únicamente como alternativas compatibles; no se requieren en la pantalla de ingreso.

## Participante autenticado

| Método | Ruta | Cuerpo además de requestId |
|---|---|---|
| GET | `/me` | Perfil propio, estadísticas, progreso, retos desbloqueados e intentos fallados |
| GET | `/me/challenges` | Retos actuales e historial de fallos |
| GET | `/me/export` | Descarga privada del avance propio de consulta; no permite reimportar premios |
| POST | `/me/start` | Ninguno |
| POST | `/me/next-round` | Ninguno; exige completar la ronda anterior |
| POST | `/me/answers` | `challengeId`, `answers` objeto |
| POST | `/me/survey` | `expectations` (5–1.000 caracteres), `interest` (2–160), `satisfaction` (1–5) |
| POST | `/me/votes` | `projectId`; un crédito por solicitud |

Respuestas:

- Libre: `answers: {projectName, level, description}`.
- Quiz/código: `answers: {code, ID_PREGUNTA: "0", OTRA_PREGUNTA: "1"}`. Selecciones son índices desde cero.
- Santo: `answers: {saintChoice: "0"}`.

Una respuesta válida pero incorrecta devuelve HTTP 200 con `result.outcome: "incorrect"`, correcciones y reemplazo; es un intento guardado, no un error de infraestructura. La UI debe mostrar el aviso con X roja y la evidencia devuelta, conservando el fallado bloqueado. Campos incompletos/ajenos no completan ni generan premios. No se pueden responder tareas de otras personas o rondas futuras.

## Administración

| Método | Ruta | Detalle |
|---|---|---|
| GET | `/admin/me` | Perfil administrativo y `mfaRequired: false` |
| GET / POST | `/admin/users` | Listar / registrar participantes |
| GET | `/admin/users/:uuid` | Perfil, progreso completo (respuestas e historial) y vista de estado; lectura auditada |
| PATCH | `/admin/users/:uuid` | Campos parciales, active, expectedVersion y requestId |
| DELETE | `/admin/users/:uuid` | Baja lógica; expectedVersion y requestId. Conserva evidencia, revoca accesos |
| POST | `/admin/users/:uuid/credentials` | requestId, reason; reemite acceso y revoca sesiones anteriores |
| GET | `/admin/users/:uuid/replacements` | `?category=school&fromId=ID&level=10`; candidatos sin claves |
| POST | `/admin/users/:uuid/assignments` | mode prepare/replace/remove/add, fromId, category, level opcional, scope y reason |
| GET | `/admin/catalog` | Catálogo completo privado con claves, versión y perfiles administrativos |
| POST | `/admin/projects`, `/admin/challenges`, `/admin/agenda` | requestId, expectedVersion, value registro completo; ID opcional nuevo |
| PUT | `/admin/projects/:id`, `/admin/challenges/:id`, `/admin/agenda/:id` | requestId, expectedVersion, value registro completo |
| DELETE | Las mismas rutas con ID | requestId, expectedVersion |
| PUT | `/admin/assignment-rules` | requestId, expectedVersion, assignmentRules |
| PATCH | `/admin/settings` | requestId, expectedVersion, votingOpen y/o raffleOpen |
| GET / POST | `/admin/tickets` | Listar / crear uno manual por token |
| GET / POST | `/admin/raffles` | Historial / sortear con requestId y prize obligatorio |
| PATCH / DELETE | `/admin/staff/:uuid` | Editar nombres/correo/activo o desactivar admin, con expectedVersion; no permite desactivar el propio acceso |
| GET | `/admin/raffle-status` | Cantidad de tiquetes elegibles actuales |
| GET | `/admin/metrics`, `/admin/audit` | Métricas e historial paginado |
| GET | `/admin/export?format=csv\|json\|xlsx` | Datos privados; CSV neutraliza fórmulas, Excel es archivo real |
| GET | `/admin/backup` | Exportación Excel con catálogo y avance; sin secretos ni sesiones |
| POST | `/admin/staff` | Crear administrador con token, sin invitación ni cuenta Auth: requestId, email, firstName, firstSurname, secondSurname |

Registro de participante:

```json
{
  "requestId": "28c4d935-6a52-4d2e-967c-bc684f526994",
  "firstName": "Ana",
  "firstSurname": "Rodríguez",
  "secondSurname": "Vargas",
  "email": "ana@example.cr",
  "role": "visitor",
  "area": "Desarrollo Web",
  "consent": true,
  "delivery": "card"
}
```

La interfaz usa `delivery: "card"` y entrega `login: {method: "token", token: "A12F"}`. `email` o `both` permiten encolar el token si se habilitó el correo, sin hacerlo obligatorio para ingresar. El campo `access` se conserva por compatibilidad con el enlace anterior y no se utiliza en el frontend actual.

La respuesta de alta contiene datos privados: no registrarla en analítica ni guardarla en localStorage. No se admite role admin, token elegido ni avance en `/admin/users`; los administradores se crean por `/admin/staff`. El correo es único en todos los perfiles, aunque no se utiliza para verificar el ingreso.

Áreas exactas: `pasitos`, `school`, `third_cycle`, `Desarrollo Web`, `Ciberseguridad`, `Dibujo y Modelado de Edificaciones`, `Diseño Gráfico Multimedia`, `Electromecánica`, `Mecánica de Precisión`.

Cambiar un reto:

```json
{
  "requestId": "42e0887c-0130-4f20-8c91-d43bdfdb99c4",
  "mode": "replace",
  "fromId": "ID_RETO_PENDIENTE",
  "category": "extra",
  "reason": "El puesto cerró por horario"
}
```

Categorías de reemplazo exactas: `extra`, `pasitos`, `school`, `third_cycle`, `building:17` (TICs), o `specialty:NOMBRE_COMPLETO` (por ejemplo `specialty:Electromecánica`). Consultar la lista previa antes de confirmar; sin candidatos no se sustituye por otra categoría. La asignación registra actor, motivo y fecha.

Ejemplo de manual: `{ "requestId":"UUID", "token":"A12F" }`. Resultado incluye `result.ticketCode: "M-A12F-001"`; repetir la misma solicitud no crea otro tiquete. Baja lógica no elimina votos/historial; sus tiquetes dejan de ser elegibles para nuevos sorteos.

## Trabajos internos

`POST /internal/jobs` con `Authorization: Bearer JOBS_SECRET`, exclusivamente desde un programador del servidor. No usa cookie ni Origin. Limpia credenciales/cachés vencidos y entrega una tanda acotada del outbox. No devuelve destinatarios ni contenidos.

## Errores

```json
{ "error": { "code": "email_exists", "message": "..." }, "requestId": "ID_DE_TRAZA" }
```

400 entrada inválida; 401 sesión ausente/vencida; 403 permiso/Origin; 404 registro no disponible; 409 revisión, catálogo protegido o regla del juego; 413 cuerpo excesivo; 422 respuesta incompleta; 429 demasiados intentos; 503 backend/correo no configurado. No se devuelven SQL, claves, stack traces o correos ajenos en errores públicos. Las vistas privadas y archivos llevan `Cache-Control: private, no-store`.
