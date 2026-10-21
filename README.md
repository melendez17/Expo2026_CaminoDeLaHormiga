# El camino de la hormiga · ExpoTEC 2026

Base inicial de una PWA para CEDES Don Bosco: **Next.js 16, React 19, TypeScript y PostgreSQL/Supabase**. Reutiliza las imágenes y los 19 polígonos 2D/3D del HTML adjunto `MapasInteractivosCEDES_V1.1 (3).html`. Los prototipos originales de `Pruebas/` se conservan.

## Ejecutar

Requisitos: Node.js 24 LTS y npm. Desde la raíz del repositorio:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Sin credenciales se puede explorar el mapa y una propuesta de retos, identificada como **vista de ejemplo**. El registro, la activación y los premios requieren una base real; no se simulan sesiones ni se conceden tiquetes en el navegador.

Para conectar Supabase:

1. Crea un proyecto de **desarrollo** y ejecuta, en orden, los SQL de `supabase/migrations/` mediante el editor SQL o tu flujo habitual de migraciones. Estas migraciones crean tablas nuevas; no ejecutarlas sobre datos de producción sin revisión y respaldo.
2. Opcionalmente ejecuta `supabase/seed.example.sql` en desarrollo. Contiene retos y respuestas ficticios, sin códigos de acceso ni cuentas de personal. No representa la agenda oficial. Sustituye ubicaciones, proyectos, preguntas y respuestas antes del evento.
3. Configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_PEPPER` y `APP_ORIGIN` en `.env.local` o en el gestor seguro del alojamiento. Genera un pepper aleatorio de al menos 32 bytes. No lo cambies sin planificar la reemisión de códigos: los hashes existentes dependen de él. **La clave de servicio y el pepper son exclusivos del servidor** y nunca llevan prefijo `NEXT_PUBLIC_`.
4. Crea la primera cuenta de personal en Supabase Auth y agrega su UUID a `public.staff` con el rol `admin`. El registro público de Supabase Auth debe quedar deshabilitado para este flujo de personal. Para producción configura MFA para administradores y un flujo que lo exija antes de habilitar operaciones sensibles; esta base usa contraseña y validación del rol, sin desafío MFA implementado.
5. Inicia el servidor, entra en `/admin`, registra un participante y entrega el token de cuatro caracteres. Desde el panel puedes generar códigos de stand; por defecto son de un solo uso.

Ejemplo de alta del primer administrador (reemplaza el UUID por el usuario creado en Auth):

```sql
insert into public.staff(user_id, role, display_name)
values ('UUID-DE-AUTH', 'admin', 'Administrador ExpoTEC');
```

La activación exige exactamente cinco retos base activos. Los retos se asignan al registrar: cinco base, los extras disponibles y un único reto del santo elegido al azar. No cambies las reglas de un reto ni su condición de base cuando ya haya participantes; publica una nueva edición para cambios de reglas.

## Validación

```bash
npm run typecheck
npm test
npm run build
npm start
```

Con `npm start` activo en otra terminal, puedes ejecutar `npm run test:browser` después de instalar Chromium con `npx playwright install chromium`. Para usar un Chromium del sistema: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser`. El ensayo de offline se realiza sobre el build de producción, no sobre el servidor de desarrollo. Parte de la prueba de cola utiliza una API de fixture; la lógica de premios se valida con SQL real por separado.

Las pruebas SQL ejecutan las migraciones reales en PGlite, un motor PostgreSQL local en WebAssembly, con un esquema `auth` de prueba. Cubren idempotencia, premios, consumo de códigos, permisos, votación y sorteo. No sustituyen una prueba contra el proyecto real de Supabase, PostgREST y Auth.

## Regla acordada

- Cinco retos base completos → **un tiquete**.
- Cada dos retos adicionales → **otro tiquete**, una vez completados los cinco base.
- Cada tiquete permite un voto; emitirlo **no elimina** la participación en la rifa.
- La encuesta es obligatoria para completar admisión de postulantes. `route_completed_at` y `admission_completed_at` son independientes. El estado del recorrido sigue siendo «Completado» al continuar jugando.
- El bono de encuesta se configura en `settings.survey_bonus`; valor inicial propuesto: **1**. La encuesta no puede cobrar el bono dos veces.
- Los hitos se muestran como insignias. El progreso y los premios solo se confirman con respuestas del servidor.

## Documentación

- [Arquitectura, capacidad y decisiones](docs/architecture.md)
- [Tablas, tipos y relaciones](docs/database.md)
- [Endpoints y ejemplos](docs/api.md)
- [Offline, seguridad y pendientes de producción](docs/operations.md)

Esta entrega es una **base funcional de desarrollo**. Pendientes de integración: credenciales Supabase, catálogo y agenda oficiales, proveedor de consulta por cédula, URL de radio, envío programado de push, PDF/XLSX nativos y prueba de carga con 4.000 sesiones. La exportación implementada es CSV compatible con Excel. No se ha desplegado en un servicio público.
