-- Run on the configured Supabase database. All fixtures and writes roll back.
begin;
select set_config('request.jwt.claims',json_build_object('sub',id,'role','authenticated')::text,true)
from auth.users where lower(email)='rohin.juneja@berkeley.edu' and email_confirmed_at is not null;
set local role authenticated;
do $$
<<mcp_diary_test>>
declare
 owner uuid=auth.uid(); entry_id uuid=gen_random_uuid(); mutation_id uuid=gen_random_uuid();
 entry jsonb; saved jsonb; replay jsonb; prior public.record_mutations; response jsonb;
begin
 if owner is null then raise exception 'A verified owner is required'; end if;
 entry=jsonb_build_object('id',entry_id,'date','2026-10-16','time','','meal','Breakfast','name','Rollback-only MCP meal',
  'kind','food','multiplier',1,'estimated',true,'batchId',null,'anchorIngredientId',null,'notes','',
  'ingredients',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'quantity',6,'unit','fl oz','food',
   jsonb_build_object('id',gen_random_uuid(),'name','Test milk','brand','','revision',1,'basis',jsonb_build_object('quantity',1,'unit','cup'),
    'sourceUrl','Test fixture','notes','','ingredientsText','',
    'nutrients','[{"key":"energy","label":"Energy","unit":"kcal","amount":130},{"key":"protein","label":"Protein","unit":"g","amount":8},{"key":"carbs","label":"Carbohydrate","unit":"g","amount":13},{"key":"fat","label":"Fat","unit":"g","amount":5},{"key":"vitamin_c","label":"Vitamin C","unit":"mg","amount":null}]'::jsonb))));
 saved=public.save_record(owner,'diary',entry_id::text,entry,0,mutation_id,repeat('a',64),false);
 if saved->>'ok'<>'true' or saved->'record'->>'version'<>'1' then raise exception 'Meal create failed'; end if;
 select * into prior from public.record_mutations where owner_id=owner and record_mutations.mutation_id=mcp_diary_test.mutation_id;
 if prior.result is distinct from saved or prior.fingerprint<>repeat('a',64) then raise exception 'Mutation acknowledgement unavailable'; end if;
 -- A source-hydrated retry has the same request hash even if a food has changed.
 replay=public.save_record(owner,'diary',entry_id::text,jsonb_set(entry,'{ingredients,0,food,revision}','2'),0,mutation_id,repeat('a',64),false);
 if replay is distinct from saved then raise exception 'Retry changed the saved snapshot'; end if;
 response=public.save_record(owner,'diary',entry_id::text,entry,0,mutation_id,repeat('b',64),false);
 if response->>'reason'<>'mutation_reused' then raise exception 'Changed request reused mutation ID'; end if;
 response=public.save_record(owner,'diary',entry_id::text,entry,0,gen_random_uuid(),repeat('c',64),false);
 if response->>'reason'<>'conflict' then raise exception 'Duplicate create overwrote meal'; end if;
 if (select count(*) from public.record_versions where owner_id=owner and collection='diary' and id=entry_id::text)<>1 then raise exception 'Retry added another version'; end if;
end;
$$;
rollback;
