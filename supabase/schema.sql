-- Fresh collection. Existing answers on the previous host are not imported.
-- Apply with execute_sql when the Supabase account is connected. After remote
-- verification, generate the tracked migration using supabase db pull.
begin;

create table public.party_rsvps_v2 (
  guest_id uuid primary key,
  name text not null check (char_length(name) between 2 and 100),
  attending boolean not null,
  meal text check (meal in ('joojeh', 'koobideh')),
  drink text check (drink in ('alcoholic', 'non_alcoholic')),
  updated_at timestamptz not null default now(),
  constraint party_rsvps_v2_choices check (
    (attending and meal is not null and drink is not null)
    or (not attending and meal is null and drink is null)
  )
);

alter table public.party_rsvps_v2 enable row level security;
revoke all on table public.party_rsvps_v2 from public, anon, authenticated;
-- Explicit grants are required for new Supabase projects. No browser role can
-- read or mutate the table. Only the Edge Function's server key reaches it.
grant select, insert, update, delete on table public.party_rsvps_v2 to service_role;

commit;
