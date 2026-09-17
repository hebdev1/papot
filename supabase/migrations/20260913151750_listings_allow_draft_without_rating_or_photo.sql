-- A partner cannot save a draft listing today: rating and img are NOT NULL with
-- no default. A listing nobody has reviewed has no rating, and a listing being
-- written has no photo yet. Requiring both makes "save and finish later"
-- impossible, which is the first thing anyone does when creating a listing.
--
-- rating stays null rather than defaulting to 0: a new listing showing "0 / 5"
-- reads as terrible rather than as new.
alter table listings alter column rating drop not null;
alter table listings alter column img    drop not null;;
