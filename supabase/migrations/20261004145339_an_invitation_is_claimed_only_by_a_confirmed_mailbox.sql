/**
 * An invitation, a business and a staff seat are claimed only by a mailbox the
 * person proved they control.
 *
 * Four SECURITY DEFINER functions resolved a person from an address with
 * `select id into v_owner from auth.users where lower(email) = ...` and nothing
 * else. Autoconfirm is on, so a signup is usable the instant it is posted: all
 * six existing accounts have `email_confirmed_at` set within twelve
 * milliseconds of `created_at`, which is the signature of a column recording a
 * setting rather than an act.
 *
 * The harm is a business, not a row. An attacker who guesses the address on an
 * in-flight dossier -- the `contact@` printed on the hotel's own page --
 * registers it first, and `admin_decide_application(..., 'accept')` writes that
 * attacker's id into `partners.owner_id` and into the `owner` row of
 * `partner_members`. The real applicant is locked out of a business PAPOT has
 * just certified as theirs, and the attacker holds every partner permission
 * over it: the tariffs, the payout details, the customer list, the calendar.
 * `claim_partner_invitations()` is the same hole from the other side -- it
 * claims every `partner_members` row matching the caller's own address, so
 * registering `owner@hotel.ht` is by itself enough to walk into that hotel's
 * dashboard. `admin_upsert_staff()` was not in the original finding and is the
 * worst of the four: register the address an admin is about to invite, and
 * receive the `admin_role` they typed.
 *
 * The clause is `and email_confirmed_at is not null`, which `claim_my_purchases()`
 * (20260917034420:35-37) already carries -- the only place in the schema that
 * did. It is chosen over a token flow because a token is a second delivery
 * channel to build, lose and support, and the only thing it would prove is what
 * GoTrue already records in that column. An unconfirmed address now resolves to
 * no account, which lands in the pre-existing and well-handled "no account yet"
 * branch: the membership is written `invited`, keyed to the email, and attaches
 * itself the day the real owner confirms.
 *
 * The ineffective revoke is corrected here too. 20260913151346:160 said
 * `revoke execute on function claim_partner_invitations() from anon`, and live
 * `proacl` still reads `{=X/postgres,postgres=X/postgres,authenticated=X/postgres,
 * service_role=X/postgres}`. The leading `=X` is the grant to PUBLIC, which anon
 * inherits, so the revoke removed a privilege that was never granted directly.
 * Same family as 20260928021119: a revoke must name the grant that exists.
 *
 * Deliberately left alone, three things. **No `limit 1`.** Two accounts sharing
 * a lowercased address is a real ambiguity about who owns a business, and
 * `21000 too many rows` is the correct answer to it: `limit 1` would hand the
 * business to whichever row the planner read first, silently and irreversibly.
 * There is none today (verified: zero groups with count > 1). **`a.user_id`
 * keeps its unconditional trust** in `admin_decide_application`: that id comes
 * from the session that submitted the dossier, so the applicant is the account
 * by construction, and requiring confirmation there would reject the one person
 * who provably filled the form. **The six existing `email_confirmed_at` values
 * are not cleared.** None proves mailbox control, but four are the founder's own
 * addresses and two are test accounts, and the only two active staff rows are
 * super_admins on those addresses -- clearing them would lock the platform out
 * of its own console.
 *
 * This migration is a correct lock on a door whose key is still being handed
 * out: the guard is inert until "Confirm email" is enabled in the dashboard,
 * which is the half of this finding no migration can reach.
 */

create or replace function public.claim_partner_invitations()
returns integer language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_email text; v_count integer;
begin
  if auth.uid() is null then return 0; end if;
  -- An address GoTrue has not confirmed is not proof of anything, and the three
  -- updates below hand over a whole business on the strength of it.
  select lower(email) into v_email from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  update partner_members
     set user_id = auth.uid(),
         status  = case when status = 'invited' then 'active' else status end,
         last_active_at = now()
   where lower(email) = v_email and user_id is null;
  get diagnostics v_count = row_count;

  update partner_members set last_active_at = now() where user_id = auth.uid();

  -- A business with no owner_id but an active owner member now has one.
  update partners p set owner_id = m.user_id
    from partner_members m
   where m.partner_id = p.id and m.role = 'owner' and m.user_id = auth.uid()
     and p.owner_id is null;

  return v_count;
end;
$fn$;

comment on function public.claim_partner_invitations() is
  'Attaches pending partner invitations to the signed-in account, matching on the caller''s confirmed address only.';

grant execute on function public.claim_partner_invitations() to authenticated;

revoke execute on function public.claim_partner_invitations() from public, anon;

do $do$
declare
  src    text := pg_get_functiondef('public.admin_decide_application(uuid,text,text)'::regprocedure);
  before text;
begin
  before := src;
  src := replace(src,
$old$    if v_owner is null then
      select id into v_owner from auth.users
       where lower(email) = lower(btrim(coalesce(a.business_email, '')))
         and btrim(coalesce(a.business_email, '')) <> '';
    end if;
    if v_owner is null then
      select id into v_owner from auth.users
       where lower(email) = lower(btrim(coalesce(a.email, '')))
         and btrim(coalesce(a.email, '')) <> '';
    end if;$old$,
$new$    if v_owner is null then
      select id into v_owner from auth.users
       where lower(email) = lower(btrim(coalesce(a.business_email, '')))
         and btrim(coalesce(a.business_email, '')) <> ''
         and email_confirmed_at is not null;
    end if;
    if v_owner is null then
      select id into v_owner from auth.users
       where lower(email) = lower(btrim(coalesce(a.email, '')))
         and btrim(coalesce(a.email, '')) <> ''
         and email_confirmed_at is not null;
    end if;$new$);
  if src = before then raise exception 'owner resolution hunk did not apply'; end if;

  execute src;
end
$do$;

comment on function public.admin_decide_application(uuid, text, text) is
  'Decides a partner dossier. On accept, resolves the owner from a confirmed address only; an unconfirmed one yields an invited membership keyed to the email.';

do $do$
declare
  src    text := pg_get_functiondef('public.admin_set_partner_member(uuid,text,text,partner_member_role,partner_member_status)'::regprocedure);
  before text;
begin
  before := src;
  src := replace(src,
$old$  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));$old$,
$new$  -- The admin chooses the address; whoever registered it chooses whether an
  -- account answers there. An unconfirmed one is not the person the admin
  -- meant, and the `invited` branch below already says what to do about that.
  select id into v_user from auth.users
   where lower(email) = lower(btrim(p_email))
     and email_confirmed_at is not null;$new$);
  if src = before then raise exception 'admin_set_partner_member lookup hunk did not apply'; end if;

  execute src;
end
$do$;

do $do$
declare
  src    text := pg_get_functiondef('public.admin_upsert_staff(text,text,admin_role,staff_status)'::regprocedure);
  before text;
begin
  before := src;
  src := replace(src,
$old$  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));$old$,
$new$  -- A staff seat is the highest thing this schema grants, and it was handed
  -- to whoever had registered the address an admin typed. Unconfirmed is not a
  -- person: the P0002 below is the right answer.
  select id into v_user from auth.users
   where lower(email) = lower(btrim(p_email))
     and email_confirmed_at is not null;$new$);
  if src = before then raise exception 'admin_upsert_staff lookup hunk did not apply'; end if;

  execute src;
end
$do$;

comment on function public.admin_upsert_staff(text, text, admin_role, staff_status) is
  'Grants or changes a staff seat. Resolves the person from a confirmed address only: an unconfirmed account is refused with P0002, not promoted.';
;
