-- Favourites and named collections (spec §20).
create table public.favorite_collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.favorites (
  user_id       uuid not null references auth.users(id) on delete cascade,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  collection_id uuid references public.favorite_collections(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index favorites_user_idx on public.favorites (user_id, created_at desc);
create index favorites_collection_idx on public.favorites (collection_id);

alter table public.favorite_collections enable row level security;
alter table public.favorites            enable row level security;

-- Unlike bookings, these are safe for the client to manage directly: every
-- policy is pinned to the owner, so RLS is the whole story.
create policy favorites_own_select on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_own_insert on public.favorites
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy favorites_own_update on public.favorites
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy favorites_own_delete on public.favorites
  for delete to authenticated using (user_id = (select auth.uid()));

create policy collections_own_select on public.favorite_collections
  for select to authenticated using (user_id = (select auth.uid()));
create policy collections_own_insert on public.favorite_collections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy collections_own_update on public.favorite_collections
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy collections_own_delete on public.favorite_collections
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.favorites            from anon;
revoke all on public.favorite_collections from anon;

-- A collection may only hold the owner's own favourites.
create or replace function public.assert_collection_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.collection_id is not null
     and not exists (select 1 from public.favorite_collections c
                      where c.id = new.collection_id and c.user_id = new.user_id) then
    raise exception 'Cette collection ne vous appartient pas.';
  end if;
  return new;
end;
$$;

create trigger favorites_collection_guard before insert or update on public.favorites
  for each row execute function public.assert_collection_owner();

revoke all on function public.assert_collection_owner() from anon, authenticated, public;;
