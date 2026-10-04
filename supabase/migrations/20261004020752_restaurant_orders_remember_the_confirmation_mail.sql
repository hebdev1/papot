-- La trace de l'accusé de réception, pour qu'il ne parte qu'une fois.
--
-- Même colonne et même rôle que sur `partner_applications` : la fonction edge
-- ne traite que les lignes dont elle est nulle, donc un double appel -- un
-- client qui recharge, un filet qui réessaie -- n'envoie pas deux courriels.
-- Elle reste nulle si le fournisseur refuse, pour qu'un nouvel essai soit
-- encore possible.
--
-- `authenticated` ne reçoit pas le droit de l'écrire : c'est la fonction edge,
-- avec la clé de service, qui l'horodate. Une colonne que le navigateur
-- pourrait remettre à null serait un interrupteur à courriels.

alter table public.restaurant_orders
  add column if not exists confirmation_sent_at timestamptz;

comment on column public.restaurant_orders.confirmation_sent_at is
  'Horodaté par send-order-confirmation. Null = pas encore envoyé, et donc encore envoyable.';
;
