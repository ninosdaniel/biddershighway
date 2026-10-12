begin;

-- Align the empty destination with the 2026-10-12 production snapshot.

-- This file contains schema only. It does not import records or enable background jobs.

CREATE TABLE public."ar_internal_metadata" (
    key character varying NOT NULL,
    value character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

ALTER TABLE public."ar_internal_metadata" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."ar_internal_metadata" FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public."ar_internal_metadata" TO service_role;

ALTER TABLE public."blog_posts" ADD COLUMN "name_sv" character varying;

ALTER TABLE public."blog_posts" ADD COLUMN "excerpt_sv" text;

ALTER TABLE public."blog_posts" ADD COLUMN "body_sv" text;

ALTER TABLE public."blog_posts" ADD COLUMN "slug_sv" character varying;

ALTER TABLE public."blog_posts" ADD COLUMN "name_en" character varying;

ALTER TABLE public."blog_posts" ADD COLUMN "excerpt_en" text;

ALTER TABLE public."blog_posts" ADD COLUMN "body_en" text;

ALTER TABLE public."blog_posts" ADD COLUMN "slug_en" character varying;

ALTER TABLE public."blog_posts" ADD COLUMN "name_de" character varying;

ALTER TABLE public."blog_posts" ADD COLUMN "excerpt_de" text;

ALTER TABLE public."blog_posts" ADD COLUMN "body_de" text;

ALTER TABLE public."blog_posts" ADD COLUMN "slug_de" character varying;

CREATE TABLE public."brands" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    vehicle_type integer DEFAULT 0 NOT NULL,
    aliases character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    summary_sv text,
    summary_en text,
    summary_de text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

ALTER TABLE public."brands" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."brands" FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public."brands" TO service_role;

ALTER TABLE public."fortnox_invoices" ADD COLUMN "paid_at" timestamp(6) without time zone;

ALTER TABLE public."leads" ADD COLUMN "setup_fee_cents" integer;

ALTER TABLE public."leads" ADD COLUMN "setup_fee_currency" character varying;

ALTER TABLE public."lots" ADD COLUMN "photos_reviewed" boolean DEFAULT false NOT NULL;

ALTER TABLE public."photo_ops" ADD COLUMN "kind" integer DEFAULT 0 NOT NULL;

ALTER TABLE public."saved_searches" ADD COLUMN "locale" character varying DEFAULT 'sv'::character varying NOT NULL;

CREATE TABLE public."schema_migrations" (
    version character varying NOT NULL
);

ALTER TABLE public."schema_migrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."schema_migrations" FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public."schema_migrations" TO service_role;

ALTER TABLE public."themes" ADD COLUMN "blog_post_id" uuid NOT NULL;

CREATE TABLE public."vehicle_models" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    aliases character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    summary_sv text,
    summary_en text,
    summary_de text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

ALTER TABLE public."vehicle_models" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."vehicle_models" FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public."vehicle_models" TO service_role;

ALTER TABLE ONLY public.ar_internal_metadata
    ADD CONSTRAINT ar_internal_metadata_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT vehicle_models_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT fk_rails_9f189d447b FOREIGN KEY (blog_post_id) REFERENCES public.blog_posts(id);

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT fk_rails_f2a5706bec FOREIGN KEY (brand_id) REFERENCES public.brands(id);

CREATE UNIQUE INDEX index_brands_on_vehicle_type_and_slug ON public.brands USING btree (vehicle_type, slug);

CREATE UNIQUE INDEX index_vehicle_models_on_brand_id_and_slug ON public.vehicle_models USING btree (brand_id, slug);

-- Raw listing views include reserve amounts; only the curated RPC is public.
REVOKE ALL ON TABLE public.live_listings, public.listings, public.weekly_summary_published FROM PUBLIC, anon, authenticated;

CREATE TABLE website_private.data_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_database text NOT NULL,
  source_sha256 text NOT NULL UNIQUE,
  imported_at timestamptz NOT NULL DEFAULT now(),
  table_counts jsonb NOT NULL,
  source_rows bigint NOT NULL,
  auth_users_created bigint NOT NULL,
  profiles_without_email bigint NOT NULL,
  email_notifications_sent bigint NOT NULL DEFAULT 0 CHECK (email_notifications_sent = 0),
  verification_checksums jsonb NOT NULL
);
ALTER TABLE website_private.data_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE website_private.data_imports FROM PUBLIC, anon, authenticated;

notify pgrst, 'reload schema';
commit;
