/**
 * Labadie and Les Cayes become featured destinations.
 *
 * Tier decides how the home page shows a destination: tier 1 is the wide
 * feature card, tier 2 a standard tile, and tier 3 only a text chip under
 * "Aussi disponibles". Both of these now hold a real photograph — Labadie its
 * own, Les Cayes a white-sand beach of the Haitian coast — which a chip cannot
 * show.
 *
 * Kenscoff and Pétion-Ville stay at tier 3, and that is deliberate rather than
 * an omission: neither has a photograph, so promoting them would put "photo à
 * fournir" on the home page beside four real ones. They keep the chip until
 * there is something to show.
 */
update public.destinations set tier = 2 where city in ('Labadie', 'Les Cayes');;
