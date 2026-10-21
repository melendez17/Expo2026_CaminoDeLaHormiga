begin;
create function public.register_participant(p_kind text,p_identity text,p_name text,p_email text,p_phone text,p_token_hash text,p_actor uuid)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if not exists(select 1 from staff where user_id=p_actor and role in ('admin','registrar')) then raise exception 'paper_forbidden'; end if;
 if (select count(*) from challenges where active and is_base)<>5 then raise exception 'route_not_configured'; end if;
 insert into participants(kind,identity_number,name,email,phone,token_hash,created_by,consent_at)
 values(p_kind,p_identity,p_name,p_email,p_phone,p_token_hash,p_actor,now()) returning id into v_id;
 insert into challenge_assignments select v_id,id from challenges where active and is_base;
 insert into challenge_assignments select v_id,id from challenges where active and not is_base and kind<>'saint';
 insert into challenge_assignments select v_id,id from challenges where active and not is_base and kind='saint' order by random() limit 1;
 insert into audit_log(actor_id,action,subject_id) values(p_actor,'registration',v_id);
 return v_id;
end $$;
create function public.admin_metrics() returns jsonb language sql set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'registered',count(*),
 'inactive',count(*) filter(where activated_at is null and route_completed_at is null),
 'inProgress',count(*) filter(where activated_at is not null and route_completed_at is null),
 'completed',count(*) filter(where route_completed_at is not null),
 'admissionCompleted',count(*) filter(where admission_completed_at is not null),
 'tickets',(select count(*) from tickets),'votes',(select count(*) from votes)) from participants;
$$;
revoke execute on function public.register_participant(text,text,text,text,text,text,uuid),public.admin_metrics() from public,anon,authenticated;
grant execute on function public.register_participant(text,text,text,text,text,text,uuid),public.admin_metrics() to service_role;
commit;
