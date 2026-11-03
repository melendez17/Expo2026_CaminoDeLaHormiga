begin;
-- Token-only access for all application roles, selected for the event.
-- Existing Auth links are optional legacy identities, not a login requirement.
alter table camino.profiles drop constraint profiles_check;
alter table camino.profiles add constraint profiles_identity_role_check check(
 (role='admin' and (auth_user_id is null or auth_user_id=id) and public_token ~ '^[A-Z0-9]{4}$')
 or (role<>'admin' and auth_user_id is null and area is not null and public_token ~ '^[A-F0-9]{4}$')
);
create or replace function public.camino_login_token(p_token text,p_session_hash text,p_expires timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,camino as $$
declare person uuid;
begin
 if p_token is null or upper(btrim(p_token)) !~ '^[A-Z0-9]{4}$' then return null;end if;
 select id into person from camino.profiles where public_token=upper(btrim(p_token)) and active for share;
 if person is null then return null;end if;
 insert into camino.sessions(token_hash,participant_id,expires_at) values(p_session_hash,person,p_expires);
 insert into camino.audit(actor_id,action,target_id,metadata)
 values(person,'session.created',person::text,jsonb_build_object('method','token'));
 return person;
end $$;
create or replace function public.camino_actor(p_session_hash text default null,p_auth_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare p camino.profiles;s camino.progress;
begin
 if p_auth_id is not null then select * into p from camino.profiles where auth_user_id=p_auth_id and role='admin' and active;
 else select p1.* into p from camino.profiles p1 join camino.sessions s1 on s1.participant_id=p1.id where s1.token_hash=p_session_hash and s1.expires_at>now() and p1.active;end if;
 if p.id is null then return null;end if;
 select * into s from camino.progress where participant_id=p.id;
 return jsonb_build_object('user',camino.profile_json(p),'progress',s.snapshot,'version',s.version,'stats',s.stats);
end $$;
create or replace function public.camino_add_admin(p_id uuid,p_first text,p_surname1 text,p_surname2 text,p_email text,p_token text,p_actor uuid,p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare cached jsonb;p camino.profiles;result jsonb;
begin
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 perform 1 from camino.configuration where id for share;
 insert into camino.profiles(id,auth_user_id,first_name,first_surname,second_surname,email,role,public_token,consented_at) values(p_id,null,p_first,p_surname1,p_surname2,lower(btrim(p_email)),'admin',p_token,now()) returning * into p;
 result=camino.profile_json(p);update camino.requests set response=result where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id) values(p_actor,'admin.created',p.id::text,p_request);return result;
end $$;


create function public.camino_bootstrap_token_admin(p_profile jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,camino as $$
declare p camino.profiles;
begin
 lock table camino.profiles in exclusive mode;
 if exists(select 1 from camino.profiles where role='admin') then raise exception 'already_initialized';end if;
 insert into camino.profiles(id,first_name,first_surname,second_surname,email,role,public_token,consented_at)
 values((p_profile->>'id')::uuid,p_profile->>'firstName',p_profile->>'firstSurname',p_profile->>'secondSurname',lower(btrim(p_profile->>'email')),'admin',p_profile->>'token',now()) returning * into p;
 insert into camino.audit(actor_id,action,target_id) values(p.id,'admin.bootstrapped',p.id::text);
 return camino.profile_json(p);
end $$;
revoke all on function public.camino_bootstrap_token_admin(jsonb) from public,anon,authenticated;
grant execute on function public.camino_bootstrap_token_admin(jsonb) to service_role;
revoke all on function public.camino_login_token(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.camino_login_token(text,text,timestamptz) to service_role;
commit;
