-- Newsletter subscribers table
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  subscribed_at timestamptz not null default now(),
  source text not null default 'website',
  created_at timestamptz not null default now()
);

-- RLS: service role can write, no public read
alter table public.newsletter_subscribers enable row level security;

-- Index for duplicate checking on upsert
create unique index if not exists idx_newsletter_email on public.newsletter_subscribers (email);
