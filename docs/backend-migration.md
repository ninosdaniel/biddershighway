# Supabase backend migration

For the current code comparison and outstanding workflows, see the
[16 October review against Highway main](port/CURRENT-WORKSPACE-COMPARISON.md).
Deployment statements below record the earlier deployment; hosted state was
not rechecked during this review. Local, undeployed migrations `018`–`021` add
classified ownership/photo fixes, direct/after-sale checkout, and Claude
questionnaire context, and live editorial publication/comments. Apply all unapplied migrations in order and deploy the
updated API/worker together before enabling these workflows.

The Next.js frontend and Supabase backend implementation are in this checkout.
This is **not yet a complete production replacement for Highway**. Migrations
`002` through `009` were applied to Bidders (`qkeoofwvggqndnxrlfxs`) on 12 October
2026 through the signed-in Supabase dashboard, as requested. Their source hashes
are recorded in `supabase_migrations.schema_migrations`. The existing public
listing reader remains intact. Migration `010` and the production snapshot were
subsequently applied through a reviewed, atomic database import. Transaction processing, queue processing and all
three installed cron entries are disabled pending configuration and acceptance.
The three Edge Functions (`website-api`, `website-cron`, `website-webhooks`) were
also published through the dashboard. Provider secrets and hosted end-to-end
acceptance are still pending. **The user chose to keep the legacy JWT gateway
enabled on all three functions.** `config.toml` preserves that choice. Hosted
checks confirmed the project's publishable `apikey` passes this gateway; account
actions still reject requests without a valid user session. Requests without a
project key receive a gateway 401. The dashboard currently has no custom secrets.

Reference: `biddershighway/highway` commit
`1946e6e827851019c04e3b546b1030ca2cb586f8`. Only public assets/content and a
structural test fixture were copied. Rails credentials, certificates, sessions,
and production records were not imported into the repository.

## Implemented backend

| Feature | Implementation |
| --- | --- |
| Sign-in and signup | Supabase Auth email links; confirmed email links to the corresponding legacy user, under an advisory lock |
| Account | Profile/address, terms, saved auctions, notifications, own invoices and offers; verified payment gates counterpart contact details |
| Identity | Edge-native BankID auth/collect/cancel and dynamic QR; Stripe Identity session and signed webhook alternative |
| Bidding | Service-only transactional RPC, auction row lock, verification/terms/seller/state checks, original proxy-bid rules and 120-second extensions |
| Offers | Verified pre-auction offers and seller-only accept/reject, transactionally settled |
| Purchases / after-sales | Localized React checkout, buyer-bound expiring quotes, atomic server-price settlement, stale-price checks and replay-safe receipts; migration `019` is pending |
| Claude questionnaire input | Original Swedish car/motorcycle labels, condition wording, conditional follow-ups and legacy forms; safe lead fallbacks and stale-draft checks in pending migration `020` |
| Lead intake | Sales, collection, estate and classified lead records; CAPTCHA, rate limits, request deduplication and expiring capability for detailed follow-up |
| Comments | Auction submissions remain moderated. Article comments and replies follow the source immediate-publication rule, bind the confirmed caller, deduplicate retries and reject private/cross-article parents; migration `021` is pending |
| Live editorial | Published articles/pages, author archives, 15-article pagination, tags, localized slug redirects/fallbacks, podcasts, rich text and metadata; request-fresh Supabase reader in migration `021` |
| Settlement | Sold/unsold decision, original fee bounds and optional shortfall rule, invoices/outbox creation and committed-sale research reporting; no payment assumed from invoice creation |
| Payments | Swish app/QR checkout, cancellation, provider reconciliation and callback validation; only the invoice owner can initiate payment |
| Invoices | Fortnox customer creation, service-account token renewal, invoice issuing/bookkeeping, owner-only PDF previews and bank reconciliation |
| Background work | Durable queue, leases, deduplication, exponential retries, dead-letter state and provider-operation reconciliation |

All new tables live in `website_private`, with RLS enabled and no browser grants.
Customer operations are service-role-only RPCs called from `website-api` after
`auth.getUser()` validates the caller. The server resolves the legacy user ID;
the browser cannot supply a different actor. Published auction projections omit
private reserve amounts, proxy limits, seller IDs and identity data.

Legacy Rails verification records and encrypted addresses are **not silently
trusted or decrypted**. A reviewed identity migration is still needed to retain
existing verification without asking customers to verify again. Auth email
linking does not grant verification or administrative permissions.

## Scheduled jobs

Three pg_cron entries drive the migration: an auction clock every second, a
Stockholm-time schedule dispatcher every minute, and an Edge worker every ten
seconds. All remain dormant until the private `jobs_enabled` setting is enabled.
Cron invocation sends the project publishable key for the gateway and a separate
cron secret, both read from Supabase Vault. The `cron.job`
entries also start inactive; use `cron.alter_job(..., active := true)` only at cutover.

| Original recurring task | New handler and schedule |
| --- | --- |
| Refresh listings | `refresh_listings`, every minute; normal materialized-view refresh currently used |
| Sitemap | `generate_sitemap`, daily 03:00 Europe/Stockholm; writes `website-public/sitemap.xml` |
| Payment reconciliation | `sync_payments`, :07/:22/:37/:52; provider reads fan out into individual jobs |
| Interest scores | `compute_interests`, daily 04:30; original 3/2/6 weights, decay, floor and top-eight limit |
| Daily digest | `daily_update`, daily 08:30; opted-in users with matching categories |
| Bilweb import | `scrape_bilweb`, Friday 06:03; stages deduplicated external results |
| Sajab import | `scrape_sajab`, Friday 06:33; category/page continuations and staged external results |

The auction clock rereads closing time under the same row lock used by bids.
Expired auctions reject bids even before a clock job runs. Reminders for three
hours, two hours and fifteen minutes, activation notices, rerun prompts and
post-sale follow-ups use the outbox. Replaying the clock cannot settle twice.

## Not yet equivalent to the original backend

- Direct Stripe/Swish callbacks do not supply a Supabase project key, so the
  retained gateway rejects them before provider verification runs. Keep provider
  callbacks inactive until a compatible ingress is designed and accepted. Do
  not disable the gateway or add credentials to callback URLs to work around this.
- Swish and Fortnox adapters require merchant sandbox acceptance and configured
  certificates/service-account consent. Swish settlement deliberately does not
  create a Fortnox payment: the original system relies on Fortnox's bank import.
  Browser returns and callback bodies never establish payment. The Edge handler
  refetches the merchant's order over mTLS, then validates merchant, invoice OCR,
  order ID, currency and exact amount. An uncertain create is reconciled rather
  than blindly duplicated; an unrecoverable missing request token needs cancellation
  or operator reconciliation. Refunds are not implemented.
- Fortnox customer updates, invoice delivery emails, setup/photography invoices,
  internal company purchases, optional vehicle project tagging and complete
  historical invoice integration need work. Legacy invoice records have been
  copied, but their integration into the new payment flow is not complete.
  New customers use freshly entered private
  account addresses, with existing company billing fields when applicable.
  Existing encrypted Rails addresses are preserved as ciphertext; they have not
  been decrypted or mapped into the new private account fields.
- BankID and Stripe Identity are implemented but have not been tested against
  provider sandboxes or the hosted Edge runtime. Stripe Identity is an alternative
  verification flow, not a copy of the old manual credit-card review flow.
- CRM/Listmonk/Slack/SMS integration and the full sales/photographer workflows
  are not ported. Classified image uploads, vehicle valuation, saved-search
  matching, AI translation and a staff draft-review screen now exist in local
  code. Their remaining gaps are recorded in the 16 October comparison.
  Public lead intake persists the lead and queues an email to support.
- Imported competitor results are staged privately; promoting them into the
  original reported-auction research dataset is not implemented. Bilweb date
  parsing and full metadata parity remain outstanding.
- Notifications use simpler templates. Seller bid-email batching, shortfall
  reminders, unsold top-three bidder campaigns and all original email variations
  need parity review. External email APIs provide bounded idempotency windows;
  a delivery timeout beyond that window requires reconciliation.
- Native catalogue filters, brand/model pages and public galleries now exist.
  Purchase/after-sales checkout, the full classified lifecycle and every
  gallery/account workflow have not yet reached full parity.

The homepage/catalog and auction pages always read Supabase, independently of
`NEXT_PUBLIC_WEBSITE_BACKEND_ENABLED`. An empty database yields an empty catalog
and absent auction records yield 404; neither source-site pages nor snapshots
can fill missing business data. Unsupported classified detail/category routes
also cannot fall back to the original site. Articles, pages and authors now use
`get_website_editorial`; apply migration `021` before deploying their React
routes. It grants public execution to `anon`/`authenticated` and exposes no
drafts. If the server connection uses a custom database role, explicitly grant
that role execute on this public reader. FAQ and remaining core forms still
use local imported content. The flag only activates account/form calls to
Edge Functions and never enables financial writes in the database by itself.

## Production data import

On 12 October 2026, all 61 application tables from DigitalOcean database
`db_877da1ce3d36` were copied into Bidders Supabase, totaling **1,089,618 rows**.
The initially supplied `defaultdb` was empty; the application records were in
the database above. The export used the approved `doadmin` account with every
source connection forced read-only. Temporary network access was removed after
the export. This is a point-in-time copy; the databases are not synchronized.

| Records | Count |
| --- | ---: |
| User profiles | 37,845 |
| Auctions | 2,987 |
| Lots | 2,542 |
| Bids | 63,492 |
| Image metadata | 312,810 |
| Published listing projection | 2,261 |
| Supabase Auth users and email identities | 33,640 each |
| Profiles without an email address | 4,205 |

Email accounts retain the legacy UUIDs, with normalized email addresses in Auth
and the original values in `public.users`. The 25 existing bans were retained.
The 4,205 profiles without email remain in the application tables, with their
history and relationships intact, but no fabricated Auth identity. No passwords,
email confirmations, active sessions, OAuth links or administrative privileges
were invented. Identity verification still requires the reviewed migration
described above. Auth rows were inserted directly without calling signup,
invitation or email APIs. No email was sent or queued; all new job/outbox tables
were empty after import, all three cron jobs remained inactive, and write,
transaction and lifecycle settings remained disabled.

Migration `010` adds the missing legacy tables/columns, RLS and the private import
audit table. Raw listing views are inaccessible to anonymous/authenticated
browser roles; the curated public reader remains available. The import was
rehearsed locally, then committed in a single transaction after foreign-key
validation and full-row checksums for all 61 application tables plus both Auth
tables. The existing Auth trigger remained enabled, its original function was
restored before commit, and that restoration was independently verified.
Post-import API checks confirmed published listings are readable and sensitive
tables/raw listing views expose no rows anonymously.

The source archive SHA-256 is
`08c692c69beab69e9197d2187baebdf16a69cb38c78d30ecb978120a8cf95cdb`.
The audit in `website_private.data_imports` records this checksum, counts and
all 63 verification fingerprints (`binary-row-md5-sum-xor-v1`). Private source
exports, the pre-import destination backup and verification reports are retained
outside the repository in `/private/tmp/bidders-migration.3apQq5/` with restricted
permissions. This temporary location is not a durable backup service. No customer
records or credentials were added to source control. Image/file records still
reference the original object storage; object binaries were not transferred.

## Deployment prerequisites and sequence

1. Use a Supabase account with access to Bidders or an explicitly selected staging
   clone. Compare its schema with `docs/backend-preflight.sql`. These migrations
   extend the imported Highway schema; they do not bootstrap an empty project.
2. Reconcile Supabase migration history. The original `001` reader was already
   applied separately; do not blindly run `db push` and recreate it. Apply new
   migrations `002` through `010` to staging after schema verification. These
   versions are already applied in Bidders; do not replay them there.
3. Configure Auth site URL, the three localized account redirect URLs, SMTP, and
   optional Auth CAPTCHA. The browser uses only a publishable key.
4. Configure Edge secrets from `supabase/functions/.env.example` through a secure
   secret manager/CLI input. Never put service-role keys or provider certificates
   into `NEXT_PUBLIC_*` values. BankID starts against its test endpoint by default.
5. Create the public `website-public` storage bucket for the sitemap, with no
   public write policy. Configure `website_project_url`, `website_publishable_key`
   and `website_cron_secret` in Vault; the last must match Edge `CRON_SECRET`.
   The project key is the same public key used by the frontend; it does not grant
   worker access without the separate cron secret. Credential entry in the browser
   must be completed by the account owner, not pasted into chat.
6. Deploy `website-api`, `website-cron`, and `website-webhooks` with the checked-in
   `config.toml` (`verify_jwt = true` for all three). The API sends the project's
   `apikey` and validates user tokens itself; the worker also requires its own
   secret; the webhook verifies provider proof. Do not replace those application
   checks with the publishable API key. Direct provider callbacks remain blocked
   by the gateway; their ingress must be resolved before provider acceptance.
7. Test signed-in account isolation, concurrent bidder sessions, provider sandbox
   callbacks, DST scheduling, source-schema compatibility, and dead-letter
   recovery. Current local tests do not replace this hosted acceptance pass.
8. Stop the corresponding Rails writers/schedulers before cutover. A migrated
   auction must have exactly one authoritative bid/settlement writer. Only after
   parity review and sandbox acceptance should an operator enable
   `transactions_enabled` and `jobs_enabled`, activate the three `cron.job`
   entries with `cron.alter_job`, then set the frontend flag.

Fortnox does not guarantee create-invoice idempotency. Each create is reserved in
`provider_operations` before the external request. If its outcome is ambiguous,
the job records `invoice_reconciliation_required` instead of issuing another
invoice. Inspect Fortnox by the payment UUID in invoice comments and reconcile
the stored result before retrying.

## Validation commands

For a dashboard deployment, `node scripts/prepare-dashboard.mjs <first-version>`
creates exact source-only review files and bundled Edge entrypoints under the
ignored `public/__deployment/` directory. Paste through the dashboard editor,
verify the complete pasted text, and remove that temporary directory before
shipping the Next.js frontend. The migration wrapper records source hashes and
uses one transaction; it skips the already-applied reader by default. A retry
after a successful deployment must start at the next unapplied version.

```sh
npm test
npm run check:edge
npm run test:edge
npm run build
```

Database tests execute actual PL/pgSQL in PGlite against a sanitized schema
fixture. They cover access grants, unconfirmed users, verification gates,
increments, proxy bidding, duplicate requests, deadlines, settlement, payment
references, private projections, lead capabilities, seller-only offers,
moderation, Swish ownership/terminal states and queue leases. Edge tests validate
payment amount/reference binding, OCR, callback rejection and invoice payment
evidence. Hosted verification confirmed RLS on all private tables, no browser
execute grants on write RPCs, and inactive cron jobs. All three deployed Edge
entrypoints returned the expected 405 to GET requests carrying the public key.
An account POST without a user session returned 401 `authentication_required`;
requests without a project key received a gateway 401. The unconfigured worker
returned 503 `service_not_configured`, with no queue processing. PGlite does not validate hosted pg_cron/pg_net,
network providers or multi-connection concurrency.

Relevant platform references: [Edge authentication](https://supabase.com/docs/guides/functions/auth-headers),
[Cron and Vault](https://supabase.com/docs/guides/functions/schedule-functions),
[Deno client certificates](https://docs.deno.com/api/deno/fetch/).
