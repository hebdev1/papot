create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  user_id        uuid references auth.users(id) on delete set null,
  first_name     text not null,
  last_name      text not null,
  email          text not null,
  phone          text not null,
  payment_method text not null check (payment_method in ('card', 'moncash', 'natcash')),
  total          numeric(10,2) not null check (total >= 0),
  currency       text not null default 'USD',
  status         public.booking_status not null default 'pending',
  created_at     timestamptz not null default now()
);

create table public.booking_items (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  unit_id    uuid references public.listing_units(id) on delete set null,
  kind       public.listing_kind not null,
  title      text not null,
  detail     text not null,
  amount     numeric(10,2) not null default 0 check (amount >= 0),
  status     public.booking_status not null default 'pending',
  position   integer not null default 0
);
create index booking_items_booking_idx on public.booking_items (booking_id, position);

alter table public.bookings      enable row level security;
alter table public.booking_items enable row level security;

-- No direct client access at all: everything goes through the RPCs below.
revoke all on public.bookings      from anon, authenticated;
revoke all on public.booking_items from anon, authenticated;

-- 1f shows "Référence PPT-2026-4817".
create or replace function public.next_booking_reference()
returns text language plpgsql as $$
declare ref text;
begin
  loop
    ref := 'PPT-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
    exit when not exists (select 1 from public.bookings where reference = ref);
  end loop;
  return ref;
end;
$$;

/**
 * Creates a booking and its items in one transaction.
 * Amounts are recomputed here from the payload's own item list rather than
 * trusted from the client's total, so a tampered total cannot be paid.
 */
create or replace function public.create_booking(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_ref   text;
  v_total numeric(10,2);
  v_item  jsonb;
  v_pos   integer := 0;
begin
  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Le panier est vide.';
  end if;

  select coalesce(sum((i->>'amount')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_payload->'items') i;

  v_ref := public.next_booking_reference();

  insert into public.bookings
    (reference, user_id, first_name, last_name, email, phone, payment_method, total)
  values (
    v_ref,
    auth.uid(),
    trim(p_payload->>'first_name'),
    trim(p_payload->>'last_name'),
    trim(p_payload->>'email'),
    trim(p_payload->>'phone'),
    coalesce(p_payload->>'payment_method', 'card'),
    v_total
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    insert into public.booking_items
      (booking_id, listing_id, unit_id, kind, title, detail, amount, status, position)
    values (
      v_id,
      nullif(v_item->>'listing_id', '')::uuid,
      nullif(v_item->>'unit_id', '')::uuid,
      (v_item->>'kind')::public.listing_kind,
      v_item->>'title',
      coalesce(v_item->>'detail', ''),
      coalesce((v_item->>'amount')::numeric, 0),
      -- Restaurants confirm within 24 h (1f); the rest confirm immediately.
      case when (v_item->>'kind') = 'restaurant' then 'pending' else 'confirmed' end::public.booking_status,
      v_pos
    );
    v_pos := v_pos + 1;
  end loop;

  update public.bookings set status = 'confirmed' where id = v_id;

  return json_build_object('id', v_id, 'reference', v_ref, 'total', v_total);
end;
$$;

/** The reference is the capability token, the way an order number is. */
create or replace function public.get_booking(p_reference text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v json;
begin
  select json_build_object(
           'reference', b.reference,
           'first_name', b.first_name,
           'email', b.email,
           'total', b.total,
           'status', b.status,
           'created_at', b.created_at,
           'items', coalesce(
             (select json_agg(json_build_object(
                        'title', i.title, 'detail', i.detail,
                        'amount', i.amount, 'kind', i.kind, 'status', i.status)
                      order by i.position)
                from public.booking_items i where i.booking_id = b.id), '[]'::json))
    into v
    from public.bookings b
   where b.reference = upper(trim(p_reference));

  return v;  -- null when the reference is unknown
end;
$$;

revoke all on function public.create_booking(jsonb) from public;
revoke all on function public.get_booking(text)     from public;
grant execute on function public.create_booking(jsonb) to anon, authenticated;
grant execute on function public.get_booking(text)     to anon, authenticated;;
