-- The mobile entries were written as sixteen digits, like a card. Nobody types
-- a phone that way, so MonCash and NatCash could never be tested: every number
-- a person would actually enter fell through to "unknown".
create or replace function public.demo_instrument_result(p_method text, p_number text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select case regexp_replace(coalesce(p_number, ''), '[^0-9]', '', 'g')
    -- Cards: the published test numbers every processor documents, so they are
    -- recognisable at a glance and nobody mistakes one for a real card.
    when '4242424242424242' then null
    when '4000000000000002' then 'Carte refusée par la banque.'
    when '4000000000009995' then 'Provision insuffisante.'
    when '4000000000000069' then 'Carte expirée.'
    -- Mobile money: a Haitian number as a person would type it.
    when '50900000000' then null
    when '50900000001' then 'Paiement refusé par l''opérateur.'
    when '50900000002' then 'Solde insuffisant sur ce compte.'
    else case when p_method = 'card'
      then 'Numéro de carte inconnu. Utilisez une carte de démonstration.'
      else 'Numéro inconnu. Utilisez un numéro de démonstration.' end
  end;
$fn$;;
