/**
 * Real photographs for the destinations that can carry one honestly.
 *
 * A destination card names a place, so its photo is a claim about that place.
 * Three of the supplied files can back that claim:
 *
 *   Labadie   - a photograph of Labadie itself.
 *   Cap-Haïtien - the Citadelle Laferrière, the landmark of the Nord, replacing
 *                 a generic stock photograph of no particular city.
 *   Les Cayes - a white-sand beach on the Haitian coast, for a coastal town of
 *               the Sud.
 *
 * Kenscoff and Pétion-Ville keep their empty state: one is a mountain town and
 * the other is urban, and none of the supplied photographs shows either. A
 * beach under "Kenscoff" would read as fact to a traveller, which is the same
 * rule the listings generator follows when it refuses to invent a spec.
 *
 * The files are served from the site itself rather than hotlinked, so a card
 * does not depend on a third party staying up.
 */
update public.destinations set img = '/photos/labadee.jpg'              where city = 'Labadie';
update public.destinations set img = '/photos/citadelle-laferriere.jpg' where city = 'Cap-Haïtien';
update public.destinations set img = '/photos/plage-sable-blanc.jpg'    where city = 'Les Cayes';;
