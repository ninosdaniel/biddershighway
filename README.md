# Bidders Highway

Next.js 16 / React 19 migration of the Bidders Highway website, with a Supabase
Edge Function backend and Postgres cron implementation.

FAQ, Articles, Sell with us and the footer destinations now use local Next.js
routes. The original branding, fonts, public images and 721 public-page snapshots
are included, in English, Swedish and German. The original header had inert
buttons and the app had only a homepage; it had no routes to open.

## Run locally

```sh
npm install
npm run dev
```

Open **http://localhost:3000/en**. The old Vite server on port 5173, if still
running, is not the Next.js application. `npm run build` and `npm start` run the
production build. `.next/` is generated output, not a source directory.

Use `.env.example` for configuration. Preserve an existing `.env`; legacy
`VITE_SUPABASE_*` values are temporarily accepted by `next.config.mjs`. New
configuration uses `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never expose secret/service-role keys in
browser variables. The image-base setting points at the original public CDN.

## Current migration state

Public editorial pages and core forms are local. The homepage/catalog and auction
details read Supabase independently of `NEXT_PUBLIC_WEBSITE_BACKEND_ENABLED`.
That flag controls account/form actions, not public reads. Empty databases show
an empty catalog; missing auction records show 404. The runtime no longer fetches
pages from the original site or substitutes vehicle snapshots. The retired
`REFERENCE_CONTENT_MODE` setting has no effect.

On 12 October 2026, the production snapshot was copied into Bidders Supabase:
61 source tables and 1,089,618 rows, including 2,987 auctions, 2,542 lots,
63,492 bids and 37,845 user profiles. All source values, row counts and foreign
keys were verified. The public reader now returns 2,261 published listings.
Supabase Auth contains 33,640 email accounts; the 4,205 profiles without email
remain preserved without email login. No invitation, confirmation or other
email was sent or queued. This is a snapshot, not ongoing synchronization.
The copied FAQ, article and informational content remains in
`src/content/reference`; it is not database content. Classified detail pages and
vehicle category/model routes still need their native database views; they do
not fall back to the original website.

The Supabase implementation includes accounts, verified bidding, offers, leads,
comments, settlement, Swish/Fortnox adapters and scheduled workers. The database
migrations and three Edge Functions have been deployed to Bidders through the
Supabase dashboard. The legacy JWT gateway stays enabled on all three functions,
as requested. Transactions and cron execution are **disabled** pending
provider configuration and acceptance. It is not yet full Rails feature parity: see the explicit remaining
work and deployment prerequisites in [the backend migration notes](docs/backend-migration.md).
Forms report unavailability until configured; they never claim a submission was
received without a successful backend response.

## Database history

The read-only `public.get_website_listings()` RPC was applied to Bidders
(`qkeoofwvggqndnxrlfxs`) on 12 October 2026 after approval. Its migration is
`supabase/migrations/20261012000100_public_listing_reader.sql`.
It exposes published listing card fields from `live_listings` and masks hidden
sale prices without granting direct access to the underlying tables. Preserve
its existing migration history; do not recreate it blindly.

Backend migrations `002`–`010` were applied on 12 October 2026 and recorded in
Supabase migration history. They are additive to the imported Highway schema and keep
account, verification, proxy-bid and queue data private. New transaction and cron
settings start disabled. Do not enable concurrent Rails and Supabase writers for
the same auctions.

Migration `010` aligns the legacy schema and restricts direct access to raw
listing views. The completed data import is recorded in
`website_private.data_imports`; its checksums cover all 61 source tables and
both Auth tables. Private exports and rollback backups are outside this
repository. See [the import details](docs/backend-migration.md#production-data-import).

## Checks and content updates

```sh
npm test
npm run check:edge
npm run test:edge
npm run build
```

`npm run import:reference` refreshes/resumes the public editorial import, capped
at 1,200 routes and three concurrent requests. Set `BH_SOURCE_DIR` to the original
source checkout for optional public asset mapping. Coverage and source redirect
repairs are recorded under `src/content/reference/`. The import excludes private
pages, session tokens, scripts, full vehicle archives and administrative tools.
