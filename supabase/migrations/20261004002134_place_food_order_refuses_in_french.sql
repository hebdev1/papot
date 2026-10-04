-- `place_food_order` valide beaucoup, et bien : une trentaine de refus
-- français précis, « Choisissez une portion pour « X ». », « Il ne reste que N
-- portion(s) de « X ». » Mais quatre entrées traversaient sans contrôle et
-- allaient mourir plus bas sur une contrainte Postgres, en anglais, avec un
-- nom de contrainte dedans -- sous les yeux du client, au moment de payer.
--
-- C'est la même famille que le `23514` corrigé côté console : un message
-- écrit par PostgreSQL n'est jamais destiné à une personne. Tant que la
-- commande en ligne était éteinte partout, personne ne pouvait les atteindre.
-- Elle vient d'être allumée sur tout le catalogue.
--
--   fulfillment absent    -> null value in column "fulfillment" ...
--   fulfillment inconnu   -> 22P02 invalid input value for enum
--   payment_method autre  -> violation « payment_method_known »
--   livraison sans adresse-> violation « delivery_needs_address »
--   listing_id non-UUID   -> 22P02 invalid input syntax for type uuid
--
-- La fonction fait 18 000 caractères et le reste est juste. On la reprend donc
-- telle quelle et on y insère les gardes, plutôt que de la retaper -- une
-- copie manuelle de cette taille est sa propre source de régressions. Chaque
-- insertion vérifie qu'elle a bien trouvé son motif et abandonne sinon.

do $do$
declare
  src text;
  cur text;
  nxt text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_food_order';
  if src is null then
    raise exception 'place_food_order est introuvable.';
  end if;
  cur := src;

  -- 1. L'identifiant du restaurant. Un UUID malformé est, du point de vue de
  --    celui qui commande, exactement un restaurant qui n'existe pas.
  nxt := replace(cur,
    $f$  v_listing := nullif(p_payload->>'listing_id', '')::uuid;$f$,
    $r$  if coalesce(p_payload->>'listing_id', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Ce restaurant est introuvable.' using errcode = 'P0002';
  end if;
  v_listing := (p_payload->>'listing_id')::uuid;$r$);
  if nxt = cur then raise exception 'Garde 1 (listing_id) : motif introuvable.'; end if;
  cur := nxt;

  -- 2. Le mode de retrait. Il partait droit dans une colonne not null.
  nxt := replace(cur,
    $f$  v_mode := (p_payload->>'fulfillment')::public.fulfillment_mode;$f$,
    $r$  if coalesce(p_payload->>'fulfillment', '') not in ('dine_in', 'pickup', 'delivery') then
    raise exception 'Indiquez si la commande est à emporter, livrée ou sur place.';
  end if;
  v_mode := (p_payload->>'fulfillment')::public.fulfillment_mode;$r$);
  if nxt = cur then raise exception 'Garde 2 (fulfillment) : motif introuvable.'; end if;
  cur := nxt;

  -- 3 et 4. Le moyen de paiement et l'adresse, juste après le téléphone --
  --         donc après que `v_mode` est connu.
  nxt := replace(cur,
    $f$  if length(btrim(coalesce(p_payload->>'customer_phone', ''))) < 6 then
    raise exception 'Un numéro de téléphone est nécessaire pour vous joindre.';
  end if;$f$,
    $r$  if length(btrim(coalesce(p_payload->>'customer_phone', ''))) < 6 then
    raise exception 'Un numéro de téléphone est nécessaire pour vous joindre.';
  end if;

  if p_payload->>'payment_method' is not null
     and p_payload->>'payment_method' not in ('cash', 'card', 'moncash', 'natcash') then
    raise exception 'Ce moyen de paiement n''est pas accepté.';
  end if;

  if v_mode = 'delivery' and length(btrim(coalesce(p_payload->>'address', ''))) = 0 then
    raise exception 'Indiquez l''adresse de livraison.';
  end if;$r$);
  if nxt = cur then raise exception 'Gardes 3-4 (paiement, adresse) : motif introuvable.'; end if;
  cur := nxt;

  execute cur;
end
$do$;
;
