# Backend Supabase · implementación y estado

Rama: `implementacionbackend`. El backend real está implementado en `/api/v1` y probado localmente con PostgreSQL embebido (PGlite), HTTP Request/Response reales y pruebas de concurrencia/idempotencia. No se ha creado ni conectado un proyecto remoto: falta configurar las credenciales del colegio y verificar Supabase Auth, SMTP y rendimiento en ese entorno.

**La interfaz existente sigue siendo la demo JSON/localStorage.** Esta entrega agrega el backend y el adaptador `src/lib/api-client.ts`; todavía no sustituye el almacenamiento de `journey.tsx`. Activar una variable no migra la interfaz. No introducir personas reales en la demo pública ni asumir que sus cambios se comparten entre dispositivos. La conexión de las pantallas se hace en la siguiente etapa, contra estos endpoints, eliminando las ayudas con respuestas y el login local. El diseño y la lógica actual se conservaron.

| Guía | Contenido |
|---|---|
| [Configuración paso a paso](setup.md) | Crear Supabase, migrar, preparar catálogo, primer administrador y probar la conexión |
| [UML de la base de datos](database-uml.md) | Diagrama completo, claves, relaciones y archivos editables |
| [API](api.md) | Rutas, permisos, cuerpos, errores y reintentos |
| [Seguridad y arquitectura](security.md) | Credenciales, RLS, transacciones, privacidad y límites |
| [Operación y capacidad](operations.md) | Importación, respaldos, correo, 5.000 personas y prueba de carga |
| [Verificación y pendientes](verification.md) | Evidencia local y pruebas que faltan en el entorno real |
| [Consultas SQL](queries.sql) | Ver usuarios, respuestas, tiquetes, votos, asignaciones y ganadores |

## Lógica que se mantiene

- Roles únicos `admin`, `visitor`, `admission`. Área independiente: Pasitos, Escuela, Tercer ciclo o una de las seis especialidades. No existe duplicidad `kind`/rol.
- Visitante: primera ronda de dos, uno del área afín si está disponible y otro aleatorio; siguientes rondas aleatorias entre todas las áreas, sin repetir proyectos. Un tiquete/voto por cada dos completados.
- Admisión: cinco base con las cuotas configuradas por área. Especialidad: uno propio de décimo, uno propio de undécimo, otro propio y uno de otra especialidad, más un extra. No se cambia la distribución de rutas ya iniciadas.
- Desarrollo Web y Ciberseguridad comparten TICs. Proyectos y retos conservan nivel y edificio; Electromecánica corresponde a EMA.
- Los fallos quedan como evidencia bloqueada con la corrección y se sustituyen en el mismo puesto por un extra. No dan premios ni aumentan la meta. Las respuestas correctas nunca se envían antes del intento.
- Asignación manual por categoría/nivel, con motivo y auditoría. Completados protegidos. Proyectos cerrados dejan de entrar en nuevas rutas.
- Tiquetes digitales y manuales incrementales por persona; manuales `M-TOKEN-001`. Votar consume el crédito asociado a un tiquete; conserva su participación en la rifa.
- Sorteo uniforme por tiquete, sin repetir tiquete ganador. La misma persona puede ganar con otro tiquete. Historial persistente.
- Usuarios, respuestas, agenda, proyectos, retos, distribución, ranking, encuesta, métricas, Excel y auditoría cuentan con endpoints administrativos/participantes según corresponda.

## Decisión de acceso

El código hexadecimal de cuatro caracteres identifica a la persona, pero **no es una contraseña**: existen solo 65.536 combinaciones; con 5.000 registros, cerca del 7,6 % de las combinaciones identificarían a alguien. La entrega por un administrador continúa: al registrar se obtiene el código corto y un enlace/QR privado, de un solo uso y 24 horas. Alternativamente, el participante solicita un código temporal de ocho dígitos enviado a su correo registrado. El administrador puede reemitir el acceso, revocando los anteriores. No hay registro público.
