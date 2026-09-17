create type public.partner_type as enum ('guesthouse', 'restaurant', 'car');
create type public.application_status as enum ('new', 'reviewing', 'accepted', 'rejected');

create table public.partner_applications (
  id         uuid primary key default gen_random_uuid(),
  type       public.partner_type not null,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name  text not null check (length(trim(last_name))  > 0),
  email      text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone      text not null check (length(trim(phone)) > 0),
  agree      boolean not null check (agree = true),
  details    jsonb not null default '{}'::jsonb,
  photos     text[] not null default '{}',
  status     public.application_status not null default 'new',
  created_at timestamptz not null default now()
);

create index partner_applications_created_idx on public.partner_applications (created_at desc);
create index partner_applications_status_idx  on public.partner_applications (status);

alter table public.partner_applications enable row level security;

-- Anon may submit an application and nothing else: no read, update or delete.
create policy partner_applications_anon_insert on public.partner_applications
  for insert to anon, authenticated
  with check (true);

revoke select, update, delete on public.partner_applications from anon, authenticated;;
