# Operación, offline y pendientes

## Offline

La PWA guarda las respuestas primero en IndexedDB. Cada fila conserva participante, UUID de solicitud, fecha, respuesta y código hasta su validación. La cola no mezcla cuentas: antes de sincronizar consulta `/api/me` y solo envía elementos de esa sesión. Una sesión vencida detiene la sincronización y requiere reactivar el token. Un token también vencido requiere intervención del puesto de registro; la reemisión todavía no tiene interfaz propia.

Service worker: cachea únicamente el shell público, mapas, estáticos y catálogo. Nunca cachea `/me`, el panel, reportes ni respuestas privadas de API. El progreso confirmado se mantiene en `sessionStorage` para que la vista sobreviva a una recarga sin conexión; se borra al cerrar sesión. Las respuestas pendientes permanecen en IndexedDB aunque se cierre la pestaña. Debe evitarse el uso de dispositivos compartidos sin cerrar sesión y eliminar los borradores.

Se sincroniza al recuperar red y cada 30 segundos mientras la aplicación está abierta. Background Sync se registra si el navegador lo soporta; **no se garantiza ejecución con la aplicación cerrada**, especialmente en iOS. La conexión puede existir y el servidor fallar: errores de red, `429` y `5xx` mantienen la cola; errores de validación permanecen visibles y permiten eliminar el borrador y responder nuevamente. Un reto pendiente no entrega tiquetes locales.

La PWA requiere una primera carga completa con conexión y HTTPS en producción (localhost es una excepción de navegador). El manifiesto e icono SVG son iniciales; para distribución añade iconos PNG de 192/512, maskable y Apple touch icon y verifica los criterios de instalación de los dispositivos objetivo. Incrementa la versión de caché en despliegues que cambien el shell. No se solicita instalar la aplicación ni habilitar push de manera automática.

## Controles y límites

- Código de cuatro caracteres con alfabeto de 32 símbolos: 1.048.576 combinaciones, generación criptográfica, detección de colisiones y HMAC con pepper secreto. La brevedad limita su entropía: en producción se necesita protección de activación en el borde (WAF/bot challenge), monitoreo y, si es posible, un segundo factor de posesión o códigos más largos.
- Rate limiting persistente en PostgreSQL: activación 20/min por IP y 600/min global; contraseña de personal 10/min; envío de retos 30/min por sesión. No asumir IP fiable sin proxy. `TRUST_PROXY=false` comparte un bucket por alcance como protección conservadora de desarrollo. Para el evento, configurar un proxy que **elimine/reemplace** `x-forwarded-for`, habilitar `TRUST_PROXY=true` y ajustar límites para familias en NAT o Wi-Fi institucional, con métricas. No activar confianza en cabeceras arbitrarias del cliente.
- El origen de cada POST debe coincidir con `APP_ORIGIN`. Configurar un valor fijo HTTPS en producción. El endpoint nunca acepta un ID de participante del cliente para completar retos digitales o votar.
- Supabase Auth valida contraseñas; `staff` autoriza cada operación. El panel inicial no incorpora recuperación de contraseña ni MFA; habilitar un flujo de MFA que se verifique en API antes de producción.
- Todas las tablas tienen RLS sin políticas para acceso público, y los RPC son exclusivos de `service_role`. Aplicar la clave de servicio únicamente en el servidor. El rol de servicio tiene privilegios amplios: proteger alojamiento, logs y gestión de configuración.
- Los CSV neutralizan fórmulas de hoja de cálculo y se entregan con `no-store`. Los reportes contienen información personal: permitir descarga solo a personal de admisión y administradores.
- Los límites persistentes y las sesiones vencidas requieren limpieza programada. Diseñar una política de retención para cédulas, correos, teléfonos, respuestas, consentimiento y auditorías, con revisión institucional y tratamiento de datos de menores.

## Consulta de nombres por cédula

Candidato a evaluar: la consulta de actividades económicas del Ministerio de Hacienda, `https://api.hacienda.go.cr/fe/ae?identificacion=...`. Es un servicio tributario: **no equivale a un padrón civil**, no garantiza cobertura de menores/personas no inscritas y no debe asumirse autorizado para admisión. Una razón social tampoco sustituye siempre al nombre legal de una persona.

En este entorno, la solicitud al dominio devolvió `403` del proxy de salida. No se ha verificado el contrato, vigencia, SLA ni la adecuación legal del proveedor; no hay integración automática ni nombres reales consultados. Para investigar hace falta habilitar `api.hacienda.go.cr` en la política de red o consultar su documentación desde un entorno autorizado.

Antes de integrar: confirmar con CEDES la base legal, el proveedor autorizado (incluida la vía oficial del Registro Civil/TSE si está disponible para la institución), propósito, cobertura y condiciones de uso. Implementar un adaptador **del lado servidor**, con tiempo límite, caché con retención definida y límites de consultas. Mostrar el nombre como sugerencia editable, mantener entrada manual y no enviar cédulas a proveedores desconocidos. Nunca poner claves de proveedor en el navegador ni pedirlas en chat.

## Agenda, radio y push

`agenda_events` separa general, pastoral y radio. Horarios persistidos en `timestamptz`, mostrados en `America/Costa_Rica`. Cargar la programación oficial; no hay fechas ficticias en el seed. Configurar una URL HTTPS compatible con el navegador en `settings.radio_url`; el reproductor flotante no hace autoplay.

La tabla y endpoint de suscripciones y el receptor `push` del service worker son la base, **no un envío programado terminado**. Faltan claves VAPID, interfaz de consentimiento, worker con `web-push`, programación de recordatorios por actividad, eliminación de suscripciones `410`, deduplicación, zonas de interés y pruebas iOS/Android. El worker debe validar los destinos de proveedores push y no efectuar peticiones a URLs arbitrarias proporcionadas por usuarios. Mantener la agenda consultable sin notificaciones.

## Validación y producción

Las pruebas incluidas validan la lógica SQL en PostgreSQL/PGlite; no levantan Supabase Auth/PostgREST. Antes de desplegar:

1. Aplicar migraciones a un Supabase de desarrollo; probar registro, activación, roles y reportes contra el servicio real.
2. Configurar cinco retos base reales, extras, preguntas, claves, ubicaciones y código por stand. Confirmar el bono de encuesta (inicial 1).
3. Ejecutar el recorrido con dispositivos móviles, corte de red, recarga, sesión vencida, reintentos y cambio de participante. Confirmar persistencia y no duplicación de premios.
4. Ejecutar carga con 4.000 sesiones distintas, observar latencias y dimensionar infraestructura. Las pruebas unitarias no certifican concurrencia de 4.000 personas.
5. Ensayar restauración de respaldo, cierre de rifa, extracción auditada y pasaporte físico. El snapshot de rifa registra fecha, conteo y offset; la base inicial no exporta un manifiesto criptográfico completo de todos los tiquetes elegibles.
6. Completar MFA, retención y revisión de accesibilidad (incluido foco del diálogo), iconos móviles y políticas de contenido. La UI inicial no es una auditoría WCAG ni una revisión de seguridad de producción.

PDF y XLSX nativos, edición de contenidos desde el panel, recuperación/reemisión de tokens y entrega push son extensiones pendientes. CSV, control de roles, registro, premios y sorteo tienen implementación inicial. La capacidad y autenticación real necesitan la configuración externa indicada; no introducir credenciales ficticias para aparentar validación.
