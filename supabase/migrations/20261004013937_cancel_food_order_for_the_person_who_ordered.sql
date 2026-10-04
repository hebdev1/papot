-- Annuler sa propre commande était déjà prévu, et impossible.
--
-- `advance_food_order` porte une branche client : si vous n'êtes pas le
-- restaurant, vous pouvez annuler, à condition que la commande soit encore
-- `received` et qu'elle soit à vous (`o.user_id = auth.uid()`). Deux choses la
-- rendaient inatteignable. Une commande d'invité a `user_id` à null, donc la
-- condition est fausse pour tout le monde, y compris pour celui qui vient de
-- la passer. Et `anon` a perdu l'EXECUTE sur cette fonction au dernier audit
-- -- à juste titre : c'est la fonction par laquelle la cuisine fait avancer
-- les commandes. On ne la rouvre pas.
--
-- Celle-ci est l'autre moitié : la porte du client, avec la serrure du client.
-- Le justificatif est le même que pour `track_food_order` -- la référence ET
-- le téléphone -- ou bien le compte du titulaire quand il est connecté. Une
-- référence seule ne suffit pas : `CMD-<année>-<4 chiffres>` est devinable, et
-- annuler le dîner d'un inconnu doit coûter plus qu'une boucle.
--
-- Elle ne connaît qu'une transition, `received -> cancelled`. Le trigger
-- `enforce_food_order_transition` la valide comme toutes les autres, et la
-- restitution de stock est reprise mot pour mot d'`advance_food_order` : le
-- stock revient tant que la cuisine n'a pas commencé, et seulement pour les
-- lignes qui portent un plat.

create or replace function public.cancel_food_order(
  p_reference text,
  p_phone     text default null,
  p_reason    text default null
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  o        restaurant_orders%rowtype;
  v_digits text;
  v_reason text;
begin
  v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  select * into o
    from restaurant_orders
   where reference = btrim(upper(coalesce(p_reference, '')))
     and (
       (length(v_digits) >= 6
        and regexp_replace(customer_phone, '[^0-9]', '', 'g') = v_digits)
       or (user_id is not null and user_id = auth.uid())
     );

  -- Le même message que `track_food_order`, et pour la même raison : il ne dit
  -- pas laquelle des deux moitiés est fausse.
  if not found then
    raise exception 'Aucune commande ne correspond à cette référence et à ce numéro.'
      using errcode = 'P0002';
  end if;

  if o.status <> 'received' then
    raise exception 'Cette commande ne peut plus être annulée en ligne. Appelez le restaurant.';
  end if;

  -- Le motif est visible par le restaurant, et la contrainte d'
  -- `advance_food_order` en exige un d'au moins trois caractères. Celui qui
  -- annule n'a rien à justifier, donc on en fournit un plutôt que de lui
  -- barrer la route.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 3 then
    v_reason := 'Annulée par le client';
  end if;

  update restaurant_inventory inv
     set sold = greatest(inv.sold - used.qty, 0)
    from (select i.item_id, sum(i.quantity)::smallint as qty
            from restaurant_order_items i
           where i.order_id = o.id and i.item_id is not null
           group by i.item_id) as used
   where inv.item_id = used.item_id
     and inv.day = o.service_day;

  update restaurant_orders
     set status = 'cancelled',
         rejection_reason = v_reason
   where id = o.id;

  insert into order_status_history (order_id, status, reason, actor)
  values (o.id, 'cancelled', v_reason, auth.uid());

  return 'cancelled';
end;
$fn$;

-- PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction nouvelle. On le
-- retire et on nomme les rôles : c'est la leçon des deux revoke silencieux de
-- l'audit -- un droit qu'on n'a pas nommé est un droit qu'on croit avoir
-- retiré.
revoke execute on function public.cancel_food_order(text, text, text) from public;
grant  execute on function public.cancel_food_order(text, text, text)
  to anon, authenticated, service_role;

comment on function public.cancel_food_order(text, text, text) is
  'Annulation par le client : référence + téléphone, ou le compte du titulaire. Seulement depuis « reçue ».';
;
