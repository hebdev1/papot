-- Rectification de la migration précédente.
--
-- Son commentaire affirmait qu'`authenticated` ne reçoit pas le droit
-- d'écrire `confirmation_sent_at`. C'était faux : la colonne hérite du GRANT
-- posé sur la table entière (`relacl` montre `authenticated=arwdm`). Ce qui
-- empêche réellement l'écriture, c'est l'absence de toute policy INSERT,
-- UPDATE ou DELETE sur `restaurant_orders` -- RLS refuse par défaut.
--
-- Une protection qui tient par ce qui n'a pas encore été écrit n'en est pas
-- une. Le jour où quelqu'un ajoute une policy UPDATE pour une bonne raison --
-- laisser un partenaire corriger une adresse, par exemple -- les vingt-neuf
-- colonnes deviennent écrivables d'un coup, dont celle-ci, dont `total`, et
-- dont `payment_status`.
--
-- Les quatre chemins qui écrivent une commande sont des fonctions
-- SECURITY DEFINER possédées par postgres -- `place_food_order`,
-- `advance_food_order`, `mark_food_order_paid`, `cancel_food_order` -- plus la
-- fonction edge, qui passe par la clé de service. Aucune ne dépend de ce
-- grant. Et aucun écran n'écrit la table en direct : Orders.tsx et
-- PanelFoodOrders.tsx ne font que la lire.

revoke insert, update, delete on public.restaurant_orders      from authenticated;
revoke insert, update, delete on public.restaurant_order_items from authenticated;
revoke insert, update, delete on public.order_item_customizations from authenticated;
revoke insert, update, delete on public.order_status_history   from authenticated;
;
