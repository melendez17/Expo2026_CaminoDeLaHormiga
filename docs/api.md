# API inicial

Base: `/api`. Respuestas JSON, salvo el informe CSV. Errores: `{ "error": "mensaje" }`. Las mutaciones exigen cabecera `Origin` igual a `APP_ORIGIN`. Los POST reciben JSON de hasta 16 KB. No hay una clave Supabase pública necesaria en el navegador.

## Acceso

Visitantes: cookie `camino_session` emitida por activación, opaca, con vencimiento de 24 horas. Personal: `Authorization: Bearer <accessToken>` obtenido con correo y contraseña de Supabase Auth. Cada petición administrativa consulta el rol actual en `staff`; no confía en un rol enviado por el cliente.

| Método y ruta | Actor | Función |
|---|---|---|
| `GET /catalog` | Público | Retos activos, opciones de quiz, proyectos, agenda y URL de radio. Sin claves de respuesta. |
| `POST /auth/activate` | Público con límite de intentos | Activa token y emite cookie. |
| `POST /auth/logout` | Visitante | Revoca la sesión actual y elimina cookie. |
| `GET /me` | Visitante | Primer nombre, progreso, asignaciones, tiquetes y votos disponibles. |
| `POST /completions` | Visitante | Valida respuestas/código, registra reto y adjudica premios de forma atómica. |
| `POST /survey` | Visitante con ruta completa | Registra encuesta y bonus una sola vez; completa admisión si es postulante. |
| `POST /votes` | Propietario del tiquete | Emite un voto por tiquete, sin eliminarlo de la rifa. |
| `POST /push-subscriptions` | Visitante | Persiste la suscripción del dispositivo; envío pendiente de integrar. |
| `POST /admin/login` | Cuenta de personal | Autenticación y comprobación de rol. |
| `POST /admin/participants` | `admin`, `registrar` | Registro y generación de token. |
| `GET /admin/metrics` | Cualquier rol de personal | Agregados de estados, admisión, tiquetes y votos. |
| `GET /admin/report` | `admin`, `admissions` | CSV UTF-8 compatible con Excel: ficha, tiempos, encuesta y respuestas. |
| `POST /admin/manual` | `admin`, `registrar` | Completa un reto desde pasaporte físico, con referencia y auditoría. |
| `POST /admin/stand-codes` | `admin`, `registrar` | Emite un código aleatorio, con cupo y vencimiento. |
| `POST /admin/raffles` | `admin`, `raffle` | Extracción ponderada, auditada e idempotente por solicitud. |

El panel inicial contiene los formularios anteriores; la edición de catálogo/agenda y el cierre de rifa se realizan todavía desde Supabase con personal autorizado. No se han implementado endpoints CRUD de contenido ni endpoints nativos PDF/XLSX.

## Ejemplos de cuerpos

### Registro de postulante

```json
{
  "kind": "applicant",
  "identityNumber": "123456789",
  "name": "Ana Ejemplo",
  "email": "ana@example.test",
  "consent": true
}
```

Visitantes usan `kind: "visitor"`, nombre, correo y `phone` obligatorio. La cédula es obligatoria para postulantes y opcional para visitantes. La cédula no se publica en `/me`. Respuesta: `{ "id": "uuid", "token": "K8P2", "expiresInHours": 24 }`. El token se muestra una vez; no se guarda en claro.

### Activación

```json
{ "token": "K8P2" }
```

### Formulario libre

```json
{
  "requestId": "11111111-1111-4111-8111-111111111111",
  "participantId": "UUID-DE-LA-SESION",
  "challengeId": "00000000-0000-4000-8000-000000000001",
  "answers": {
    "projectName": "Nombre del proyecto",
    "level": "Quinto",
    "description": "Explicación breve de lo que descubrí."
  }
}
```

Para especialidad: `answers.quiz` es un objeto de `questionId: indiceDeOpcion`, empezando en cero; se exige además `code`. El código se transforma en HMAC antes de llegar a PostgreSQL y se elimina del registro de respuestas. Los códigos permanecen en la cola offline hasta validar o eliminar el borrador; no se envían a logs.

Para photobooth/patrocinador: `{requestId, participantId, challengeId, code, answers:{}}`. Para santo: `{requestId, participantId, challengeId, answers:{saint:"Nombre del santo"}}`. La comparación de santo inicial ignora mayúsculas y espacios exteriores; no elimina tildes ni alias. Las claves se deben cargar normalizadas con `lower(trim(...))`.

La respuesta contiene `{result, state}`. `result.duplicate` indica si ya estaba registrado. `participantId` debe coincidir con la cookie: se verifica para impedir que un cambio de cuenta entre pestañas envíe borradores al participante equivocado. No permite seleccionar otra cuenta. Un `requestId` no puede reutilizarse para otro reto o respuestas distintas; usar el mismo UUID al reintentar una solicitud incierta.

### Encuesta y voto

```json
{ "expectations": "Conocer las especialidades", "satisfaction": 5, "interest": "TICs" }
```

```json
{ "ticketId": "UUID-DEL-TIQUETE", "projectId": "UUID-DEL-PROYECTO" }
```

El mismo voto al mismo proyecto es idempotente; cambiar de proyecto con un tiquete ya gastado devuelve `409`.

### Operaciones de personal

Login: `{ "email": "personal@example.test", "password": "CONTRASEÑA" }` → `{accessToken, expiresAt, role}`. El panel mantiene el token solo en memoria y no persiste la contraseña ni el refresh token. Al expirar, se debe iniciar sesión otra vez.

Código de stand: `{ "challengeId": "UUID", "maxUses": 1, "validMinutes": 10 }` → `{code, expiresAt}`. El máximo permitido es 120 minutos; para photobooth se recomienda un uso. No utilizar códigos constantes impresos en el repositorio.

Pasaporte: `{ "participantId": "UUID", "challengeId": "UUID", "requestId": "UUID", "answers": {}, "paperReference": "P-001" }`. Solo el personal habilitado puede sustituir la validación digital por una verificación física. Se conserva `source=paper` y la auditoría. Este endpoint no permite completar encuestas sin respuestas.

Rifa: primero cerrar con `update public.settings set raffle_closed=true where id=true;` usando una cuenta de base autorizada. Enviar `{ "requestId": "UUID" }`. La API cuenta los tiquetes al corte, elige un offset con `crypto.randomInt`, y la función SQL valida el conteo, bloquea el cierre y conserva el ganador y la auditoría. Reintentar con el mismo UUID devuelve la extracción existente. Cada tiquete tiene igual probabilidad; un participante con más tiquetes tiene mayor probabilidad. No se excluyen automáticamente ganadores previos en extracciones distintas.

## Errores relevantes

`400`: formato inválido. `401`: sesión/token inválido o vencido. `403`: rol, origen o asignación no permitidos. `409`: conflicto, tiquete gastado, ruta pendiente o rifa sin cierre. `422`: respuestas o código no válidos. `429`: límite de intentos. `503`: configuración ausente o ruta base incompleta. Los errores internos no exponen consultas ni datos personales.
