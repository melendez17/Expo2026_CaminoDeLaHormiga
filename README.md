# El camino de la hormiga · ExpoTEC

Aplicación de CEDES Don Bosco con Next.js, React y TypeScript, API propia y base PostgreSQL/Supabase. La rama `implementacionbackend` conecta las pantallas a `/api/v1` para guardar y consultar datos centrales.

**Ingreso por token para participantes y administradores.** El rol real se verifica en el servidor. Los tokens son privados; no se usan contraseña, QR ni segundo factor en este flujo.

## Iniciar

Requiere Node.js 24 y npm.

```bash
npm ci
npm run dev
```

Antes de abrir la aplicación, configurar `.env.local` a partir de `.env.example`, aplicar las migraciones y preparar el catálogo/primer administrador con [la guía de Supabase](docs/supabase/setup.md). No compartir service_role ni incluir claves privadas en NEXT_PUBLIC.

**Si ya configuraste Supabase**, aplicar la migración pendiente `supabase/migrations/202611030004_frontend_api.sql`, comprobar `CAMINO_BACKEND_ENABLED=true` y reiniciar Next.js. No volver a sembrar la base ni crear el primer administrador si ya existen. Ver [activación del frontend conectado](docs/supabase/frontend.md).

Si falta configuración o conexión, la aplicación muestra el error; no cambia al modo local ni inventa confirmaciones de guardado. El frontend ya no consume los JSON públicos, y los avances guardados anteriormente en navegadores no se transfieren automáticamente.

## Funcionalidades

- Visitante: primera ronda de dos, uno afín si está disponible y otro aleatorio; siguientes rondas aleatorias, sin repetir proyectos. Un tiquete/voto por cada dos completados.
- Admisión: distribución de cinco retos por área configurable por el administrador. Especialidad: propio de décimo, propio de undécimo, otro propio, otra especialidad y extra.
- Retos con preguntas, códigos, formularios y santos; fallo bloqueado con evidencia y sustitución, sin aumentar la meta ni conceder premios por fallar.
- Resumen personal, encuesta y bono, historial de votos, búsqueda de proyectos y top agregado.
- Agenda, mapa 2D/3D con zoom y proyectos por edificio. Desarrollo Web/Ciberseguridad comparten TICs; Electromecánica corresponde a EMA.
- Administración de participantes y admins, proyectos, retos/niveles, agenda, distribución y cambios individuales por categoría.
- Tiquetes digitales/manuales incrementales (`M-TOKEN-001`), un crédito por voto y rifa uniforme que excluye el tiquete ganador de sorteos posteriores.
- Respuestas por persona, métricas, paginación, búsqueda, reportes CSV y Excel del servidor.

Las acciones se confirman después de guardar. El servidor aplica premios, asignaciones y votos atómicamente. Las vistas se refrescan periódicamente y con el foco; no se guardan progresos o sesiones privadas en localStorage. Se requiere conexión para confirmar operaciones.

## Documentación

- [Configuración y conexión](docs/supabase/setup.md)
- [Frontend conectado y actualización desde JSON](docs/supabase/frontend.md)
- [API](docs/supabase/api.md)
- [UML de la base](docs/supabase/database-uml.md)
- [Seguridad](docs/supabase/security.md)
- [Importaciones, respaldos y capacidad](docs/supabase/operations.md)
- [Consultas SQL](docs/supabase/queries.sql)

`public/data` conserva ejemplos ficticios para semillas de staging y pruebas. No colocar ahí personas, códigos ni respuestas reales. Los datos reales y archivos de acceso van fuera de Git, por ejemplo en `private/`. La implementación JSON anterior permanece como referencia, pero no es el acceso de las páginas actuales.

## Verificación

```bash
npm run typecheck
npm test
npm run build
```

Para comprobar la interfaz, iniciar `npm start -- --port 3008` y ejecutar `npm run test:api-browser` (BASE_URL permite cambiar el servidor). La prueba utiliza el frontend y el handler real con PostgreSQL embebido, sin conectarse a una base externa ni enviar correos.

En un despliegue de producción configurar el origen HTTPS y las variables privadas del servidor. La aplicación necesita runtime de Next.js, por ejemplo Vercel o un servidor Node; el dominio por sí solo no provee API ni PostgreSQL. La capacidad con 1.500 usuarios debe medirse en staging antes de la feria.
