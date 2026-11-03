begin;
-- Participant access by the short token, explicitly selected for the event.
-- This is a reusable bearer credential with limited entropy. Never permit admin access here.
create function public.camino_login_token(p_token text,p_session_hash text,p_expires timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,camino as $$
declare participant uuid;
begin
 if p_token is null or upper(btrim(p_token)) !~ '^[A-F0-9]{4}$' then return null;end if;
 select id into participant from camino.profiles
 where public_token=upper(btrim(p_token)) and active and role in ('visitor','admission') for share;
 if participant is null then return null;end if;
 insert into camino.sessions(token_hash,participant_id,expires_at) values(p_session_hash,participant,p_expires);
 insert into camino.audit(actor_id,action,target_id,metadata)
 values(participant,'session.created',participant::text,jsonb_build_object('method','token'));
 return participant;
end $$;
revoke all on function public.camino_login_token(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.camino_login_token(text,text,timestamptz) to service_role;
commit;
