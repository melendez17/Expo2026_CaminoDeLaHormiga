begin;
-- Production generation. Existing public tables are retained as legacy archives;
-- the current API uses only camino.* and service-only camino_* functions.
create schema if not exists camino;
revoke all on schema camino from public, anon, authenticated;
create table camino.areas(id text primary key);
insert into camino.areas values ('pasitos'),('school'),('third_cycle'),('Desarrollo Web'),('Ciberseguridad'),('Dibujo y Modelado de Edificaciones'),('Diseño Gráfico Multimedia'),('Electromecánica'),('Mecánica de Precisión');
create table camino.buildings(id text primary key,name text not null);
create table camino.configuration(
 id boolean primary key default true check(id),version bigint not null default 1,
 document jsonb not null check(jsonb_typeof(document)='object'),
 voting_open boolean not null default true,raffle_open boolean not null default true,
 initialized_at timestamptz not null default now()
);
create table camino.profiles(
 id uuid primary key default gen_random_uuid(),auth_user_id uuid unique references auth.users(id),
 first_name text not null check(length(btrim(first_name)) between 1 and 100),
 first_surname text not null check(length(btrim(first_surname)) between 1 and 100),
 second_surname text not null check(length(btrim(second_surname)) between 1 and 100),
 email text not null constraint profiles_email_unique unique check(email=lower(btrim(email)) and length(email) between 3 and 254 and position('@' in email)>1),
 role text not null check(role in ('admin','visitor','admission')),area text references camino.areas,
 public_token text not null constraint profiles_public_token_unique unique check(public_token ~ '^[A-Z0-9]{4}$'),
 active boolean not null default true,consented_at timestamptz,
 claim_hash text unique check(claim_hash is null or claim_hash ~ '^[a-f0-9]{64}$'),claim_expires_at timestamptz,
 version bigint not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((role='admin' and auth_user_id=id and public_token ~ '^ADM[A-Z0-9]$') or (role<>'admin' and auth_user_id is null and area is not null and public_token ~ '^[A-F0-9]{4}$'))
);
create index profiles_role_area on camino.profiles(role,area) where active;
create table camino.projects(
 id text primary key check(length(id) between 1 and 100),name text not null,
 category text not null check(category in ('pasitos','school','third_cycle','specialty')),
 specialty text not null,level text not null,building_id text not null references camino.buildings,
 active boolean not null default true,description text not null,
 check((category='pasitos' and level='preescolar') or (category='school' and level in ('1','2','3','4','5','6')) or (category='third_cycle' and level in ('7','8','9')) or (category='specialty' and level in ('10','11'))),
 check(category<>'specialty' or (specialty in ('Desarrollo Web','Ciberseguridad') and building_id='17') or (specialty='Electromecánica' and building_id='15') or (specialty='Dibujo y Modelado de Edificaciones' and building_id='16') or (specialty='Diseño Gráfico Multimedia' and building_id='18') or (specialty='Mecánica de Precisión' and building_id='19'))
);
create index projects_building on camino.projects(building_id,active);
create table camino.challenges(
 id text primary key,title text not null,description text not null,building_id text not null references camino.buildings,
 project_id text references camino.projects,kind text not null check(kind in ('freeform','quiz','code','saint')),
 is_base boolean not null default false,level smallint check(level in (10,11)),code text,saint_answer text,badge text,
 check(kind not in ('quiz','code') or code ~ '^[A-Z0-9]{4}$'),check(kind<>'quiz' or project_id is not null),
 check(kind<>'saint' or (project_id is null and not is_base))
);
create index challenges_project on camino.challenges(project_id);
create table camino.questions(
 challenge_id text not null references camino.challenges,id text not null,prompt text not null,
 options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6),
 correct_index smallint not null check(correct_index>=0),position smallint not null,
 primary key(challenge_id,id),check(correct_index<jsonb_array_length(options))
);
create table camino.agenda(
 id text primary key,title text not null,category text not null check(category in ('general','pastoral','radio')),
 day text not null,day_number smallint check(day_number between 1 and 31),starts_at time not null,ends_at time,
 building_id text not null references camino.buildings,description text not null,time_zone text not null default 'America/Costa_Rica',
 check(ends_at is null or ends_at>starts_at)
);
create index agenda_schedule on camino.agenda(day_number,starts_at);
create table camino.progress(
 participant_id uuid primary key references camino.profiles,version bigint not null default 0,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),stats jsonb not null default '{}',
 catalog_version bigint not null,updated_at timestamptz not null default now()
);
create table camino.assignments(
 participant_id uuid not null references camino.profiles,challenge_id text not null references camino.challenges,
 phase text not null check(phase in ('base','additional')),round integer not null check(round>=0),
 primary key(participant_id,challenge_id)
);
create table camino.assignment_changes(
 id uuid primary key,participant_id uuid not null references camino.profiles,actor_id uuid not null references camino.profiles,
 from_id text references camino.challenges,to_id text references camino.challenges,
 scope text not null check(scope in ('route','extra','visitor')),reason text not null check(length(reason) between 3 and 500),changed_at timestamptz not null,
 route_snapshot jsonb,check(from_id is not null or to_id is not null)
);
create index assignment_changes_participant on camino.assignment_changes(participant_id,changed_at);
create table camino.completions(
 participant_id uuid not null references camino.profiles,challenge_id text not null references camino.challenges,
 answers jsonb not null check(jsonb_typeof(answers)='object'),completed_at timestamptz not null,
 primary key(participant_id,challenge_id)
);
create table camino.attempts(
 id uuid primary key default gen_random_uuid(),participant_id uuid not null references camino.profiles,
 challenge_id text not null references camino.challenges,replacement_id text not null references camino.challenges,
 answers jsonb not null,attempted_at timestamptz not null,source text not null check(source in ('replacement','legacy')),
 unique(participant_id,challenge_id,attempted_at,source,replacement_id)
);
create index attempts_participant on camino.attempts(participant_id,attempted_at);
create table camino.tickets(
 id text primary key,participant_id uuid not null references camino.profiles,
 source text not null check(source in ('digital','manual')),serial integer not null check(serial>0),
 code text not null unique,issued_at timestamptz not null default now(),issued_by uuid references camino.profiles,
 unique(participant_id,source,serial),check(source<>'manual' or issued_by is not null)
);
create index tickets_participant on camino.tickets(participant_id,issued_at,id);
create table camino.votes(
 id uuid primary key default gen_random_uuid(),ticket_id text not null unique references camino.tickets,
 participant_id uuid not null references camino.profiles,project_id text not null references camino.projects,
 voted_at timestamptz not null default now()
);
create index votes_project on camino.votes(project_id);
create index votes_participant on camino.votes(participant_id);
create table camino.surveys(
 participant_id uuid primary key references camino.profiles,expectations text not null,
 interest text not null,satisfaction smallint not null check(satisfaction between 1 and 5),submitted_at timestamptz not null default now()
);
create table camino.sessions(
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),participant_id uuid not null references camino.profiles,
 created_at timestamptz not null default now(),expires_at timestamptz not null
);
create index sessions_expiry on camino.sessions(expires_at);
create table camino.email_codes(
 id uuid primary key,participant_id uuid not null references camino.profiles,code_hash text not null,
 expires_at timestamptz not null,attempts smallint not null default 0,used_at timestamptz,
 created_at timestamptz not null default now()
);
create table camino.mail_outbox(
 id uuid primary key default gen_random_uuid(),envelope text not null,status text not null default 'queued' check(status in ('queued','sending','sent','failed')),
 attempts smallint not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,
 expires_at timestamptz not null,created_at timestamptz not null default now(),sent_at timestamptz
);
create index mail_pending on camino.mail_outbox(status,available_at);
create table camino.requests(
 actor_id uuid not null,request_id uuid not null,payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 response jsonb,created_at timestamptz not null default now(),primary key(actor_id,request_id)
);
create table camino.rate_limits(key text primary key,hits integer not null,expires_at timestamptz not null);
create table camino.raffles(
 id uuid primary key default gen_random_uuid(),request_id uuid not null,actor_id uuid not null references camino.profiles,
 ticket_id text not null unique references camino.tickets,prize text not null,pool_size integer not null check(pool_size>0),
 created_at timestamptz not null default now(),unique(actor_id,request_id)
);
create table camino.audit(
 id bigint generated always as identity primary key,actor_id uuid references camino.profiles,
 action text not null,target_id text,request_id uuid,metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
create index audit_time on camino.audit(created_at);

-- Lock each idempotency key. Concurrent retries wait, then return the first result.
create function camino.begin_request(p_actor uuid,p_request uuid,p_hash text) returns jsonb language plpgsql set search_path=pg_catalog,camino as $$
declare r camino.requests;
begin
 insert into camino.requests(actor_id,request_id,payload_hash) values(p_actor,p_request,p_hash) on conflict do nothing;
 select * into r from camino.requests where actor_id=p_actor and request_id=p_request for update;
 if r.payload_hash<>p_hash then raise exception 'idempotency_conflict';end if;
 return r.response;
end $$;
create function camino.profile_json(p camino.profiles) returns jsonb language sql immutable set search_path=pg_catalog,camino as $$
 select jsonb_build_object('id',p.id,'firstName',p.first_name,'firstSurname',p.first_surname,'secondSurname',p.second_surname,'name',concat_ws(' ',p.first_name,p.first_surname,p.second_surname),'email',p.email,'role',p.role,'area',p.area,'token',p.public_token,'active',p.active,'version',p.version,'createdAt',p.created_at)
$$;
create function public.camino_catalog() returns jsonb language sql security definer set search_path=pg_catalog,camino as $$
 select jsonb_build_object('version',c.version,'catalog',c.document,'votingOpen',c.voting_open,'raffleOpen',c.raffle_open,'admins',coalesce((select jsonb_agg(camino.profile_json(p)) from camino.profiles p where p.role='admin'),'[]'::jsonb)) from camino.configuration c where c.id
$$;
create function public.camino_initialize(p_catalog jsonb,p_buildings jsonb) returns void language plpgsql security definer set search_path=pg_catalog,camino as $$
begin
 if exists(select 1 from camino.configuration) then raise exception 'already_initialized';end if;
 insert into camino.buildings select key,value from jsonb_each_text(p_buildings);
 insert into camino.configuration(id,document) values(true,p_catalog);
 perform camino.write_catalog(p_catalog);
end $$;

create function camino.write_catalog(p_catalog jsonb) returns void language plpgsql set search_path=pg_catalog,camino as $$
declare item jsonb;q jsonb;n integer;
begin
 for item in select * from jsonb_array_elements(p_catalog->'projects') loop
 insert into camino.projects(id,name,category,specialty,level,building_id,active,description) values(item->>'id',item->>'name',item->>'category',item->>'specialty',item->>'level',item->>'buildingId',coalesce((item->>'active')::boolean,true),item->>'description')
 on conflict(id) do update set name=excluded.name,category=excluded.category,specialty=excluded.specialty,level=excluded.level,building_id=excluded.building_id,active=excluded.active,description=excluded.description;
 end loop;
 delete from camino.questions;
 for item in select * from jsonb_array_elements(p_catalog->'challenges') loop
 insert into camino.challenges(id,title,description,building_id,project_id,kind,is_base,level,code,saint_answer,badge) values(item->>'id',item->>'title',item->>'description',item->>'buildingId',item->>'projectId',item->>'kind',(item->>'isBase')::boolean,(item->>'level')::smallint,item->>'code',item->>'answer',item->>'badge')
 on conflict(id) do update set title=excluded.title,description=excluded.description,building_id=excluded.building_id,project_id=excluded.project_id,kind=excluded.kind,is_base=excluded.is_base,level=excluded.level,code=excluded.code,saint_answer=excluded.saint_answer,badge=excluded.badge;
 n=0;for q in select * from jsonb_array_elements(coalesce(item->'questions','[]')) loop
 insert into camino.questions(challenge_id,id,prompt,options,correct_index,position) values(item->>'id',q->>'id',q->>'prompt',q->'options',(q->>'correctIndex')::smallint,n);n=n+1;
 end loop;
 end loop;
 for item in select * from jsonb_array_elements(p_catalog->'agenda') loop
 insert into camino.agenda(id,title,category,day,day_number,starts_at,ends_at,building_id,description) values(item->>'id',item->>'title',item->>'category',item->>'day',(item->>'dayNumber')::smallint,(item->>'time')::time,(item->>'endTime')::time,item->>'buildingId',item->>'description')
 on conflict(id) do update set title=excluded.title,category=excluded.category,day=excluded.day,day_number=excluded.day_number,starts_at=excluded.starts_at,ends_at=excluded.ends_at,building_id=excluded.building_id,description=excluded.description;
 end loop;
 delete from camino.agenda where id not in(select value->>'id' from jsonb_array_elements(p_catalog->'agenda'));
 delete from camino.challenges where id not in(select value->>'id' from jsonb_array_elements(p_catalog->'challenges'));
 delete from camino.projects where id not in(select value->>'id' from jsonb_array_elements(p_catalog->'projects'));
end $$;

create function public.camino_catalog_commit(p_expected bigint,p_catalog jsonb,p_actor uuid,p_request uuid,p_hash text,p_flags jsonb default '{}',p_progress_versions jsonb default '{}',p_profile_versions jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;v bigint;result jsonb;
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 select version into v from camino.configuration where id for update;if v<>p_expected then raise exception 'revision_conflict';end if;
 if exists(select 1 from camino.progress where not(p_progress_versions ? participant_id::text) or (p_progress_versions->>participant_id::text)::bigint<>version) or exists(select 1 from camino.profiles where role<>'admin' and (not(p_profile_versions ? id::text) or (p_profile_versions->>id::text)::bigint<>version)) then raise exception 'revision_conflict';end if;
 if p_catalog->'settings'->>'dataVersion'<>(select document->'settings'->>'dataVersion' from camino.configuration where id) then raise exception 'invalid_state';end if;
 perform camino.write_catalog(p_catalog);
 update camino.configuration set document=p_catalog,version=version+1,voting_open=coalesce((p_flags->>'votingOpen')::boolean,voting_open),raffle_open=coalesce((p_flags->>'raffleOpen')::boolean,raffle_open) where id returning version into v;
 result=jsonb_build_object('version',v);
 update camino.requests set response=result where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,request_id,metadata) values(p_actor,'catalog.updated',p_request,jsonb_build_object('version',v));return result;
end $$;
create function public.camino_seed_catalog(p_catalog jsonb) returns void language plpgsql security definer set search_path=pg_catalog,camino as $$
begin
 if exists(select 1 from camino.progress) then raise exception 'forbidden';end if;
 perform 1 from camino.configuration where id for update;
 perform camino.write_catalog(p_catalog);update camino.configuration set document=p_catalog where id;
end $$;
create function public.camino_bootstrap_admin(p_id uuid,p_first text,p_surname1 text,p_surname2 text,p_email text) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare p camino.profiles;
begin
 lock table camino.profiles in exclusive mode;
 if exists(select 1 from camino.profiles where role='admin') then raise exception 'already_initialized';end if;
 insert into camino.profiles(id,auth_user_id,first_name,first_surname,second_surname,email,role,public_token,consented_at) values(p_id,p_id,p_first,p_surname1,p_surname2,lower(btrim(p_email)),'admin','ADM1',now()) returning * into p;
 insert into camino.audit(actor_id,action,target_id) values(p.id,'admin.bootstrapped',p.id::text);return camino.profile_json(p);
end $$;
create function public.camino_actor(p_session_hash text default null,p_auth_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare p camino.profiles;s camino.progress;
begin
 if p_auth_id is not null then select * into p from camino.profiles where auth_user_id=p_auth_id and role='admin' and active;
 else select p1.* into p from camino.profiles p1 join camino.sessions s1 on s1.participant_id=p1.id where s1.token_hash=p_session_hash and s1.expires_at>now() and p1.active and p1.role<>'admin';end if;
 if p.id is null then return null;end if;
 select * into s from camino.progress where participant_id=p.id;
 return jsonb_build_object('user',camino.profile_json(p),'progress',s.snapshot,'version',s.version,'stats',s.stats);
end $$;
create function public.camino_participant(p_id uuid) returns jsonb language sql security definer set search_path=pg_catalog,camino as $$
 select jsonb_build_object('user',camino.profile_json(p),'progress',s.snapshot,'version',s.version,'stats',s.stats) from camino.profiles p left join camino.progress s on s.participant_id=p.id where p.id=p_id and p.role<>'admin'
$$;
create function public.camino_request(p_actor uuid,p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare r camino.requests;
begin
 select * into r from camino.requests where actor_id=p_actor and request_id=p_request;
 if r.actor_id is not null and r.payload_hash<>p_hash then raise exception 'idempotency_conflict';end if;return r.response;
end $$;
create function public.camino_register(p_profile jsonb,p_progress jsonb,p_claim_hash text,p_expires timestamptz,p_actor uuid,p_request uuid,p_hash text,p_response jsonb,p_mail_envelope text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;p camino.profiles;v bigint;
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 select version into v from camino.configuration where id for share;
 insert into camino.profiles(id,first_name,first_surname,second_surname,email,role,area,public_token,consented_at,claim_hash,claim_expires_at) values((p_profile->>'id')::uuid,p_profile->>'firstName',p_profile->>'firstSurname',p_profile->>'secondSurname',lower(btrim(p_profile->>'email')),p_profile->>'role',p_profile->>'area',p_profile->>'token',now(),p_claim_hash,p_expires) returning * into p;
 if p_progress->>'userId'<>p.id::text then raise exception 'invalid_state';end if;
 insert into camino.progress(participant_id,snapshot,catalog_version) values(p.id,p_progress,v);
 if p_mail_envelope is not null then insert into camino.mail_outbox(envelope,expires_at) values(p_mail_envelope,p_expires);end if;
 update camino.requests set response=p_response where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id) values(p_actor,'user.created',p.id::text,p_request);return p_response;
end $$;

create function public.camino_commit(p_id uuid,p_expected bigint,p_catalog_version bigint,p_progress jsonb,p_projection jsonb,p_actor uuid,p_request uuid,p_hash text,p_result jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;old camino.progress;person camino.profiles;item jsonb;old_count integer;new_count integer;n integer;t text;code text;v bigint;result jsonb;is_admin boolean;digital_expected integer;base_count integer;base_target integer;completed_count integer;cfg jsonb;
begin
 select exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) into is_admin;
 if not is_admin and p_actor<>p_id then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 select version into v from camino.configuration where id for share;if v<>p_catalog_version then raise exception 'revision_conflict';end if;
 select * into person from camino.profiles where id=p_id and active and role<>'admin' for share;if person.id is null then raise exception 'not_found';end if;
 select * into old from camino.progress where participant_id=p_id for update;if old.version<>p_expected then raise exception 'revision_conflict';end if;
 if p_progress->>'userId'<>p_id::text or p_progress->>'dataVersion'<>(select document->'settings'->>'dataVersion' from camino.configuration where id) then raise exception 'invalid_state';end if;
 if jsonb_array_length(p_progress->'completed')<jsonb_array_length(old.snapshot->'completed') or jsonb_array_length(p_progress->'manualTickets')<jsonb_array_length(old.snapshot->'manualTickets') or jsonb_array_length(p_progress->'votes')<jsonb_array_length(old.snapshot->'votes') then raise exception 'invalid_state';end if;
 if not ((p_progress->'completed') @> (old.snapshot->'completed')) or not ((p_progress->'manualTickets') @> (old.snapshot->'manualTickets')) then raise exception 'invalid_state';end if;
 if old.snapshot->'survey'<>'null'::jsonb and p_progress->'survey'<>old.snapshot->'survey' then raise exception 'invalid_state';end if;
 old_count=jsonb_array_length(old.snapshot->'votes');new_count=jsonb_array_length(p_progress->'votes');
 for n in 0..old_count-1 loop if p_progress->'votes'->n<>old.snapshot->'votes'->n then raise exception 'invalid_state';end if;end loop;
 if new_count>old_count and not(select voting_open from camino.configuration where id) then raise exception 'voting_closed';end if;
 if jsonb_array_length(p_progress->'manualTickets')>jsonb_array_length(old.snapshot->'manualTickets') and not is_admin then raise exception 'forbidden';end if;
 select document->'settings' into cfg from camino.configuration where id;
 completed_count=jsonb_array_length(p_progress->'completed');
 if person.role='visitor' then digital_expected=completed_count/2+case when completed_count>=2 and p_progress->'survey'<>'null'::jsonb then (cfg->>'surveyBonus')::integer else 0 end;
 else
 base_target=jsonb_array_length(p_progress->'routeIds');select count(*) into base_count from jsonb_array_elements(p_progress->'completed') c where p_progress->'routeIds' ? (c->>'challengeId');
 digital_expected=case when base_target>0 and base_count=base_target then (cfg->>'baseReward')::integer+(completed_count-base_count)/(cfg->>'extraEvery')::integer+case when p_progress->'survey'<>'null'::jsonb then (cfg->>'surveyBonus')::integer else 0 end else 0 end;
 end if;
 if (p_projection->'stats'->>'digitalTickets')::integer<>digital_expected then raise exception 'invalid_state';end if;

 delete from camino.assignments where participant_id=p_id;
 for item in select * from jsonb_array_elements(p_projection->'assignments') loop insert into camino.assignments values(p_id,item->>'challengeId',item->>'phase',(item->>'round')::integer);end loop;
 for item in select * from jsonb_array_elements(p_progress->'assignmentEdits') loop
 insert into camino.assignment_changes(id,participant_id,actor_id,from_id,to_id,scope,reason,changed_at,route_snapshot) values((item->>'id')::uuid,p_id,(item->>'actorId')::uuid,item->>'fromId',item->>'toId',item->>'scope',item->>'reason',(item->>'at')::timestamptz,item->'routeIds') on conflict(id) do nothing;
 end loop;
 for item in select * from jsonb_array_elements(p_progress->'completed') loop
 insert into camino.completions values(p_id,item->>'challengeId',item->'answers',(item->>'at')::timestamptz) on conflict(participant_id,challenge_id) do nothing;
 end loop;
 for item in select * from jsonb_array_elements(p_progress->'failedExtras') loop
 insert into camino.attempts(participant_id,challenge_id,replacement_id,answers,attempted_at,source) values(p_id,item->>'challengeId',item->>'replacementId',item->'answers',(item->>'at')::timestamptz,'replacement') on conflict do nothing;
 end loop;
 for item in select * from jsonb_array_elements(p_progress->'failedAnswers') loop
 insert into camino.attempts(participant_id,challenge_id,replacement_id,answers,attempted_at,source) values(p_id,item->>'challengeId',item->>'extraId',item->'answers',(item->>'at')::timestamptz,'legacy') on conflict do nothing;
 end loop;
 for n in 1..coalesce((p_projection->'stats'->>'digitalTickets')::integer,0) loop
 code='D-'||person.public_token||'-'||lpad(n::text,greatest(3,length(n::text)),'0');
 insert into camino.tickets(id,participant_id,source,serial,code) values('digital:'||p_id::text||':'||n,p_id,'digital',n,code) on conflict(id) do nothing;
 end loop;
 n=0;for item in select * from jsonb_array_elements(p_progress->'manualTickets') loop
 n=n+1;code='M-'||person.public_token||'-'||lpad(n::text,greatest(3,length(n::text)),'0');
 if not exists(select 1 from camino.profiles where id=(item->>'actorId')::uuid and role='admin') then raise exception 'forbidden';end if;
 insert into camino.tickets(id,participant_id,source,serial,code,issued_at,issued_by) values('manual:'||(item->>'id'),p_id,'manual',n,code,(item->>'at')::timestamptz,(item->>'actorId')::uuid) on conflict(id) do nothing;
 end loop;
 for n in old_count..new_count-1 loop
 item=p_progress->'votes'->n;
 select tk.id into t from camino.tickets tk where tk.participant_id=p_id and not exists(select 1 from camino.votes vo where vo.ticket_id=tk.id) order by tk.issued_at,tk.id limit 1 for update;
 if t is null then raise exception 'invalid_state';end if;
 insert into camino.votes(ticket_id,participant_id,project_id,voted_at) values(t,p_id,item->>'projectId',(item->>'at')::timestamptz);
 end loop;
 if (p_projection->'stats'->>'tickets')::integer<>(select count(*) from camino.tickets where participant_id=p_id) or (p_projection->'stats'->>'votesAvailable')::integer<>((select count(*) from camino.tickets where participant_id=p_id)-(select count(*) from camino.votes where participant_id=p_id)) then raise exception 'invalid_state';end if;
 if p_progress->'survey'<>'null'::jsonb then insert into camino.surveys(participant_id,expectations,interest,satisfaction) values(p_id,p_progress->'survey'->>'expectations',p_progress->'survey'->>'interest',(p_progress->'survey'->>'satisfaction')::smallint) on conflict(participant_id) do nothing;end if;
 update camino.progress set snapshot=p_progress,stats=p_projection->'stats',version=version+1,catalog_version=p_catalog_version,updated_at=now() where participant_id=p_id returning version into v;
 result=jsonb_build_object('version',v,'result',p_result);
 update camino.requests set response=result where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id,metadata) values(p_actor,'journey.updated',p_id::text,p_request,jsonb_build_object('version',v,'operation',p_result->>'operation'));return result;
end $$;

create function public.camino_update_profile(p_id uuid,p_expected bigint,p_profile jsonb,p_progress jsonb,p_actor uuid,p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;person camino.profiles;result jsonb;
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 perform 1 from camino.configuration where id for share;
 select * into person from camino.profiles where id=p_id and role<>'admin' for update;if person.id is null then raise exception 'not_found';end if;if person.version<>p_expected then raise exception 'revision_conflict';end if;
 perform 1 from camino.progress where participant_id=p_id and snapshot=p_progress for update;if not found then raise exception 'revision_conflict';end if;
 if person.email<>lower(btrim(p_profile->>'email')) or not(p_profile->>'active')::boolean then delete from camino.sessions where participant_id=p_id;update camino.email_codes set used_at=now() where participant_id=p_id and used_at is null;update camino.profiles set claim_hash=null,claim_expires_at=null where id=p_id;end if;
 update camino.profiles set first_name=p_profile->>'firstName',first_surname=p_profile->>'firstSurname',second_surname=p_profile->>'secondSurname',email=lower(btrim(p_profile->>'email')),role=p_profile->>'role',area=p_profile->>'area',active=(p_profile->>'active')::boolean,version=version+1,updated_at=now() where id=p_id returning * into person;
 if not person.active or person.email<>(p_profile->>'email') then delete from camino.sessions where participant_id=p_id;end if;
 result=camino.profile_json(person);update camino.requests set response=result where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id) values(p_actor,'user.updated',p_id::text,p_request);return result;
end $$;

create function public.camino_rotate_credential(p_id uuid,p_claim_hash text,p_expires timestamptz,p_actor uuid,p_request uuid,p_hash text,p_response jsonb,p_reason text default 'Reemisión solicitada') returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 update camino.profiles set claim_hash=p_claim_hash,claim_expires_at=p_expires where id=p_id and role<>'admin' and active;if not found then raise exception 'not_found';end if;
 delete from camino.sessions where participant_id=p_id;update camino.email_codes set used_at=now() where participant_id=p_id and used_at is null;
 update camino.requests set response=p_response where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id,metadata) values(p_actor,'credential.rotated',p_id::text,p_request,jsonb_build_object('reason',p_reason));return p_response;
end $$;
create function public.camino_activate(p_claim_hash text,p_session_hash text,p_expires timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,camino as $$
declare participant uuid;
begin
 update camino.profiles set claim_hash=null,claim_expires_at=null where claim_hash=p_claim_hash and claim_expires_at>now() and active and role<>'admin' returning id into participant;
 if participant is null then return null;end if;
 insert into camino.sessions(token_hash,participant_id,expires_at) values(p_session_hash,participant,p_expires);return participant;
end $$;
create function public.camino_logout(p_session_hash text) returns void language sql security definer set search_path=pg_catalog,camino as $$delete from camino.sessions where token_hash=p_session_hash$$;
create function public.camino_rate(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path=pg_catalog,camino as $$
declare hits integer;
begin
 insert into camino.rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds)) on conflict(key) do update set hits=case when camino.rate_limits.expires_at<=now() then 1 else camino.rate_limits.hits+1 end,expires_at=case when camino.rate_limits.expires_at<=now() then excluded.expires_at else camino.rate_limits.expires_at end returning camino.rate_limits.hits into hits;return hits<=p_limit;
end $$;
create function public.camino_queue_email(p_id uuid,p_email text,p_token text,p_code_hash text,p_envelope text,p_expires timestamptz) returns boolean language plpgsql security definer set search_path=pg_catalog,camino as $$
declare participant uuid;
begin
 select id into participant from camino.profiles where email=lower(btrim(p_email)) and public_token=p_token and active and role<>'admin' for update;if participant is null then return false;end if;
 update camino.email_codes set used_at=now() where participant_id=participant and used_at is null;
 insert into camino.email_codes(id,participant_id,code_hash,expires_at) values(p_id,participant,p_code_hash,p_expires);
 insert into camino.mail_outbox(envelope,expires_at) values(p_envelope,p_expires);return true;
end $$;
create function public.camino_verify_email(p_id uuid,p_code_hash text,p_session_hash text,p_expires timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,camino as $$
declare challenge camino.email_codes;
begin
 perform 1 from camino.profiles p join camino.email_codes c on c.participant_id=p.id where c.id=p_id and p.active for update of p;
 if not found then return null;end if;
 select * into challenge from camino.email_codes where id=p_id for update;
 if challenge.id is null or challenge.used_at is not null or challenge.expires_at<=now() or challenge.attempts>=5 then return null;end if;
 update camino.email_codes set attempts=attempts+1 where id=p_id;
 if challenge.code_hash<>p_code_hash or not exists(select 1 from camino.profiles where id=challenge.participant_id and active) then return null;end if;
 update camino.email_codes set used_at=now() where id=p_id;update camino.profiles set claim_hash=null,claim_expires_at=null where id=challenge.participant_id;insert into camino.sessions(token_hash,participant_id,expires_at) values(p_session_hash,challenge.participant_id,p_expires);return challenge.participant_id;
end $$;

create function public.camino_admin_list(p_kind text,p_offset integer default 0,p_limit integer default 50,p_search text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare result jsonb;
begin
 if p_limit<1 or p_limit>1000 or p_offset<0 then raise exception 'invalid_state';end if;
 if p_kind='users' then
 select jsonb_build_object('total',(select count(*) from camino.profiles where role<>'admin' and (first_name||' '||first_surname||' '||second_surname||' '||email||' '||public_token) ilike '%'||p_search||'%'),'items',coalesce(jsonb_agg(row),'[]')) into result from(select camino.profile_json(p)||jsonb_build_object('progress',s.snapshot,'progressVersion',s.version,'stats',s.stats) as row from camino.profiles p join camino.progress s on s.participant_id=p.id where p.role<>'admin' and (p.first_name||' '||p.first_surname||' '||p.second_surname||' '||p.email||' '||p.public_token) ilike '%'||p_search||'%' order by p.created_at,p.id offset p_offset limit p_limit) q;
 elsif p_kind='tickets' then
 select jsonb_build_object('total',(select count(*) from camino.tickets t join camino.profiles p on p.id=t.participant_id where (p.first_name||' '||p.first_surname||' '||p.public_token||' '||t.code) ilike '%'||p_search||'%'),'items',coalesce(jsonb_agg(row),'[]')) into result from(select to_jsonb(t)||jsonb_build_object('name',concat_ws(' ',p.first_name,p.first_surname,p.second_surname),'token',p.public_token,'winner',exists(select 1 from camino.raffles r where r.ticket_id=t.id),'spent',exists(select 1 from camino.votes v where v.ticket_id=t.id)) as row from camino.tickets t join camino.profiles p on p.id=t.participant_id where (p.first_name||' '||p.first_surname||' '||p.public_token||' '||t.code) ilike '%'||p_search||'%' order by t.issued_at,t.id offset p_offset limit p_limit) q;
 elsif p_kind='raffles' then
 select jsonb_build_object('total',(select count(*) from camino.raffles),'items',coalesce(jsonb_agg(row),'[]')) into result from(select to_jsonb(r)||jsonb_build_object('ticketCode',t.code,'source',t.source,'winnerId',t.participant_id,'winnerName',concat_ws(' ',p.first_name,p.first_surname,p.second_surname),'email',p.email) as row from camino.raffles r join camino.tickets t on t.id=r.ticket_id join camino.profiles p on p.id=t.participant_id order by r.created_at desc offset p_offset limit p_limit) q;
 elsif p_kind='audit' then
 select jsonb_build_object('items',coalesce(jsonb_agg(row),'[]')) into result from(select to_jsonb(a) as row from camino.audit a order by id desc offset p_offset limit p_limit) q;
 else raise exception 'invalid_state';end if;return result;
end $$;
create function public.camino_metrics() returns jsonb language sql security definer set search_path=pg_catalog,camino as $$
 select jsonb_build_object('participants',(select count(*) from camino.profiles where role<>'admin'),'started',(select count(*) from camino.progress where snapshot->>'startedAt' is not null),'completed',(select count(*) from camino.progress where (stats->>'routeComplete')::boolean),'completions',(select count(*) from camino.completions),'tickets',(select count(*) from camino.tickets),'votes',(select count(*) from camino.votes),'availableVotes',(select count(*) from camino.tickets)-(select count(*) from camino.votes),'attempts',(select count(*) from camino.attempts),'surveys',(select count(*) from camino.surveys))
$$;
create function public.camino_leaderboard(p_offset integer default 0,p_limit integer default 100) returns jsonb language sql security definer set search_path=pg_catalog,camino as $$
 with counts as(select p.id,p.name,p.specialty,p.category,p.level,p.building_id,count(v.id)::integer votes from camino.projects p left join camino.votes v on v.project_id=p.id group by p.id),ranked as(select *,case when votes>0 then rank()over(order by votes desc) end as rank from counts)
 select jsonb_build_object('total',(select count(*) from counts),'votes',(select count(*) from camino.votes),'items',coalesce((select jsonb_agg(to_jsonb(q)) from(select * from ranked order by votes desc,name,id offset greatest(0,p_offset) limit least(100,greatest(1,p_limit)))q),'[]'))
$$;
create function public.camino_raffle_count() returns integer language sql security definer set search_path=pg_catalog,camino as $$select count(*)::integer from camino.tickets t join camino.profiles p on p.id=t.participant_id where p.active and not exists(select 1 from camino.raffles r where r.ticket_id=t.id)$$;
create function public.camino_draw(p_actor uuid,p_request uuid,p_hash text,p_expected integer,p_offset integer,p_prize text) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;ticket camino.tickets;count_now integer;draw_id uuid;result jsonb;
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 perform 1 from camino.configuration where id for update;
 if not(select raffle_open from camino.configuration where id) then raise exception 'raffle_closed';end if;
 lock table camino.tickets in share mode;
 count_now=public.camino_raffle_count();if count_now=0 then raise exception 'no_tickets';end if;
 if count_now<>p_expected or p_offset<0 or p_offset>=count_now then raise exception 'revision_conflict';end if;
 select t.* into ticket from camino.tickets t join camino.profiles p on p.id=t.participant_id where p.active and not exists(select 1 from camino.raffles r where r.ticket_id=t.id) order by t.id offset p_offset limit 1;
 insert into camino.raffles(request_id,actor_id,ticket_id,prize,pool_size) values(p_request,p_actor,ticket.id,p_prize,count_now) returning id into draw_id;
 result=jsonb_build_object('id',draw_id,'ticketId',ticket.id,'ticketCode',ticket.code,'source',ticket.source,'winnerId',ticket.participant_id,'winnerName',(select concat_ws(' ',first_name,first_surname,second_surname) from camino.profiles where id=ticket.participant_id),'prize',p_prize,'poolSize',count_now,'at',now(),'actorId',p_actor);
 update camino.requests set response=result where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id,metadata) values(p_actor,'raffle.drawn',draw_id::text,p_request,jsonb_build_object('poolSize',count_now));return result;
end $$;
create function public.camino_mail_claim(p_limit integer default 20) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare result jsonb;
begin
 with selected as(select id from camino.mail_outbox where expires_at>now() and attempts<5 and available_at<=now() and (status='queued' or(status='sending' and lease_until<now())) order by created_at for update skip locked limit least(20,greatest(1,p_limit))),updated as(update camino.mail_outbox m set status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' from selected s where m.id=s.id returning m.id,m.envelope) select coalesce(jsonb_agg(to_jsonb(updated)),'[]') into result from updated;return result;
end $$;
create function public.camino_mail_complete(p_id uuid,p_success boolean) returns void language sql security definer set search_path=pg_catalog,camino as $$update camino.mail_outbox set status=case when p_success then 'sent' when attempts>=5 then 'failed' else 'queued' end,sent_at=case when p_success then now() else null end,available_at=now()+interval '1 minute',lease_until=null where id=p_id and status='sending'$$;
create function public.camino_cleanup() returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare sessions_removed integer;
begin
 delete from camino.sessions where expires_at<now();get diagnostics sessions_removed=row_count;
 delete from camino.email_codes where expires_at<now()-interval '1 day';delete from camino.rate_limits where expires_at<now()-interval '5 minutes';
 delete from camino.requests where created_at<now()-interval '7 days';delete from camino.mail_outbox where expires_at<now()-interval '7 days';
 return jsonb_build_object('expiredSessions',sessions_removed);
end $$;

create function public.camino_profile_lookup(p_email text default null,p_token text default null) returns jsonb language sql security definer set search_path=pg_catalog,camino as $$select camino.profile_json(p) from camino.profiles p where (p_email is not null and p.email=lower(btrim(p_email))) or (p_token is not null and p.public_token=p_token) limit 1$$;
create function public.camino_add_admin(p_id uuid,p_first text,p_surname1 text,p_surname2 text,p_email text,p_token text,p_actor uuid,p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;p camino.profiles;result jsonb;
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 perform 1 from camino.configuration where id for share;
 insert into camino.profiles(id,auth_user_id,first_name,first_surname,second_surname,email,role,public_token,consented_at) values(p_id,p_id,p_first,p_surname1,p_surname2,lower(btrim(p_email)),'admin',p_token,now()) returning * into p;
 result=camino.profile_json(p);update camino.requests set response=result where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id) values(p_actor,'admin.invited',p.id::text,p_request);return result;
end $$;

create function public.camino_audit_read(p_actor uuid,p_action text,p_target text,p_metadata jsonb) returns void language plpgsql security definer set search_path=pg_catalog,camino as $$
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) or p_action not in ('export.generated','participant.read') then raise exception 'forbidden';end if;
 insert into camino.audit(actor_id,action,target_id,metadata) values(p_actor,p_action,p_target,p_metadata);
end $$;

-- No browser role can read or write personal information or execute commands.
do $$declare t record;f record;begin
 for t in select tablename from pg_tables where schemaname='camino' loop execute format('alter table camino.%I enable row level security',t.tablename);execute format('alter table camino.%I force row level security',t.tablename);end loop;
 revoke all on all tables in schema camino from public,anon,authenticated;
 revoke all on all sequences in schema camino from public,anon,authenticated;
 revoke all on all functions in schema camino from public,anon,authenticated;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'camino_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
alter default privileges in schema camino revoke all on tables from public,anon,authenticated;
alter default privileges in schema camino revoke all on functions from public,anon,authenticated;
commit;
