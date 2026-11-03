-- Compatible with Supabase safe-update checks. All questions have a non-null
-- challenge_id; replacing the catalog rebuilds their validated definitions.
-- Preserve the existing function owner, permissions, and transaction boundaries.
create or replace function camino.write_catalog(p_catalog jsonb) returns void language plpgsql set search_path=pg_catalog,camino as $$
declare item jsonb;q jsonb;n integer;
begin
 for item in select * from jsonb_array_elements(p_catalog->'projects') loop
 insert into camino.projects(id,name,category,specialty,level,building_id,active,description) values(item->>'id',item->>'name',item->>'category',item->>'specialty',item->>'level',item->>'buildingId',coalesce((item->>'active')::boolean,true),item->>'description')
 on conflict(id) do update set name=excluded.name,category=excluded.category,specialty=excluded.specialty,level=excluded.level,building_id=excluded.building_id,active=excluded.active,description=excluded.description;
 end loop;
 delete from camino.questions where challenge_id is not null;
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

notify pgrst, 'reload schema';
