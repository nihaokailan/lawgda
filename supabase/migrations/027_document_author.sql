-- Document authorship declared at upload: either the uploader ("I am the
-- author") or a name they type in. Printed under the Lawgda logo on the
-- signature page Lawgda appends to the PDF.

begin;

alter table public.documents
  add column if not exists author_name text;

commit;
