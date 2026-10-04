-- « Sans oignon » arrivait en base comme une note.
--
-- La contrainte `customization_kind_known` accepte cinq genres --
-- remove, extra, option, allergy, note -- et la page de suivi sait déjà
-- écrire « Sans X » et « Extra X » en les lisant. Mais l'insertion écrasait
-- tout :
--
--   case when v_cust->>'kind' = 'allergy' then 'allergy' else 'note' end
--
-- Ce n'était pas un défaut tant qu'aucun écran ne pouvait produire autre
-- chose : les deux constructeurs passaient `customizations: []` en dur. La
-- carte sait maintenant demander « sans oignon », et un retrait doit arriver
-- en cuisine comme un retrait -- sur le ticket, « Sans oignon » et « note :
-- oignon » ne se lisent pas pareil.
--
-- La liste reste fermée, et c'est elle qui compte : le genre vient du
-- navigateur, donc tout ce qui n'est pas reconnu redevient une note plutôt
-- que d'aller heurter la contrainte.
--
-- Même technique que les gardes françaises : on reprend la fonction telle
-- qu'elle est et on remplace la ligne, en vérifiant que le motif existe.

do $do$
declare
  src text;
  nxt text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'place_food_order';
  if src is null then
    raise exception 'place_food_order est introuvable.';
  end if;

  nxt := replace(src,
    $f$                case when v_cust->>'kind' = 'allergy' then 'allergy' else 'note' end,$f$,
    $r$                case when v_cust->>'kind' in ('remove', 'extra', 'option', 'allergy')
                     then v_cust->>'kind' else 'note' end,$r$);
  if nxt = src then
    raise exception 'Genre des personnalisations : motif introuvable.';
  end if;

  execute nxt;
end
$do$;
;
