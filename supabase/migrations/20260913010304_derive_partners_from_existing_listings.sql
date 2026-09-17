-- Listings were live with no owning business: cars carried a vendor string,
-- stays and restaurants carried nothing. Partners are derived from what is
-- actually there, so the admin's partner and listing screens describe reality
-- rather than seeded fiction. Every one of these is already trading on the
-- public site, so they are active and verified.

-- Car rental companies come from the vendor column.
insert into partners (type, business_name, city, department, country, status, verification, joined_at)
select distinct 'car'::partner_type, l.vendor, l.city, null, 'Haïti',
       'active'::partner_status, 'verified'::verification_status, min(l.created_at) over (partition by l.vendor)
  from listings l
 where l.kind = 'car' and l.vendor is not null
on conflict do nothing;

-- Each property and each restaurant is its own business.
insert into partners (type, business_name, city, country, status, verification, joined_at)
select case
         when l.type ilike '%hôtel%' or l.type ilike '%hotel%' then 'hotel'
         else 'guesthouse'
       end::partner_type,
       l.name, l.city, 'Haïti', 'active', 'verified', l.created_at
  from listings l
 where l.kind = 'stay';

insert into partners (type, business_name, city, country, status, verification, joined_at)
select 'restaurant'::partner_type, l.name, l.city, 'Haïti', 'active', 'verified', l.created_at
  from listings l
 where l.kind = 'restaurant';

-- Link each listing to its owner.
update listings l set partner_id = p.id
  from partners p
 where l.kind = 'car' and l.vendor is not null and p.type = 'car'
   and p.business_name = l.vendor;

update listings l set partner_id = p.id
  from partners p
 where l.kind = 'stay' and p.business_name = l.name and p.type in ('hotel', 'guesthouse');

update listings l set partner_id = p.id
  from partners p
 where l.kind = 'restaurant' and p.business_name = l.name and p.type = 'restaurant';

-- Carry each listing's public rating onto its partner.
update partners p
   set rating = agg.avg_rating
  from (select partner_id, round(avg(rating)::numeric, 1) avg_rating
          from listings where partner_id is not null and rating is not null
         group by partner_id) agg
 where p.id = agg.partner_id;;
