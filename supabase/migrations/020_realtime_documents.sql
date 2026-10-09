-- Publishes document changes over Supabase Realtime so dashboards, case pages
-- and document pages update live when a status changes. Realtime applies the
-- existing documents RLS policies per subscriber, so no data is widened.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
     ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end;
$$;
