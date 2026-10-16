-- Public model shapes from highway:main db/schema.rb (0bae38c).
create table public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique,
  description_sv text not null, description_en text not null, description_de text not null,
  created_at timestamptz not null, updated_at timestamptz not null
);
create table public.media_posts (
  id uuid primary key default gen_random_uuid(),
  name text not null, link text not null, summary text not null,
  image_filename text, image_metadata jsonb not null default '{}',
  published_at timestamptz not null default now(), tag integer not null default 0,
  created_at timestamptz not null, updated_at timestamptz not null
);
