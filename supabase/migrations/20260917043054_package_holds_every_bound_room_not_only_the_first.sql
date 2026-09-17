/**
 * A paquet holds everything it bundles, not only its first room.
 *
 * The extra-lines loop skipped every line sitting on the paquet's own annonce,
 * on the reasoning that such a line *is* the main article. That is true of one
 * of them — the first, which becomes the main article's unit — and false of any
 * other. A paquet bundling two room types of the same hotel therefore wrote a
 * single line: the second room was never held, never counted, and could be sold
 * over and over on the same nights.
 *
 * The exclusion now names what it actually means: the one line already written
 * as the main article.
 */
do $do$
declare
  src text := pg_get_functiondef('public.create_booking(jsonb)'::regprocedure);
  before text;
begin
  before := src;
  src := replace(src,
$old$           and coalesce(u.listing_id, pl.listing_id) is not null
           and coalesce(u.listing_id, pl.listing_id) <> v_pkg.listing_id$old$,
$new$           and coalesce(u.listing_id, pl.listing_id) is not null
           -- Everything except the line that already became the main article:
           -- the annonce itself, or the room type chosen from it.
           and not (coalesce(u.listing_id, pl.listing_id) = v_pkg.listing_id
                    and (pl.unit_id is null or pl.unit_id = v_unit))$new$);
  if src = before then raise exception 'la condition de la boucle est introuvable'; end if;

  execute src;
end
$do$;;
