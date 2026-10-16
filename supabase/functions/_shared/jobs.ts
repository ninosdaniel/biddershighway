import { Database, env, fetchJson, rpc } from "./http.ts";
import { scrapeBilweb, scrapeSajab } from "./scrapers.ts";
import { fortnox, invoicePaid } from "./fortnox.ts";
import { reconcileSwish } from "./swish.ts";
import { ensureCustomer } from "./billing.ts";
import { performAi } from "./ai.ts";
import { parseVehicle, savedSearchMatches } from "./vehicle-match.ts";

export type Job = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  lease_token: string;
  created_at: string;
};
const escape = (s: unknown) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const subjects: Record<string, string[]> = {
  conversation_message: ["New message about your classified", "Nytt meddelande om din annons", "Neue Nachricht zu Ihrem Inserat"],
  saved_search_match: ["A vehicle matches your saved search", "Ett fordon matchar din bevakning", "Ein Fahrzeug passt zu Ihrer gespeicherten Suche"],
  outbid: [
    "You have been outbid",
    "Du har blivit överbjuden",
    "Sie wurden überboten",
  ],
  new_bid: [
    "A new bid on your auction",
    "Nytt bud på din auktion",
    "Neues Gebot für Ihre Auktion",
  ],
  auction_won: [
    "You won the auction",
    "Du vann auktionen",
    "Sie haben die Auktion gewonnen",
  ],
  auction_sold: [
    "Your vehicle is sold",
    "Ditt fordon är sålt",
    "Ihr Fahrzeug wurde verkauft",
  ],
  auction_unsold: [
    "Your auction has ended",
    "Din auktion har avslutats",
    "Ihre Auktion ist beendet",
  ],
  ending_soon: [
    "An auction you follow ends soon",
    "En auktion du följer avslutas snart",
    "Eine beobachtete Auktion endet bald",
  ],
  ending_in_fifteen_minutes: [
    "15 minutes remaining",
    "15 minuter kvar",
    "Noch 15 Minuten",
  ],
  payment_received: [
    "Payment received",
    "Betalning mottagen",
    "Zahlung eingegangen",
  ],
  buyer_paid: [
    "The buyer has paid",
    "Köparen har betalat",
    "Der Käufer hat bezahlt",
  ],
  daily_update: [
    "Today's auctions",
    "Dagens auktioner",
    "Die heutigen Auktionen",
  ],
};
async function email(db: Database, job: Job) {
  const user = await rpc(db, "website_job_data", {
    p_kind: "email",
    p_payload: job.payload,
  });
  if (!user?.email || user.disabled) return;
  const locale = ["en", "sv", "de"].includes(user.locale) ? user.locale : "en";
  const n = ["en", "sv", "de"].indexOf(locale);
  const subject = (subjects[String(job.payload.template)] || [
    "Bidders Highway update",
    "Uppdatering från Bidders Highway",
    "Neuigkeiten von Bidders Highway",
  ])[n];
  const destination = job.payload.conversation_id
    ? `/${locale}/account/conversations/${encodeURIComponent(String(job.payload.conversation_id))}`
    : job.payload.slug
    ? `/${locale}/auctions/${encodeURIComponent(String(job.payload.slug))}`
    : `/${locale}/account`;
  const url = new URL(destination, env("SITE_URL")).href;
  const slugs = Array.isArray(job.payload.slugs) ? job.payload.slugs : [];
  const label = ["View your account", "Visa ditt konto", "Konto öffnen"][n];
  await fetchJson("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": job.id,
    },
    body: JSON.stringify({
      from: env("EMAIL_FROM"),
      to: [user.email],
      subject,
      text: `${subject}\n\n${url}`,
      html: `<h1>${escape(subject)}</h1><p>${escape(user.name)}</p><p><a href="${escape(url)}">${label}</a></p>${slugs.map((slug) => `<p><a href="${escape(new URL(`/${locale}/auctions/${encodeURIComponent(String(slug))}`, env("SITE_URL")).href)}">${escape(slug)}</a></p>`).join("")}`,
    }),
  });
}
async function syncPayments(db: Database, job: Job) {
  const payments = await rpc(db, "website_job_data", {
    p_kind: "payments",
    p_payload: {},
  });
  for (const payment of payments) {
    if (payment.provider !== "fortnox" || !payment.provider_id) continue;
    await rpc(db, "website_enqueue_continuation", {
      p_kind: "payment_check",
      p_key: `${job.dedupe_key}:${payment.id}`,
      p_payload: { payment },
    });
  }
  const instructions = await rpc(db, "website_pending_swish");
  for (const instruction of instructions)
    await rpc(db, "website_enqueue_continuation", {
      p_kind: "swish_check",
      p_key: `${job.dedupe_key}:swish:${instruction}`,
      p_payload: { instruction_id: instruction },
    });
}
async function checkPayment(db: Database, payment: Record<string, unknown>) {
  const response = await fortnox(
    `invoices/${encodeURIComponent(String(payment.provider_id))}`,
  );
  const invoice = response.Invoice;
  // Missing/unknown balances never count as settled, nor do cancelled/credit invoices.
  if (invoicePaid(invoice, Number(payment.amount_cents))) {
    await rpc(db, "website_record_payment", {
      p_id: payment.id,
      p_provider: "fortnox",
      p_provider_id: payment.provider_id,
      p_paid: true,
    });
  }
}

export async function perform(db: Database, job: Job) {
  if (job.kind === "ai") {
    await performAi(db, job);
  } else if (job.kind === "saved_search_matches") {
    const batch = await rpc(db, "website_saved_search_batch", { p_auction: job.payload.auction_id, p_after: job.payload.after || null });
    for (const search of batch.searches) if (savedSearchMatches(search.term, batch.text)) {
      await rpc(db, "website_saved_search_notify", { p_auction: job.payload.auction_id, p_search: search.id });
    }
    if (batch.searches.length === 500) await rpc(db, "website_enqueue_continuation", {
      p_kind: "saved_search_matches", p_key: `saved-search:${job.payload.auction_id}:${batch.searches.at(-1).id}`,
      p_payload: { auction_id: job.payload.auction_id, after: batch.searches.at(-1).id },
    });
  } else if (
    ["refresh_listings", "compute_interests", "daily_update"].includes(job.kind)
  ) {
    await rpc(db, "website_maintenance", { p_kind: job.kind });
  } else if (job.kind === "email") {
    await email(db, job);
  } else if (
    [
      "bid_notifications",
      "offer_notification",
      "auction_live",
      "lower_reserve",
      "ending_soon",
      "ending_in_fifteen_minutes",
      "rerun_question",
      "sold_followup",
    ].includes(job.kind)
  ) {
    await rpc(db, "website_expand_notifications", {
      p_kind: job.kind,
      p_key: job.dedupe_key,
      p_payload: job.payload,
    });
    if (job.kind === "auction_live") await rpc(db, "website_enqueue_continuation", {
      p_kind: "saved_search_matches", p_key: `saved-search:${job.payload.auction_id}`,
      p_payload: { auction_id: job.payload.auction_id },
    });
  } else if (job.kind === "sync_payments") {
    await syncPayments(db, job);
  } else if (job.kind === "payment_check") {
    await checkPayment(db, job.payload.payment as Record<string, unknown>);
  } else if (job.kind === "swish_check") {
    const order = await rpc(db, "website_swish_provider", {
      p_instruction: job.payload.instruction_id,
    });
    if (order) await reconcileSwish(db, order);
  } else if (job.kind === "generate_sitemap") {
    const auctions = await rpc(db, "website_job_data", {
      p_kind: "sitemap",
      p_payload: {},
    });
    const urls = ["en", "sv", "de"].flatMap((locale) =>
      [
        "",
        "/questions",
        "/posts",
        "/sales_inquiries/new",
        ...auctions.map(
          (a: { slug: string }) => `/auctions/${encodeURIComponent(a.slug)}`,
        ),
      ].map(
        (p) =>
          `<url><loc>${escape(new URL(`/${locale}${p}`, env("SITE_URL")).href)}</loc></url>`,
      ),
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
    const { error } = await db.storage
      .from("website-public")
      .upload("sitemap.xml", xml, {
        contentType: "application/xml",
        upsert: true,
      });
    if (error) throw new Error("sitemap_upload_failed");
  } else if (job.kind === "scrape_bilweb") {
    await scrapeBilweb(db);
  } else if (job.kind === "scrape_sajab") {
    // Continuations keep large historical imports within an Edge invocation.
    for (const category of [215, 251]) {
      const pages = await scrapeSajab(db, category, 1);
      for (let page = 2; page <= pages; page++)
        await rpc(db, "website_enqueue_continuation", {
          p_kind: "scrape_sajab_page",
          p_key: `${job.dedupe_key}:${category}:${page}`,
          p_payload: { category, page },
        });
    }
  } else if (job.kind === "scrape_sajab_page") {
    await scrapeSajab(
      db,
      Number(job.payload.category),
      Number(job.payload.page),
    );
  } else if (job.kind === "lead_received") {
    const lead = await rpc(db, "website_job_data", {
      p_kind: "lead",
      p_payload: job.payload,
    });
    if (!lead) return;
    await fetchJson("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": job.id,
      },
      body: JSON.stringify({
        from: env("EMAIL_FROM"),
        to: [env("SUPPORT_EMAIL")],
        reply_to: lead.email,
        subject: `Sales inquiry: ${lead.registration_number}`,
        text: [
          lead.owner,
          lead.email,
          lead.phone,
          lead.registration_number,
          lead.comment,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    });
  } else if (job.kind === "report_sale") {
    const source = await rpc(db, "website_sale_report_source", { p_auction: job.payload.auction_id });
    if (source) {
      const parsed = parseVehicle(source.name);
      await rpc(db, "website_record_sale_report", {
        p_auction: job.payload.auction_id, p_make: parsed.make, p_tokens: parsed.tokens.join(" "),
      });
    }
  } else if (job.kind === "settlement") {
    const payments = await rpc(db, "website_job_data", {
      p_kind: "settlement",
      p_payload: job.payload,
    });
    for (const payment of payments)
      await rpc(db, "website_enqueue_continuation", {
        p_kind: "invoice_issue",
        p_key: `invoice-issue:${payment.id}`,
        p_payload: {
          auction_id: job.payload.auction_id,
          payment_id: payment.id,
        },
      });
  } else if (job.kind === "invoice_issue") {
    await createInvoices(db, job);
  } else throw new Error("unsupported_job");
}

async function createInvoices(db: Database, job: Job) {
  const payments = await rpc(db, "website_job_data", {
    p_kind: "settlement",
    p_payload: job.payload,
  });
  for (const payment of payments.filter(
    (p: { id: string }) => p.id === job.payload.payment_id,
  )) {
    let number = payment.provider_id;
    if (!number) {
      // Fortnox has no guaranteed idempotency key. Reserve the external create
      // before issuing; a crash/timeout requires reconciliation, never a blind
      // second invoice. Completed creates replay their durable result.
      const customer = await ensureCustomer(db, payment.user_id);
      const operation = await rpc(db, "website_provider_operation", {
        p_key: `invoice:${payment.id}`,
        p_result: null,
      });
      if (operation.status === "started")
        throw new Error("invoice_reconciliation_required");
      if (operation.result?.number) number = operation.result.number;
      else {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() + 3);
        const response = await fortnox("invoices", {
          method: "POST",
          body: JSON.stringify({
            Invoice: {
              CustomerNumber: customer.number,
              Currency: "SEK",
              VATIncluded: true,
              InvoiceType: "INVOICE",
              Language: customer.locale === "sv" ? "SV" : "EN",
              InvoiceDate: new Date().toISOString().slice(0, 10),
              TermsOfPayment: "3",
              DueDate: date.toISOString().slice(0, 10),
              Comments: `Bidders Highway ${payment.id}`,
              InvoiceRows: [
                {
                  ArticleNumber: "3",
                  DeliveredQuantity: 1,
                  Description:
                    payment.kind === "buyer_commission"
                      ? "Slagavgift"
                      : "Säljaravgift",
                  Price: Number(payment.amount_cents) / 100,
                },
              ],
            },
          }),
        });
        if (
          !response.Invoice?.DocumentNumber ||
          Math.round(Number(response.Invoice.Total) * 100) !==
            Number(payment.amount_cents)
        )
          throw new Error("invoice_total_reconciliation_required");
        number = String(response.Invoice.DocumentNumber);
        await rpc(db, "website_provider_operation", {
          p_key: `invoice:${payment.id}`,
          p_result: { number },
        });
      }
      await rpc(db, "website_record_payment", {
        p_id: payment.id,
        p_provider: "fortnox",
        p_provider_id: number,
        p_paid: false,
      });
    }
    const response = await fortnox(`invoices/${encodeURIComponent(number)}`);
    if (!response.Invoice.Booked)
      await fortnox(`invoices/${encodeURIComponent(number)}/bookkeep`, {
        method: "PUT",
      });
  }
}
