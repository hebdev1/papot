-- Phase 3 introduced `manage_menu` and gave it to the kitchen, but the menu
-- tables were still gated on `manage_listings` from before it existed. Two
-- permissions for one screen is how a role ends up seeing a page it cannot use.
--
-- `marketing` already managed listings, so it keeps the menu; the kitchen gains
-- it. Nobody loses anything.
insert into public.partner_role_permissions (role, permission)
values ('marketing', 'manage_menu')
on conflict do nothing;

drop policy menu_items_partner_all on public.menu_items;
create policy menu_items_partner_all on public.menu_items
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = menu_items.listing_id
                    and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.listings l
                       where l.id = menu_items.listing_id
                         and public.partner_can(l.partner_id, 'manage_menu')));

drop policy menu_categories_partner_all on public.menu_categories;
create policy menu_categories_partner_all on public.menu_categories
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = menu_categories.listing_id
                    and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.listings l
                       where l.id = menu_categories.listing_id
                         and public.partner_can(l.partner_id, 'manage_menu')));

drop policy menu_item_notes_partner_all on public.menu_item_notes;
create policy menu_item_notes_partner_all on public.menu_item_notes
  for all to authenticated
  using (exists (select 1 from public.menu_items m
                   join public.listings l on l.id = m.listing_id
                  where m.id = menu_item_notes.item_id
                    and public.partner_can(l.partner_id, 'manage_menu')))
  with check (exists (select 1 from public.menu_items m
                        join public.listings l on l.id = m.listing_id
                       where m.id = menu_item_notes.item_id
                         and public.partner_can(l.partner_id, 'manage_menu')));
;
