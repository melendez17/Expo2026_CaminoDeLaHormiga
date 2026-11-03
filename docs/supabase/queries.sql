-- Consultas de SOLO LECTURA para el SQL Editor privado de Supabase.
-- No publicar estas consultas ni resultados con datos personales.
-- IDs, fechas y relaciones son de la base nueva, no de tablas legacy public.

-- Usuarios; el código corto identifica, nunca autoriza por sí solo.
select id, first_name, first_surname, second_surname, email, role, area,
       public_token as token, active, created_at
from camino.profiles order by created_at desc limit 100;

-- Respuestas completadas con persona/proyecto.
select p.public_token, concat_ws(' ', p.first_name, p.first_surname, p.second_surname) as persona,
       c.title as reto, pr.name as proyecto, pr.specialty, pr.level,
       a.answers, a.completed_at
from camino.completions a
join camino.profiles p on p.id = a.participant_id
join camino.challenges c on c.id = a.challenge_id
left join camino.projects pr on pr.id = c.project_id
order by a.completed_at desc limit 100;

-- Intentos incorrectos y reto que reemplazó al original.
select p.public_token, c.title as fallado, a.answers, a.attempted_at,
       r.title as reemplazo
from camino.attempts a
join camino.profiles p on p.id = a.participant_id
join camino.challenges c on c.id = a.challenge_id
join camino.challenges r on r.id = a.replacement_id
order by a.attempted_at desc limit 100;

-- Claves de corrección: SOLO personal autorizado, nunca endpoint público.
select c.title, q.prompt, q.options, q.correct_index,
       q.options ->> q.correct_index as correcta
from camino.questions q join camino.challenges c on c.id = q.challenge_id;

-- Tiquetes y estado de voto (votar no los elimina de la rifa).
select p.public_token, t.code, t.source, t.issued_at,
       (v.id is not null) as voto_usado, (r.id is not null) as ya_gano
from camino.tickets t join camino.profiles p on p.id = t.participant_id
left join camino.votes v on v.ticket_id = t.id
left join camino.raffles r on r.ticket_id = t.id
order by t.issued_at desc limit 100;

-- Ranking agregado con empates y proyectos sin votos.
with conteo as (
  select pr.id, pr.name, pr.specialty, pr.category, count(v.id) as votos
  from camino.projects pr left join camino.votes v on v.project_id = pr.id
  group by pr.id
)
select case when votos > 0 then rank() over (order by votos desc) end as puesto, *
from conteo order by votos desc, name limit 100;

-- Asignación actual: cambiarla mediante la API, no editando esta tabla.
select p.public_token, c.title, a.phase, a.round
from camino.assignments a join camino.profiles p on p.id = a.participant_id
join camino.challenges c on c.id = a.challenge_id
order by p.public_token, a.round;

-- Historial de sorteos.
select r.id, r.prize, t.code as tiquete, p.email,
       concat_ws(' ', p.first_name, p.first_surname, p.second_surname) as ganador,
       r.pool_size, r.created_at, r.actor_id
from camino.raffles r join camino.tickets t on t.id = r.ticket_id
join camino.profiles p on p.id = t.participant_id order by r.created_at desc;

-- Tamaño y cola de correo sin revelar mensajes ni destinatarios.
select pg_size_pretty(sum(pg_total_relation_size(c.oid))) as tamano_camino
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'camino' and c.relkind in ('r','m');
select status, count(*) from camino.mail_outbox group by status;
select action, count(*) from camino.audit group by action order by count(*) desc;
