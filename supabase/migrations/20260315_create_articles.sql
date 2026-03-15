-- Articles table for the alumi news admin CMS
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null default '',
  category text not null default 'Research Summary',
  tags text[] not null default '{}',
  keywords text[] not null default '{}',
  gradient_from text not null default 'rose-600',
  gradient_to text not null default 'red-700',
  featured boolean not null default false,
  draft boolean not null default false,
  coming_soon boolean not null default false,
  read_time integer not null default 10,
  publish_date date not null default current_date,
  sort_order integer,
  hero_image text,
  hero_image_alt text,

  -- Content
  article_html text not null default '',
  article_svg text,
  toc jsonb not null default '[]',
  source_text text,

  -- Status: draft, published, archived
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger articles_updated_at
  before update on public.articles
  for each row
  execute function update_updated_at();

-- Index for common queries
create index if not exists articles_status_idx on public.articles (status);
create index if not exists articles_slug_idx on public.articles (slug);
create index if not exists articles_sort_idx on public.articles (sort_order, publish_date desc);

-- RLS: allow service role full access (Edge Functions use service role)
alter table public.articles enable row level security;

create policy "Service role full access" on public.articles
  for all using (true) with check (true);
