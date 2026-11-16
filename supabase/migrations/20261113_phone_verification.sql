create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  full_name text not null,
  otp_hash text not null,
  salt text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired')),
  attempts integer not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists phone_verifications_phone_created_idx
  on public.phone_verifications (phone_e164, created_at desc);
create index if not exists phone_verifications_expires_idx
  on public.phone_verifications (expires_at);

alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from anon, authenticated;
grant all on public.phone_verifications to service_role;

alter table public.profiles
  add column if not exists phone_verified boolean not null default false;
alter table public.customers
  alter column email drop not null;

create unique index if not exists profiles_phone_verified_unique_idx
  on public.profiles (phone)
  where phone is not null and phone <> '';

notify pgrst, 'reload schema';
