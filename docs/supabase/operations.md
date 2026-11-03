# Operación, migración y capacidad

## 5.000 registros y hasta 1.500 personas concurrentes

El número de registros no equivale al número de conexiones PostgreSQL: Next.js usa la Data API de Supabase con RPC, sin abrir un socket por participante. Catálogo se comparte por instancia diez segundos; listas están paginadas, ranking agregado e índices cubren votos, asignaciones y tiquetes. Las mutaciones bloquean por participante; catálogo/sorteos tienen bloqueos globales breves para consistencia. Las ediciones de catálogo validan todos los progresos y pueden ser costosas: evitarlas masivamente en horas punta.

**No se garantiza que el plan gratis soporte 1.500 usuarios activos a la vez.** La cuota de almacenamiento, tamaño de respuestas/historial, CPU, ancho de banda y frecuencia de acciones importan más que contar perfiles. Revisar los límites y precios vigentes en el panel de Supabase y del hosting; sus planes pueden cambiar. La prueba local verifica corrección, no capacidad del servicio contratado. No hay una carga real de 1.500 ejecutada en esta entrega.

Antes de la feria:

1. Crear staging con catálogo y datos sintéticos, sin correos/personas reales. Medir tamaño de base con `queries.sql` y extrapolar respuestas/intentos/votos/tiquetes esperados de 5.000 personas. Reservar margen; no cargar imágenes en PostgreSQL.
2. Probar desde el hosting previsto y una red semejante al colegio; medir p95/p99, 429/5xx, CPU/IO y recursos de Next.js/Supabase. Verificar límites de duración/memoria de las funciones del hosting.
3. Ejecutar gradualmente `scripts/load/backend.k6.js`. Usa accesos privados únicos por usuario virtual y NO debe ejecutarse contra producción. Puede crear avance/tiquetes si se amplía; este guion solo inicia rutas y lee.
4. Usar un solo refresco periódico por pantalla/visibilidad (p.ej. ranking cada 20–30 s), no polling por cada tarjeta. Empezar con lectura HTTP; no suscribir 1.500 sockets de Realtime para datos privados.
5. Tener plan de respaldo y presupuesto de contingencia. Si la prueba excede recursos/cuotas, contratar capacidad temporal o reducir tráfico. Dominio/hosting del colegio no incluyen automáticamente recursos de Supabase ni SMTP.

Ejemplo, con k6 instalado por separado, contra staging propio:

```bash
k6 run -e ALLOW_STAGING_LOAD=true -e BASE_URL=https://staging.example.cr -e ACCESS_FILE="$PWD/private/staging-access.json" -e VUS=100 scripts/load/backend.k6.js
```

Aumentar a 300, 750 y 1.500 solo después de revisar métricas. Preparar un archivo nuevo de accesos para cada ejecución: las credenciales son de un solo uso. Cada VU usa su propia persona. No enviar credenciales a servicios de carga externos.

## Migrar usuarios existentes

El JSON local no es una base central: cada navegador puede tener avances diferentes. Consolidar y revisar respaldos administrativamente antes de importar. No aceptar archivos de progreso de participantes como fuente de premios. El script de importación es una herramienta privilegiada para datos confiables, no un endpoint de autoservicio.

Formato básico: arreglo de perfiles con firstName, firstSurname, secondSurname, email, role y area. La validación rechaza datos incompletos/duplicados; corregirlos, no inventarlos. Token e ID de destino se generan nuevos y se guarda correspondencia al ID anterior.

```bash
npm run db:import-users -- --file private/usuarios.json
npm run db:import-users -- --file private/usuarios.json --actor UUID_ADMIN --credentials-output private/accesos.json --apply
```

Para conservar avances, un respaldo JSON privado debe contener `{ "catalog": CATALOGO_COMPLETO_CON_USUARIOS, "storage": { "CLAVE_LOCALSTORAGE": "JSON_DEL_PROGRESO" } }`. Primero inicializar **ese mismo catálogo** en destino; luego:

```bash
npm run db:import-users -- --file private/respaldo.json --include-progress
npm run db:import-users -- --file private/respaldo.json --include-progress --actor UUID_ADMIN --credentials-output private/accesos.json --apply
```

Se valida todo el archivo antes de crear usuarios y se exige catálogo compatible. Las versiones de catálogos no se renombran durante una importación con avances. La migración conserva intentos, completados, votos, encuestas y manuales; los autores históricos de manuales/ediciones se atribuyen al administrador migrador porque los IDs locales no son identidades Auth. Guardar el respaldo original como evidencia. Las rifas históricas locales no se insertan automáticamente como nuevos sorteos de la base: conservarlas archivadas y conciliar ganadores antes de habilitar sorteos reales. No importar históricos después de iniciar una rifa real sin una conciliación.

La importación es transaccional por persona, no por archivo entero. Ante un fallo conserva la salida de credenciales de quienes ya fueron creados; no borrarla ni relanzar con cambios arbitrarios. Los requestId son estables por correo/versión durante los siete días de retención; reintentar el mismo archivo con otro nombre de salida dentro de ese plazo y revisar resultados. Si venció ese plazo, conciliar registros existentes antes de reintentar. Nunca crear correos ficticios para sortear un duplicado.

El Excel administrativo permite leer/exportar datos y preservar la evidencia de la demo. No hay endpoint de restauración masiva desde Excel: evita permitir que editar una hoja altere premios reales. Para una migración excepcional preparar/revisar el JSON confiable o una migración SQL específica.

## Correo opcional

QR/enlace entregado por información no depende de SMTP. Para correo habilitar EMAIL_ACCESS_ENABLED y configurar SMTP_HOST/PORT (465 o 587), SMTP_USER/PASSWORD, MAIL_FROM y JOBS_SECRET en el servidor. Usar proveedor con TLS, SPF, DKIM y DMARC; verificar cuotas/precios y autorización del dominio. El SMTP de Supabase Auth administra invitaciones de admins por separado; no equivale al SMTP de participantes de esta aplicación.

Programar un POST por minuto a `/api/v1/internal/jobs` con Bearer JOBS_SECRET desde un scheduler privado. No se agregó cron externo que envíe mensajes automáticamente. El worker procesa hasta 200 mensajes por ejecución y como máximo unos 35 s antes de terminar el grupo activo, con cinco envíos en paralelo, arrendamiento de dos minutos, reintentos hasta cinco y exclusión con SKIP LOCKED. No registrar payloads del outbox. El transporte es al menos una vez: un corte después de enviar puede duplicar el correo; códigos/enlaces siguen siendo de un uso. El código más reciente invalida los anteriores, aunque un mensaje viejo tarde en llegar.

Monitorear pendientes/fallidos y latencia de entrega: 1.500 correos simultáneos no implican entrega inmediata. Probar con buzones controlados del colegio antes de habilitarlo al público. Sin scheduler el OTP no llega aunque quede encolado.

## Respaldos y recuperación

- Exportación administrativa CSV de participantes, Excel completo de consulta/catalogación o JSON. Todas son privadas, auditadas y pueden contener datos de menores.
- Excel se genera en memoria. Probar su tamaño y duración con 5.000 personas/historial; si excede el hosting, ejecutar desde un servidor de operación con capacidad o implementar exportación por trabajo, no aumentar límites sin medir.
- Para desastre usar respaldos PostgreSQL del proveedor o `pg_dump` en un puesto seguro; comprobar que incluye `camino` y su relación con `auth.users`. Las opciones automáticas y recuperación puntual dependen del plan. **Excel no restaura Auth, claves, sesiones, auditoría y outbox de forma integral**.
- Guardar TOKEN_PEPPER, APP_ENCRYPTION_KEY y configuración en un gestor externo a la base. Perder la clave impide descifrar accesos/outbox; cambiar pepper invalida credenciales/OTP pendientes. Para rotarlas, planear revocación y reemisión controlada.
- Probar restauración en un proyecto aislado antes de necesitarla. No mezclar catálogos/versiones o restaurar solo proyecciones sin snapshots.
- La baja normal es lógica por integridad de votos/tiquetes. La eliminación definitiva/anonimización al cerrar el evento requiere política del colegio y operación SQL revisada, no borrar perfiles con referencias a mano.

El job elimina sesiones expiradas, OTP antiguos, rate limits vencidos y caché de solicitudes/outbox de más de siete días (OTP un día tras vencer). Los datos de participación y auditoría no se borran automáticamente: acordar plazo de conservación.

## Comprobaciones

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Las pruebas nuevas usan PostgreSQL embebido y HTTP real en memoria; no requieren cuentas reales ni envían correos. `db:check` y `api:check` son las comprobaciones pendientes contra el proyecto real. La interfaz local conserva sus pruebas de navegador. No se ejecutó carga contra servicios de terceros.
