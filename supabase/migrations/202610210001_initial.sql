begin;
-- Todas las tablas son privadas. Solo la API, después de autenticar al actor,
-- usa service_role. Nunca entregar esta clave a un navegador.
create table public.settings (
  id boolean primary key default true check (id),
  survey_bonus integer not null default 1 check (survey_bonus between 0 and 10),
  voting_open boolean not null default true,
  raffle_closed boolean not null default false,
  radio_url text
);
insert into public.settings(id) values(true);
create table public.staff (
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('admin','registrar','admissions','raffle')),
  display_name text not null
);
create table public.buildings (
  id text primary key,
  name text not null,
  map_zone text not null check (map_zone ~ '^[0-9]{1,2}$')
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  building_id text not null references public.buildings,
  name text not null,
  description text not null default '',
  active boolean not null default true
);
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  building_id text not null references public.buildings,
  project_id uuid references public.projects,
  title text not null,
  description text not null,
  kind text not null check(kind in ('freeform','quiz_code','code','saint')),
  is_base boolean not null default false,
  badge_key text check(badge_key in ('moment')),
  active boolean not null default false,
  check (kind <> 'quiz_code' or project_id is not null)
);
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges,
  kind text not null check(kind in ('objective','technical')),
  prompt text not null,
  options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6),
  unique(challenge_id,kind)
);
create table public.answer_keys (
  question_id uuid primary key references public.quiz_questions,
  correct_index integer not null check(correct_index between 0 and 5)
);
create table public.saint_keys (
  challenge_id uuid primary key references public.challenges,
  normalized_answer text not null
);
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('applicant','visitor')),
  identity_number text unique,
  name text not null check(length(name) between 2 and 120),
  email text not null,
  phone text,
  token_hash text not null unique,
  token_expires_at timestamptz not null default (now()+interval '24 hours'),
  created_by uuid not null references public.staff(user_id),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  route_completed_at timestamptz,
  admission_completed_at timestamptz,
  consent_at timestamptz not null,
  check(kind <> 'applicant' or identity_number is not null),
  check(kind <> 'visitor' or phone is not null)
);
create table public.participant_sessions (
  token_hash text primary key,
  participant_id uuid not null references public.participants on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index participant_sessions_owner on public.participant_sessions(participant_id);
create table public.challenge_assignments (
  participant_id uuid not null references public.participants,
  challenge_id uuid not null references public.challenges,
  primary key(participant_id,challenge_id)
);
create table public.stand_codes (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges,
  code_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer not null check(max_uses>0),
  uses integer not null default 0 check(uses>=0 and uses<=max_uses),
  created_by uuid not null references public.staff(user_id)
);
create table public.completions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants,
  challenge_id uuid not null references public.challenges,
  request_id uuid not null,
  answers jsonb not null,
  source text not null check(source in ('digital','paper')),
  created_at timestamptz not null default now(),
  unique(participant_id,challenge_id),
  unique(participant_id,request_id)
);
create table public.surveys (
  participant_id uuid primary key references public.participants,
  expectations text not null,
  satisfaction integer not null check(satisfaction between 1 and 5),
  interest text not null,
  created_at timestamptz not null default now()
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants,
  source text not null check(source in ('route','extra','survey')),
  ordinal integer not null check(ordinal>0),
  created_at timestamptz not null default now(),
  unique(participant_id,source,ordinal)
);
create index tickets_owner on public.tickets(participant_id);
create table public.votes (
  ticket_id uuid primary key references public.tickets,
  project_id uuid not null references public.projects,
  created_at timestamptz not null default now()
);
create index votes_project on public.votes(project_id);
create table public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  building_id text references public.buildings,
  category text not null check(category in ('general','pastoral','radio')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check(ends_at>starts_at)
);
create index agenda_by_time on public.agenda_events(starts_at);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants,
  endpoint text not null unique check(endpoint like 'https://%'),
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  ticket_id uuid not null references public.tickets,
  eligible_count bigint not null,
  selected_offset bigint not null,
  snapshot_at timestamptz not null,
  actor_id uuid not null references public.staff(user_id),
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.staff(user_id),
  action text not null,
  subject_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
create function public.take_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql set search_path=public,pg_temp as $$
declare v_hits integer;
begin
 insert into rate_limits(key,window_start,hits) values(p_key,now(),1)
 on conflict(key) do update set
 hits=case when rate_limits.window_start < now()-make_interval(secs=>p_seconds) then 1 else rate_limits.hits+1 end,
 window_start=case when rate_limits.window_start < now()-make_interval(secs=>p_seconds) then now() else rate_limits.window_start end
 returning hits into v_hits;
 return v_hits<=p_limit;
end $$;

create function public.activate_participant(p_token_hash text,p_session_hash text)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 select id into v_id from participants where token_hash=p_token_hash and token_expires_at>now() for update;
 if v_id is null then raise exception 'invalid_token'; end if;
 update participants set activated_at=coalesce(activated_at,now()) where id=v_id;
 -- Congela los cinco retos base y asigna un edificio al azar para el reto del santo.
 if not exists(select 1 from challenge_assignments where participant_id=v_id) then
  if (select count(*) from challenges where active and is_base)<>5 then raise exception 'route_not_configured'; end if;
  insert into challenge_assignments select v_id,id from challenges where active and is_base;
  insert into challenge_assignments select v_id,id from challenges where active and not is_base and kind<>'saint';
  insert into challenge_assignments select v_id,id from challenges where active and not is_base and kind='saint' order by random() limit 1;
 end if;
 insert into participant_sessions(token_hash,participant_id,expires_at) values(p_session_hash,v_id,now()+interval '24 hours');
 return v_id;
end $$;

create function public.complete_challenge(
 p_participant uuid,p_challenge uuid,p_request uuid,p_answers jsonb,
 p_code_hash text default null,p_actor uuid default null,p_paper_ref text default null
) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare c challenges; existing completions; code stand_codes; base_count integer; extra_count integer; q_count integer; v_role text;
begin
 -- Mutex por visitante: protege recompensas, reintentos y sincronización concurrente.
 perform 1 from participants where id=p_participant for update;
 if not found then raise exception 'participant_missing'; end if;
 if p_actor is null and not exists(select 1 from participants where id=p_participant and activated_at is not null) then raise exception 'not_activated'; end if;
 select * into existing from completions where participant_id=p_participant and request_id=p_request;
 if found then
  if existing.challenge_id<>p_challenge or existing.answers<>p_answers then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('completed',true,'duplicate',true);
 end if;
 if exists(select 1 from completions where participant_id=p_participant and challenge_id=p_challenge) then
  return jsonb_build_object('completed',true,'duplicate',true);
 end if;
 select * into c from challenges where id=p_challenge and active;
 if not found then raise exception 'challenge_missing'; end if;
 if not exists(select 1 from challenge_assignments where participant_id=p_participant and challenge_id=p_challenge) then raise exception 'challenge_not_assigned'; end if;
 if p_actor is not null then
  select role into v_role from staff where user_id=p_actor;
  if v_role is null or v_role not in ('admin','registrar') or length(trim(coalesce(p_paper_ref,'')))<3 then raise exception 'paper_forbidden'; end if;
 else
  if c.kind='freeform' and (length(trim(coalesce(p_answers->>'projectName','')))<2 or length(trim(coalesce(p_answers->>'level','')))<1 or length(trim(coalesce(p_answers->>'description','')))<10) then raise exception 'invalid_answers'; end if;
  if c.kind='saint' and not exists(select 1 from saint_keys where challenge_id=c.id and normalized_answer=lower(trim(p_answers->>'saint'))) then raise exception 'invalid_answers'; end if;
  if c.kind='quiz_code' then
   select count(*) into q_count from quiz_questions q join answer_keys a on a.question_id=q.id
   where q.challenge_id=c.id and p_answers->'quiz'->>q.id::text=a.correct_index::text;
   if q_count<>2 or (select count(*) from quiz_questions where challenge_id=c.id)<>2 then raise exception 'invalid_answers'; end if;
  end if;
  if c.kind in ('quiz_code','code') then
   select * into code from stand_codes where challenge_id=c.id and code_hash=p_code_hash for update;
   if not found or code.expires_at<=now() or code.uses>=code.max_uses then raise exception 'invalid_code'; end if;
   update stand_codes set uses=uses+1 where id=code.id;
  end if;
 end if;
 insert into completions(participant_id,challenge_id,request_id,answers,source)
 values(p_participant,c.id,p_request,p_answers,case when p_actor is null then 'digital' else 'paper' end);
 select count(*) filter(where ch.is_base),count(*) filter(where not ch.is_base) into base_count,extra_count
 from completions co join challenges ch on ch.id=co.challenge_id where co.participant_id=p_participant;
 if base_count=5 then
  update participants set route_completed_at=coalesce(route_completed_at,now()) where id=p_participant;
  insert into tickets(participant_id,source,ordinal) values(p_participant,'route',1) on conflict do nothing;
  insert into tickets(participant_id,source,ordinal) select p_participant,'extra',n from generate_series(1,extra_count/2) n on conflict do nothing;
 end if;
 if p_actor is not null then
  insert into audit_log(actor_id,action,subject_id,details) values(p_actor,'paper_completion',p_participant,jsonb_build_object('challenge',c.id,'reference',p_paper_ref));
 end if;
 return jsonb_build_object('completed',true,'duplicate',false,'baseCount',base_count,'extraCount',extra_count);
end $$;

create function public.submit_survey(p_participant uuid,p_expectations text,p_satisfaction integer,p_interest text)
returns void language plpgsql set search_path=public,pg_temp as $$
declare v_bonus integer;
begin
 perform 1 from participants where id=p_participant and route_completed_at is not null for update;
 if not found then raise exception 'route_incomplete'; end if;
 insert into surveys(participant_id,expectations,satisfaction,interest) values(p_participant,p_expectations,p_satisfaction,p_interest)
 on conflict(participant_id) do nothing;
 if not found then return; end if;
 update participants set admission_completed_at=now() where id=p_participant and kind='applicant';
 select survey_bonus into v_bonus from settings where id=true;
 insert into tickets(participant_id,source,ordinal) select p_participant,'survey',n from generate_series(1,v_bonus) n on conflict do nothing;
end $$;

create function public.cast_vote(p_participant uuid,p_ticket uuid,p_project uuid)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
 perform 1 from participants where id=p_participant for update;
 if not exists(select 1 from settings where id and voting_open) then raise exception 'voting_closed'; end if;
 if not exists(select 1 from tickets where id=p_ticket and participant_id=p_participant) then raise exception 'ticket_missing'; end if;
 if not exists(select 1 from projects where id=p_project and active) then raise exception 'project_missing'; end if;
 if exists(select 1 from votes where ticket_id=p_ticket and project_id=p_project) then return; end if;
 if exists(select 1 from votes where ticket_id=p_ticket) then raise exception 'ticket_spent'; end if;
 insert into votes(ticket_id,project_id) values(p_ticket,p_project);
end $$;

-- El servidor genera un offset criptográficamente aleatorio; esta función
-- valida el conteo congelado y registra la elección dentro de la transacción.
create function public.draw_raffle(p_actor uuid,p_count bigint,p_offset bigint,p_snapshot timestamptz,p_request uuid)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_ticket uuid; v_id uuid; v_count bigint; v_role text;
begin
 select role into v_role from staff where user_id=p_actor;
 if v_role is null or v_role not in ('admin','raffle') then raise exception 'forbidden'; end if;
 perform 1 from settings where id and raffle_closed for update;
 if not found then raise exception 'raffle_not_closed'; end if;
 select id into v_id from raffles where request_id=p_request;
 if found then return v_id; end if;
 select count(*) into v_count from tickets where created_at<=p_snapshot;
 if p_count<>v_count or p_offset<0 or p_offset>=v_count then raise exception 'raffle_snapshot_changed'; end if;
 select id into v_ticket from tickets where created_at<=p_snapshot order by created_at,id offset p_offset limit 1;
 insert into raffles(ticket_id,eligible_count,selected_offset,snapshot_at,actor_id,request_id)
 values(v_ticket,v_count,p_offset,p_snapshot,p_actor,p_request) returning id into v_id;
 insert into audit_log(actor_id,action,subject_id) values(p_actor,'raffle_draw',v_id);
 return v_id;
end $$;

-- RLS sin políticas de lectura/escritura: acceso directo anónimo o autenticado denegado.
do $$ declare t text; begin
 foreach t in array array['settings','staff','buildings','projects','challenges','quiz_questions','answer_keys','saint_keys','participants','participant_sessions','challenge_assignments','stand_codes','completions','surveys','tickets','votes','agenda_events','push_subscriptions','raffles','audit_log','rate_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;
revoke execute on function public.take_rate_limit(text,integer,integer),public.activate_participant(text,text),public.complete_challenge(uuid,uuid,uuid,jsonb,text,uuid,text),public.submit_survey(uuid,text,integer,text),public.cast_vote(uuid,uuid,uuid),public.draw_raffle(uuid,bigint,bigint,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.take_rate_limit(text,integer,integer),public.activate_participant(text,text),public.complete_challenge(uuid,uuid,uuid,jsonb,text,uuid,text),public.submit_survey(uuid,text,integer,text),public.cast_vote(uuid,uuid,uuid),public.draw_raffle(uuid,bigint,bigint,timestamptz,uuid) to service_role;
commit;
