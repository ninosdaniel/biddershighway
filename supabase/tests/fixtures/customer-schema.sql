-- Structural fixture from Highway 0bae38c; no production records.
create table public.conversations (
id uuid primary key default gen_random_uuid(),
"classified_id" uuid not null,
"created_at" timestamptz not null,
"updated_at" timestamptz not null
);
create table public.conversation_users (
id uuid primary key default gen_random_uuid(),
"conversation_id" uuid not null,
"created_at" timestamptz not null,
"updated_at" timestamptz not null,
"user_id" uuid not null
);
create table public.conversation_messages (
id uuid primary key default gen_random_uuid(),
"body" text not null,
"conversation_id" uuid not null,
"created_at" timestamptz not null,
"updated_at" timestamptz not null,
"user_id" uuid not null
);
create table public.saved_searches (
id uuid primary key default gen_random_uuid(),
"created_at" timestamptz not null,
"email" text not null,
"locale" text default 'sv' not null,
"term" text not null,
"updated_at" timestamptz not null
);
create table public.reported_auctions (
id uuid primary key default gen_random_uuid(),
"body" text default '' not null,
"closed_at" timestamptz not null,
"created_at" timestamptz not null,
"highest_bid_amount_cents" integer default 0 not null,
"highest_bid_amount_currency" text default 'SEK' not null,
"make" text,
"name" text not null,
"search_tokens" text default '' not null,
"sold" boolean default false not null,
"source" text default 'bilweb' not null,
"updated_at" timestamptz not null,
"url" text,
"year" integer
);
create table public.sales_reports (
id uuid primary key default gen_random_uuid(),
"created_at" timestamptz not null,
"name" text,
"prompt" text,
"reasoning" text,
"source" text default 'manual' not null,
"updated_at" timestamptz not null,
"valuation_cents" integer,
"valuation_currency" text default 'SEK'
);
create table public.sales_report_reported_auctions (
id uuid primary key default gen_random_uuid(),
"created_at" timestamptz not null,
"reported_auction_id" uuid not null,
"sales_report_id" uuid not null,
"updated_at" timestamptz not null
);
create table public.questionnaires (
id uuid primary key default gen_random_uuid(),
"answers" jsonb default '{}'::jsonb not null,
"created_at" timestamptz not null,
"form_type" integer default 0 not null,
"lead_id" uuid not null,
"section" integer default 0 not null,
"updated_at" timestamptz not null
);
create table public.brands (
id uuid primary key default gen_random_uuid(),
"aliases" text not null,
"created_at" timestamptz not null,
"name" text not null,
"slug" text not null,
"summary_de" text,
"summary_en" text,
"summary_sv" text,
"updated_at" timestamptz not null,
"vehicle_type" integer default 0 not null
);
create table public.vehicle_models (
id uuid primary key default gen_random_uuid(),
"brand_id" uuid not null,
"name" text not null,
"slug" text not null,
"aliases" text not null,
"summary_sv" text,
"summary_en" text,
"summary_de" text,
"created_at" timestamptz not null,
"updated_at" timestamptz not null
);
create table public.blog_posts (
id uuid primary key default gen_random_uuid(),
"author_id" uuid not null,
"created_at" timestamptz not null,
"hero_image_filename" text,
"hero_image_metadata" jsonb default '{}'::jsonb not null,
"published_at" timestamptz not null,
"updated_at" timestamptz not null,
"name_sv" text,
"excerpt_sv" text,
"body_sv" text,
"slug_sv" text,
"name_en" text,
"excerpt_en" text,
"body_en" text,
"slug_en" text,
"name_de" text,
"excerpt_de" text,
"body_de" text,
"slug_de" text
);
create table public.pages (
id uuid primary key default gen_random_uuid(),
"body_de" text not null,
"body_en" text not null,
"body_sv" text not null,
"created_at" timestamptz not null,
"hero_image_filename" text,
"hero_image_metadata" jsonb default '{}'::jsonb not null,
"meta_description_de" text not null,
"meta_description_en" text not null,
"meta_description_sv" text not null,
"name_de" text not null,
"name_en" text not null,
"name_sv" text not null,
"parent_id" uuid,
"published_at" timestamptz,
"slug" text not null,
"updated_at" timestamptz not null
);
create unique index conversation_membership on public.conversation_users(conversation_id,user_id);
create unique index sales_report_comparison on public.sales_report_reported_auctions(sales_report_id,reported_auction_id);
