# GitHub main-to-main comparison — 15 October 2026

> Historical review of a different target. For this workspace, use the
> [16 October current-workspace comparison](CURRENT-WORKSPACE-COMPARISON.md).
> The former local target checkout has been removed; statements below describe
> the pinned GitHub baseline and the work performed at the time.

**The new repository is not a complete port of Highway.** Its catalogue, account screens and several database commands are implemented, but substantial customer, staff, financial, AI and background workflows are absent or partial. Passing the current tests does not establish feature parity.

## Exact baseline

| Role | GitHub repository / branch | Verified commit |
| --- | --- | --- |
| Old application | [biddershighway/highway — main](https://github.com/biddershighway/highway/tree/0bae38c04fb0e6c9510d7bba659c151f456c095d) | `0bae38c04fb0e6c9510d7bba659c151f456c095d` |
| New application | [BiddersHW/biddershighway — main](https://github.com/BiddersHW/biddershighway/tree/303d0572e3357e69171cda5b6e280d93e7712c7b) | `303d0572e3357e69171cda5b6e280d93e7712c7b` |

Both snapshots were cloned directly from these GitHub URLs. Neither `staging` nor the separate `ninosdaniel/biddershighway` checkout is the comparison target. Local work in that separate checkout does not count as an implementation in the new repository.

The new repository's existing inventory references old commit `ecc5a60c40f690733b107030eb7fa9ea0821e047`, not the current old `main`. Its historic inventory and nine previously applied migrations are preserved.

## Confirmed gaps, in migration priority order

1. **The background worker does not execute provider work.** [The target worker](https://github.com/BiddersHW/biddershighway/blob/303d0572e3357e69171cda5b6e280d93e7712c7b/supabase/function-drafts/process-jobs/index.ts) calls the lifecycle RPC, then finishes every claimed event as `blocked`. It is stored under `function-drafts`, and the baseline contains no `supabase/functions` implementation. Creating an outbox row does not send an email, make an invoice, synchronize a CRM record, or run AI. Each source job needs an executable Supabase handler, deduplication, retry behavior and an appropriate schedule. The current source has 83 concrete job files plus three support files, not the 82 files in the old inventory.

2. **A new customer cannot complete the original identity workflow.** The new [account page](https://github.com/BiddersHW/biddershighway/blob/303d0572e3357e69171cda5b6e280d93e7712c7b/src/app/%5Blocale%5D/account/%5B%5B...path%5D%5D/page.tsx) renders verification status and a disabled BankID button. The database can recognize an existing proof, but that is not BankID or card verification. The source also has a separate address-completion step. Supabase must own provider sessions, verified results and proof persistence, with React completion screens. These are missing implementations, not merely missing API keys.

3. **Payment and post-sale processing are missing.** The old [invoice payment controller](https://github.com/biddershighway/highway/blob/0bae38c04fb0e6c9510d7bba659c151f456c095d/app/controllers/invoices/payments_controller.rb) refreshes Fortnox payment status; invoice PDF, Swish request/cancel/QR/callback flows and scheduled reconciliation have no equivalents in target main. The [sold settlement job](https://github.com/biddershighway/highway/blob/0bae38c04fb0e6c9510d7bba659c151f456c095d/app/jobs/settle_auction_as_sold_job.rb) creates buyer/seller invoices, bookkeeps them, sends messages and schedules follow-up. The target changes sale state and emits an event. It does not complete those effects. Accounting reports, monthly invoice/photo-fee downloads and payment-dependent buyer/seller handover are also missing.

4. **Auction outcomes and workflows are not fully equivalent.** The target SQL scheduler concludes only when the bid reaches the reserve. The source [SoldState](https://github.com/biddershighway/highway/blob/0bae38c04fb0e6c9510d7bba659c151f456c095d/app/services/sold_state.rb) supports configured reserve shortfall; target TypeScript has this option, but the scheduler does not. [After-sales](https://github.com/biddershighway/highway/blob/0bae38c04fb0e6c9510d7bba659c151f456c095d/app/controllers/after_sales_controller.rb) permits buying an eligible concluded unsold auction; target `purchase` accepts only lifecycle 6. Bid adjustments, reserve-change effects, rerun handling, reported-auction synchronization and reminder timing are incomplete. The source schedules reminders at two hours, three hours, fifteen minutes, seven days and later follow-up; the target lifecycle scheduler does not reproduce that orchestration.

5. **The seller commission minimum was wrong.** At a 50,000 SEK sale and a 2.5% seller rate, target main calculated 1,000 SEK before VAT. Old main requires **2,000 SEK before VAT**, or 2,500 SEK with 25% VAT. A zero seller rate remains exempt. This review fixes the TypeScript calculation and adds an additive Supabase migration for settlement; see “Changes and validation” below. Historical sales and invoices are not recalculated.

6. **The specialized lead/seller workflow is absent.** The old [`admin/leads` controllers](https://github.com/biddershighway/highway/tree/0bae38c04fb0e6c9510d7bba659c151f456c095d/app/controllers/admin/leads) implement contact, agreement, verification request, form/reminders, text generation/translation, photo booking/review, approval, publication, churn and comments. The new `/filter` page offers generic record editors. Generic editing does not reproduce these transitions, validations or side effects. The source `/1984` assignment/throughput workflow, registration enrichment, lead-to-lot/auction/classified conversion, reactivation, unauthenticated capability links, calendar booking and Swiftcourt contracts also need ports.

7. **All built-in Claude features are missing from the target baseline.** See the detailed AI inventory below. There is no model client, valuation pipeline, comparable ranking, generated-text action or worker adapter in target main.

8. **Schema and editorial behavior have diverged.** Source main defines 59 application tables versus 57 in the target reference. `brands` and `vehicle_models` are absent, and old main now uses translated blog titles, excerpts, bodies and slugs. The new public pages still select blog records by legacy `locale` and `slug`, and the admin editor exposes legacy fields. Source `/cars`, `/motorcycles`, brand/model hubs, aliases and longest-match rules are not replaced by the target's static brand links. Themes have changed to a single multilingual blog-post relationship. See `schema-diff.json`; this needs a data-preserving migration and matching React queries/routes, not a destructive column drop.

9. **Account and communication parity is incomplete.** Email-change confirmation, Google sign-in, updated-terms acceptance/enforcement, signup interests, SMS acceptance, transport requests, account anonymization and unsubscribe/one-click/welcome-series flows are missing or incomplete. Source [User](https://github.com/biddershighway/highway/blob/0bae38c04fb0e6c9510d7bba659c151f456c095d/app/models/user.rb) requires acceptance of terms dated 2025-12-22; the new signup checkbox does not persist this acceptance and the bid RPC does not enforce it. Saved searches can be stored, but matching and notification delivery are absent. Conversations can store messages, but their notification job is absent. Eighteen source mailer files are inventoried; copying translation strings is not a mailer port.

10. **Admin listing limits can hide existing records.** [`staff_records`](https://github.com/BiddersHW/biddershighway/blob/303d0572e3357e69171cda5b6e280d93e7712c7b/supabase/migrations/20260922000004_admin.sql) returns at most 500 newest records. The React detail page searches only that returned array, so older accessible records can produce a 404. Server-side filtering, pagination and a separately authorized record lookup are needed. Several generic resources are read-only; old custom actions, delete/duplicate operations, relationships and audit views are not covered by having a menu entry.

11. **Media, discovery and compatibility remain partial.** Source album/image detail URLs, photo offers, self-shot bookings, review state, video upload/download/transcoding, bulk photo download and Drive/Dropbox behavior are not all present. The new photographer flow also requires an authenticated matching email where the old flow used possession of a link; existing links require an explicit migration decision. Source recommendation ranking, campaign/theme pages, feeds, calendar events, short links, SEO redirects and full sitemap coverage are incomplete. The new related-listings component takes the first three other listings rather than using the source recommendation rules. The sitemap currently includes locale roots and listings, omitting editorial and brand/model URLs.

12. **The source's operational interfaces are absent.** CLI endpoints, external lot/sales/comparable/report APIs, LLM tool definitions, Slack events/interactions, provider callbacks, scrapers, imports and newsletter synchronization need Supabase implementations or an explicitly accepted retirement decision. The complete list is in `workflow-coverage.json`. Copying an internal helper without its authorization, caller and side effects does not close a workflow.

## Claude functionality and prior analysis

The old [AI client](https://github.com/biddershighway/highway/blob/0bae38c04fb0e6c9510d7bba659c151f456c095d/app/models/ai.rb) uses Anthropic with quality tiers, structured output and model-specific options. Those source model identifiers are code evidence, not a claim that a particular provider model is currently available to the new project.

| Source capability | Source implementation | Target main |
| --- | --- | --- |
| Comparable search-query generation | `app/services/leads/search_query_generator.rb` | Missing |
| Lead qualification and valuation | `app/jobs/valuate_lead_job.rb` | Missing |
| Comparable normalization and ranking | `app/models/vehicle_name.rb`, `vehicle_match.rb`, `reported_auction.rb` | Missing |
| Swedish vehicle text from questionnaire | `write_lot_text_job.rb`, `filter/questionnaire_prompt_component.rb` | Missing |
| Excerpt and categories | `write_lot_summary_job.rb` | Missing |
| Vehicle translation | `translate_lot_text_job.rb` | Missing |
| Classified classification | `classify_classified_job.rb` | Missing |
| Blocket classified translation/excerpts | `write_blocketization_texts_job.rb` | Missing |
| Brand introduction in sv/en/de | `write_brand_summary_job.rb` | Missing |
| Model introduction in sv/en/de | `write_vehicle_model_summary_job.rb` | Missing |
| Blog translation and stable translated slugs | `translate_blog_post_job.rb` | Missing |
| Informational-page translation | `filter/pages_controller.rb` | Missing |
| External sales-report toolkit, comparable search and report creation | `app/services/llm/sales_report_toolkit.rb`, `app/controllers/api/` | Missing |

Critical behaviors to retain include separate qualification and valuation; collection/estate placeholder handling without a model call; five query candidates, eight comparisons per query and final top-eight report matches; valuation returned as integer SEK and converted once to cents; preserving an existing report when no comparisons are found; curated lot categories taking precedence; maximum 120-character excerpts; Swedish questionnaire labels and condition wording; HTML structure and existing translated slugs being preserved. Production credentials must stay in Supabase, not React or Next public environment variables.

**Prior Claude repository review: not located.** The current old-main tree contains `.claude/skills/production-db/`, which is a database-query skill, not a repository analysis. GitHub issue/PR searches for Claude and Claude analysis did not locate that review. PR #1709, “Claude transports,” has no description. The new `CLAUDE.md` only refers to `AGENTS.md`. The old tree also contains `Bidders-Highway-SEO-Audit-2026-09-16.pdf`; its filename alone does not establish that it is the requested Claude code review. This remains unresolved rather than being labelled reviewed.

## Coverage artifacts and limits

- `main-comparison-inventory.json`: 1,344 tracked source files with Git blob IDs, SHA-256 checksums, GitHub permalinks and 6,090 lexically detected Ruby method locations. This includes 263 controller files, 86 job files, 148 model files, 71 policy files, 17 service files, 18 mailer files, 572 view files and other application/configuration files.
- `workflow-coverage.json`: every controller and job file is accounted for, with related target paths and explicit `partial`, `missing` or `framework_review` status. This is a workflow mapping, not a percentage of ported functions. Some source files are support code or legacy controllers not currently routed; retiring them requires an explicit decision.
- `schema-diff.json`: 30 table/column differences, including two missing tables, 20 added columns, one nullability change and seven legacy columns removed in the source. It is evidence, not executable migration SQL.
- `rails-routes-main-20261015.rb`: routes from the exact old-main commit, alongside the preserved earlier route snapshot.

Rebuild the source/schema inventory from a clean direct GitHub clone using:

```sh
node scripts/compare-highway.mjs /path/to/highway
```

The script verifies both repository identities, pinned commits and each source file against its Git blob. It refuses a different source or target instead of silently comparing another checkout. The controller/job mapping is reviewed separately. No exhaustive behavioral parity claim is made for every method, inherited Rails action or view.

## Changes and validation

The seller minimum is corrected in `src/lib/domain/auctions.ts` and `supabase/migrations/20261015000100_seller_commission_minimum.sql`. The original nine migrations remain byte-for-byte unchanged. Five source-derived fee cases cover below-minimum, minimum, above-minimum, waived and higher-rate fees. The SQL harness also exercises these through `public.auction_command('purchase', ...)`, checks VAT and verifies that purchase does not falsely mark an invoice paid.

Baseline checks on the unmodified GitHub application: 50 unit tests, lint, TypeScript, production build and disposable PostgreSQL tests passed. The new regression cases first reproduced two failures in target main; after the fix, 55 unit tests and the extended SQL suite passed. Hosted Supabase, live identity/payment providers, real emails and model calls were not exercised. No database migration or application change was deployed and no GitHub branch was merged.

## Completion criterion for the requested full port

Keep a source workflow open until it has a React/Next entry point where applicable, Supabase business logic, source-equivalent authorization and state transitions, all required side effects and a meaningful parity test. Verify with anonymous, buyer, seller, assigned staff, administrator and photographer roles. Record deliberate compatibility changes separately. Full migration remains incomplete while any required workflow is `missing`, `partial` or unverified; a passing build or copied schema is insufficient.
