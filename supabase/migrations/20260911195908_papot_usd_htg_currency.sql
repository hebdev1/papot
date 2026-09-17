-- Canvas spec: "Langue par défaut fr, prix en USD avec équivalent HTG."
-- Prices become canonical USD with cents; HTG is derived at display time.
alter table public.listings
  alter column price type numeric(10,2),
  alter column original_price type numeric(10,2),
  add column currency text not null default 'USD';

create table public.exchange_rates (
  base       text not null,
  quote      text not null,
  rate       numeric(14,6) not null check (rate > 0),
  updated_at timestamptz not null default now(),
  primary key (base, quote)
);

insert into public.exchange_rates (base, quote, rate) values ('USD', 'HTG', 132.00);

alter table public.exchange_rates enable row level security;

create policy exchange_rates_public_read on public.exchange_rates
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.exchange_rates from anon, authenticated;;
