-- Run this in Supabase SQL Editor (once) before using the booking form.
-- The API uses the service role key and bypasses RLS.

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  work_email text not null,
  phone text not null,
  company_name text not null,
  role_title text not null,
  firm_size text not null,
  primary_work_types text[] not null default '{}',
  interest_reason text,
  referral_source text
);

create index if not exists booking_requests_created_at_idx
  on public.booking_requests (created_at desc);

alter table public.booking_requests enable row level security;

-- No grants to anon/authenticated: only server-side service role inserts.

comment on table public.booking_requests is 'Basinfoundry booking / walkthrough intake (Vercel API inserts only).';
