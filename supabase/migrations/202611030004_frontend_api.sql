begin;
-- Server-paged administration; full snapshots are stripped by the HTTP handler.
create or replace function public.camino_admin_users(p_offset integer default 0,p_limit integer default 50,p_search text default '',p_status text default '',p_sort text default 'name')
returns jsonb language sql security definer set search_path=pg_catalog,camino as $$
 with users as(
 select camino.profile_json(p) profile,s.snapshot,s.version progress_version,s.stats,
 p.first_name||' '||p.first_surname||' '||p.second_surname||' '||p.email||' '||p.public_token search_text,
 case when coalesce((s.stats->>'routeComplete')::boolean,false) then 'Completado' when s.snapshot->>'startedAt' is not null then 'En proceso' else 'Sin activar' end state
 from camino.profiles p join camino.progress s on s.participant_id=p.id where p.role<>'admin'
 ),matching as(select * from users where search_text ilike '%'||p_search||'%' and (p_status='' or state=p_status)),page as(
 select * from matching order by
 case when p_sort='tickets' then coalesce((stats->>'tickets')::integer,0) end desc,
 case when p_sort='progress' then coalesce((stats->>'base')::integer,0) end desc,
 profile->>'name',profile->>'id' offset greatest(0,p_offset) limit least(100,greatest(1,p_limit))
 )
 select jsonb_build_object('total',(select count(*) from matching),'items',coalesce((select jsonb_agg(profile||jsonb_build_object('progress',snapshot,'progressVersion',progress_version,'stats',stats)) from page),'[]'))
$$;
revoke all on function public.camino_admin_users(integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.camino_admin_users(integer,integer,text,text,text) to service_role;

create or replace function public.camino_update_staff(p_id uuid,p_expected bigint,p_patch jsonb,p_actor uuid,p_request uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,camino as $$
declare person camino.profiles;result jsonb;cached jsonb;
begin
 perform 1 from camino.configuration where id for update;
 if not exists(select 1 from camino.profiles where id=p_actor and role='admin' and active) then raise exception 'forbidden';end if;
 cached=camino.begin_request(p_actor,p_request,p_hash);if cached is not null then return cached;end if;
 select * into person from camino.profiles where id=p_id and role='admin' for update;
 if person.id is null then raise exception 'not_found';end if;
 if person.version<>p_expected then raise exception 'revision_conflict';end if;
 if p_id=p_actor and coalesce((p_patch->>'active')::boolean,true)=false then raise exception 'forbidden';end if;
 update camino.profiles p set first_name=coalesce(p_patch->>'firstName',first_name),first_surname=coalesce(p_patch->>'firstSurname',first_surname),second_surname=coalesce(p_patch->>'secondSurname',second_surname),email=lower(btrim(coalesce(p_patch->>'email',email))),active=coalesce((p_patch->>'active')::boolean,active),version=version+1,updated_at=now() where id=p_id returning camino.profile_json(p) into result;
 if coalesce((p_patch->>'active')::boolean,true)=false or p_patch ? 'email' and lower(btrim(p_patch->>'email'))<>person.email then
 delete from camino.sessions where participant_id=p_id;end if;
 update camino.requests set response=result where actor_id=p_actor and request_id=p_request;
 insert into camino.audit(actor_id,action,target_id,request_id) values(p_actor,'admin.updated',p_id::text,p_request);
 return result;
end $$;
revoke all on function public.camino_update_staff(uuid,bigint,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.camino_update_staff(uuid,bigint,jsonb,uuid,uuid,text) to service_role;

create index if not exists audit_actor_recent on camino.audit(actor_id,id desc);
create or replace function public.camino_last_created(p_actor uuid) returns jsonb language sql security definer set search_path=pg_catalog,camino as $$
 select camino.profile_json(p) from camino.audit a join camino.profiles p on p.id::text=a.target_id
 where a.actor_id=p_actor and a.action in ('user.created','admin.created') order by a.id desc limit 1
$$;
revoke all on function public.camino_last_created(uuid) from public,anon,authenticated;
grant execute on function public.camino_last_created(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
