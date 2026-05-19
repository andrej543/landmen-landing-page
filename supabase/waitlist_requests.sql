-- Run this in Supabase SQL Editor (once) before using Try Now or resource notifications.
-- The API uses the service role key and bypasses RLS.

create table if not exists public.waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  source_label text not null,
  full_name text,
  email text not null,
  phone text,
  company_name text,
  interest_area text,
  page_path text
);

create index if not exists waitlist_requests_created_at_idx
  on public.waitlist_requests (created_at desc);

create index if not exists waitlist_requests_email_idx
  on public.waitlist_requests (email);

alter table public.waitlist_requests enable row level security;

-- No grants to anon/authenticated: only server-side service role inserts.

comment on table public.waitlist_requests is 'Basinfoundry Try Now and resource notification requests (Vercel API inserts only).';
