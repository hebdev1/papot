-- Verification papers are identity and registration documents, far more
-- sensitive than listing photos. They get their own private bucket so that
-- opening up listing photos later can never expose an ID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-documents', 'partner-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Upload only. No select policy: nobody reads these through the anon key.
create policy partner_documents_anon_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'partner-documents');

create type public.partner_document_status as enum
  ('uploaded', 'under_review', 'approved', 'rejected');

-- Catalog generated from StepVerification's own lists, so the required set
-- lives in one place and the RPC can enforce it.
create table public.partner_document_types (
  code       text primary key,
  label_fr   text not null,
  applies_to public.partner_type[] not null check (cardinality(applies_to) > 0),
  required   boolean not null default false,
  position   smallint not null default 0
);

insert into public.partner_document_types (code, label_fr, applies_to, required, position) values
  ('piece_d_identite_passeport', 'Pièce d''identité / Passeport', array['car','guesthouse','hotel','restaurant']::public.partner_type[], true, 1),
  ('registre_du_commerce_carte_d_identite_fiscale', 'Registre du commerce / Carte d''identité fiscale', array['car','guesthouse','hotel','restaurant']::public.partner_type[], true, 2),
  ('justificatif_de_domicile', 'Justificatif de domicile', array['car','guesthouse','hotel','restaurant']::public.partner_type[], false, 3),
  ('nif_numero_fiscal', 'NIF / Numéro fiscal', array['car','guesthouse','hotel','restaurant']::public.partner_type[], true, 4),
  ('licence_commerciale', 'Licence commerciale', array['car','guesthouse','hotel','restaurant']::public.partner_type[], false, 5),
  ('licence_d_hebergement_touristique', 'Licence d''hébergement touristique', array['guesthouse','hotel']::public.partner_type[], true, 6),
  ('carte_grise_du_vehicule', 'Carte grise du véhicule', array['car']::public.partner_type[], true, 8),
  ('attestation_d_assurance_du_vehicule', 'Attestation d''assurance du véhicule', array['car']::public.partner_type[], true, 9),
  ('controle_technique', 'Contrôle technique', array['car']::public.partner_type[], false, 10),
  ('autorisation_sanitaire', 'Autorisation sanitaire', array['restaurant']::public.partner_type[], true, 11),
  ('licence_de_restauration', 'Licence de restauration', array['restaurant']::public.partner_type[], true, 12);

create table public.partner_application_documents (
  application_id uuid not null references public.partner_applications(id) on delete cascade,
  doc_type       text not null references public.partner_document_types(code) on delete restrict,
  storage_path   text not null check (length(trim(storage_path)) > 0),
  status         public.partner_document_status not null default 'uploaded',
  review_note    text,
  uploaded_at    timestamptz not null default now(),
  primary key (application_id, doc_type)
);

-- A document type must apply to the application's own vertical.
create or replace function public.assert_document_applies()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_type public.partner_type;
begin
  select type into v_type from public.partner_applications where id = new.application_id;
  if not exists (
    select 1 from public.partner_document_types d
     where d.code = new.doc_type and v_type = any(d.applies_to)
  ) then
    raise exception 'Document "%" ne s''applique pas au type %.', new.doc_type, v_type;
  end if;
  return new;
end;
$$;

create trigger documents_type_guard before insert or update on public.partner_application_documents
  for each row execute function public.assert_document_applies();

alter table public.partner_document_types        enable row level security;
alter table public.partner_application_documents enable row level security;

create policy partner_document_types_public_read on public.partner_document_types
  for select to anon, authenticated using (true);

revoke all on public.partner_application_documents from anon, authenticated;
revoke insert, update, delete on public.partner_document_types from anon, authenticated;
revoke all on function public.assert_document_applies() from anon, authenticated, public;;
