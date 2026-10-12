import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { test, before, after } from "node:test";

let db;
const bidder = "11111111-1111-4111-8111-111111111111",
  rival = "22222222-2222-4222-8222-222222222222",
  seller = "33333333-3333-4333-8333-333333333333";
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const command = (actor, action, input, request = crypto.randomUUID()) =>
  scalar("select public.website_command($1,$2,$3,$4)", [
    actor,
    action,
    JSON.stringify(input),
    request,
  ]);
async function auction(slug = "car", price = 0, remaining = "1 hour") {
  const lot = await scalar(
    "insert into public.lots(name,registration_number,created_at,updated_at) values('Test car','TEST',now(),now()) returning id",
  );
  const legacySeller = await scalar(
    "select user_id from website_private.accounts where auth_id=$1",
    [seller],
  );
  return scalar(
    "insert into public.auctions(slug,lot_id,seller_id,published_status,lifecycle_status,highest_bid_amount_cents,reserve_price_cents,closed_at,created_at,updated_at) values($1,$2,$3,1,3,0,$4,now()+$5::interval,now(),now()) returning id",
    [slug, lot, legacySeller, price, remaining],
  );
}
before(async () => {
  db = new PGlite();
  await db.exec(
    await fs.readFile(
      new URL("./fixtures/highway-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const file of [
    "20261012000200_website_backend.sql",
    "20261012000300_website_jobs.sql",
    "20261012000400_website_queries.sql",
    "20261012000600_identity_orders.sql",
    "20261012000700_swish_payments.sql",
    "20261012000800_hidden_price_projection.sql",
  ]) {
    const sql = await fs.readFile(
      new URL("../migrations/" + file, import.meta.url),
      "utf8",
    );
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(
        `${file}: ${error.message}; position ${error.position}; ${error.internalQuery || sql.slice(Math.max(0, Number(error.position) - 120), Number(error.position) + 120)}`,
        { cause: error },
      );
    }
  }
  for (const id of [bidder, rival, seller]) {
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),\'{"name":"Tester"}\')',
      [id, `${id}@example.test`],
    );
    await scalar("select public.website_account($1)", [id]);
    // Match auth/legacy IDs in this synthetic fixture only.
    const legacy = await scalar(
      "select user_id from website_private.accounts where auth_id=$1",
      [id],
    );
    await db.query(
      "update website_private.accounts set user_id=$1 where auth_id=$2",
      [legacy, id],
    );
  }
  await db.exec(
    "update website_private.settings set value='true' where key in ('transactions_enabled','jobs_enabled')",
  );
});
after(async () => {
  await db?.close();
});

test("service-only backend and unconfirmed accounts cannot gain access", async () => {
  assert.equal(
    await scalar(
      "select has_function_privilege('anon','public.website_account(uuid)','execute')",
    ),
    false,
  );
  assert.equal(
    await scalar(
      "select has_function_privilege('authenticated','public.website_command(uuid,text,jsonb,uuid)','execute')",
    ),
    false,
  );
  await assert.rejects(
    scalar("select public.website_account($1)", [crypto.randomUUID()]),
    /authentication_required/,
  );
});

test("verification and current terms are mandatory, profile input cannot self-verify", async () => {
  await auction("gates");
  await assert.rejects(
    command(bidder, "bid", { slug: "gates", amount_cents: 100000 }),
    /terms_required/,
  );
  await command(bidder, "accept_terms", { accepted: true });
  await command(bidder, "profile", {
    name: "Tester",
    locale: "en",
    verified: true,
    line1: "Test",
    city: "City",
    country: "SE",
    phone: "+4600000000",
    postal_code: "12345",
  });
  await assert.rejects(
    command(bidder, "bid", { slug: "gates", amount_cents: 100000 }),
    /verification_required/,
  );
  for (const id of [bidder, rival, seller]) {
    await command(id, "accept_terms", { accepted: true });
    await command(id, "profile", {
      name: "Tester",
      locale: "en",
      line1: "Test",
      city: "City",
      country: "SE",
      phone: "+4600000000",
      postal_code: "12345",
    });
    await scalar("select public.website_verify_identity($1,$2,$3,$4)", [
      id,
      "stripe_identity",
      "vs_" + id,
      "evt_" + id,
    ]);
  }
});

test("proxy bidding, increments, own cap updates and retry idempotency", async () => {
  await auction("proxy");
  const req = crypto.randomUUID();
  const first = await command(
    bidder,
    "bid",
    { slug: "proxy", amount_cents: 1000000, auto_bid: true },
    req,
  );
  assert.equal(first.amount_cents, 100000);
  assert.deepEqual(
    await command(
      bidder,
      "bid",
      { slug: "proxy", amount_cents: 1000000, auto_bid: true },
      req,
    ),
    first,
  );
  assert.equal(await scalar("select count(*)::integer from public.bids"), 1);
  await assert.rejects(
    command(
      bidder,
      "bid",
      { slug: "proxy", amount_cents: 2000000, auto_bid: true },
      req,
    ),
    /idempotency_conflict/,
  );
  assert.equal(
    (
      await command(rival, "bid", {
        slug: "proxy",
        amount_cents: 500000,
        auto_bid: false,
      })
    ).amount_cents,
    600000,
  );
  await assert.rejects(
    command(rival, "bid", {
      slug: "proxy",
      amount_cents: 1000000,
      auto_bid: false,
    }),
    /bid_matches_existing_maximum/,
  );
  const before = await scalar("select count(*)::integer from public.bids");
  assert.equal(
    (
      await command(bidder, "bid", {
        slug: "proxy",
        amount_cents: 2000000,
        auto_bid: true,
      })
    ).amount_cents,
    600000,
  );
  assert.equal(
    await scalar("select count(*)::integer from public.bids"),
    before,
  );
  assert.equal(
    (
      await command(rival, "bid", {
        slug: "proxy",
        amount_cents: 2500000,
        auto_bid: false,
      })
    ).amount_cents,
    2500000,
  );
  assert.equal(
    await scalar("select website_private.bid_increment(10000000)"),
    250000,
  );
  assert.equal(
    await scalar("select website_private.bid_increment(50000000)"),
    500000,
  );
});

test("late bids extend old deadline; expired bids are rejected before a cron run", async () => {
  const id = await auction("late", 0, "60 seconds");
  const before = await scalar(
    "select closed_at from public.auctions where id=$1",
    [id],
  );
  await command(bidder, "bid", {
    slug: "late",
    amount_cents: 100000,
    auto_bid: false,
  });
  const after = await scalar(
    "select closed_at from public.auctions where id=$1",
    [id],
  );
  assert.equal(new Date(after) - new Date(before), 120000);
  await db.query(
    "update public.auctions set closed_at=now()-interval '1 second' where id=$1",
    [id],
  );
  await assert.rejects(
    command(rival, "bid", { slug: "late", amount_cents: 200000 }),
    /auction_closed/,
  );
});

test("settlement is replay safe and payment status only unlocks after verified payment", async () => {
  const id = await auction("sold", 100000);
  await command(bidder, "bid", { slug: "sold", amount_cents: 500000 });
  await db.query(
    "update public.auctions set closed_at=now()-interval '1 second' where id=$1",
    [id],
  );
  await scalar("select public.website_tick()");
  await scalar("select public.website_tick()");
  assert.equal(
    await scalar("select lifecycle_status from public.auctions where id=$1", [
      id,
    ]),
    9,
  );
  assert.equal(
    await scalar("select paid from public.auctions where id=$1", [id]),
    false,
  );
  const p = await scalar(
    "select id from website_private.payments where auction_id=$1 and kind='buyer_commission'",
    [id],
  );
  assert.equal(
    await scalar(
      "select amount_cents from website_private.payments where id=$1",
      [p],
    ),
    500000,
  );
  await scalar(
    "select public.website_record_payment($1,'fortnox','123',null,false)",
    [p],
  );
  assert.equal(
    await scalar("select paid from public.auctions where id=$1", [id]),
    false,
  );
  await scalar(
    "select public.website_record_payment($1,'fortnox','123',null,true)",
    [p],
  );
  assert.equal(
    await scalar("select paid from public.auctions where id=$1", [id]),
    true,
  );
  await assert.rejects(
    scalar(
      "select public.website_record_payment($1,'fortnox','WRONG',null,true)",
      [p],
    ),
    /payment_reference_mismatch/,
  );
});

test("job leases exclude duplicate workers and stale acknowledgements", async () => {
  const jobs = (await db.query("select * from public.website_claim_jobs(1)"))
    .rows;
  assert.equal(jobs.length, 1);
  const next = (await db.query("select * from public.website_claim_jobs(20)"))
    .rows;
  assert.equal(
    next.some((j) => j.id === jobs[0].id),
    false,
  );
  await scalar("select public.website_finish_job($1,$2,null)", [
    jobs[0].id,
    crypto.randomUUID(),
  ]);
  assert.equal(
    await scalar("select status from website_private.jobs where id=$1", [
      jobs[0].id,
    ]),
    "running",
  );
  await scalar("select public.website_finish_job($1,$2,null)", [
    jobs[0].id,
    jobs[0].lease_token,
  ]);
  assert.equal(
    await scalar("select status from website_private.jobs where id=$1", [
      jobs[0].id,
    ]),
    "done",
  );
});

test("seller cannot bid and auction snapshots never reveal reserve or private caps", async () => {
  await auction("privacy", 9000000);
  await assert.rejects(
    command(seller, "bid", { slug: "privacy", amount_cents: 100000 }),
    /seller_cannot_bid/,
  );
  await command(bidder, "bid", {
    slug: "privacy",
    amount_cents: 7000000,
    auto_bid: true,
  });
  const view = await scalar("select public.get_website_auction($1,$2)", [
    "privacy",
    "en",
  ]);
  assert.equal(view.amount_cents, 100000);
  assert.equal(JSON.stringify(view).includes("7000000"), false);
  assert.equal(JSON.stringify(view).includes("9000000"), false);
  assert.equal("seller_id" in view, false);
  await db.query(
    "update public.auctions set hidden_sale_price=true where slug='privacy'",
  );
  const hidden = await scalar("select public.get_website_auction($1,$2)", [
    "privacy",
    "en",
  ]);
  assert.equal(hidden.amount_cents, null);
  assert.equal(hidden.minimum_bid_cents, null);
  assert.equal(hidden.reserve_met, null);
  assert.deepEqual(hidden.bids, []);
  await db.query(
    "update public.auctions set published_status=0 where slug='privacy'",
  );
  assert.equal(
    await scalar("select public.get_website_auction($1,$2)", ["privacy", "en"]),
    null,
  );
});

test("lead writes are idempotent and detailed updates require the expiring capability", async () => {
  const request = crypto.randomUUID();
  const hash = "a".repeat(64);
  const input = {
    kind: "sale",
    email: "seller@example.test",
    phone: "+46123456789",
    registration_number: "TEST",
    owner: "Test",
  };
  const args = [JSON.stringify(input), request, hash];
  const first = await scalar(
    "select public.website_submit_lead($1,$2,$3)",
    args,
  );
  assert.deepEqual(
    await scalar("select public.website_submit_lead($1,$2,$3)", args),
    first,
  );
  await assert.rejects(
    scalar("select public.website_update_lead($1,$2,$3)", [
      first.id,
      "b".repeat(64),
      "{}",
    ]),
    /not_found/,
  );
  assert.equal(
    (
      await scalar("select public.website_update_lead($1,$2,$3)", [
        first.id,
        hash,
        '{"comment":"Test car"}',
      ])
    ).saved,
    true,
  );
});

test("pre-auction offers require verification; only the seller can accept", async () => {
  const id = await auction("offer", 100000);
  await db.query("update public.auctions set lifecycle_status=2 where id=$1", [
    id,
  ]);
  const offer = await command(bidder, "offer", {
    slug: "offer",
    amount_cents: 200000,
  });
  await assert.rejects(
    scalar("select public.website_offer_decision($1,$2,true)", [
      rival,
      offer.id,
    ]),
    /forbidden/,
  );
  assert.equal(
    (
      await scalar("select public.website_offer_decision($1,$2,true)", [
        seller,
        offer.id,
      ])
    ).saved,
    true,
  );
  assert.equal(
    (
      await scalar("select public.website_offer_decision($1,$2,true)", [
        seller,
        offer.id,
      ])
    ).saved,
    true,
  );
  assert.equal(
    await scalar("select lifecycle_status from public.auctions where id=$1", [
      id,
    ]),
    9,
  );
});

test("comments are moderated and duplicate submissions do not create duplicates", async () => {
  await auction("comments");
  const request = crypto.randomUUID();
  const args = [bidder, "comments", "A question about the car", request];
  const first = await scalar(
    "select public.website_comment($1,$2,$3,$4)",
    args,
  );
  assert.equal(first.moderation_pending, true);
  assert.deepEqual(
    await scalar("select public.website_comment($1,$2,$3,$4)", args),
    first,
  );
  assert.equal(
    (
      await scalar("select public.get_website_auction($1,$2)", [
        "comments",
        "en",
      ])
    ).comments.length,
    0,
  );
});

test("Swish checkout is owner-bound, has one active order, and settles once without inventing a bank reconciliation", async () => {
  const id = await auction("swish", 100000);
  await command(bidder, "bid", { slug: "swish", amount_cents: 500000 });
  await db.query(
    "update public.auctions set closed_at=now()-interval '1 second' where id=$1",
    [id],
  );
  await scalar("select public.website_tick()");
  const payment = await scalar(
    "select id from website_private.payments where auction_id=$1 and kind='buyer_commission'",
    [id],
  );
  await scalar(
    "select public.website_record_payment($1,'fortnox','1380',null,false)",
    [payment],
  );
  const request = crypto.randomUUID();
  const args = [bidder, payment, request];
  const order = await scalar(
    "select public.website_swish_order($1,$2,$3)",
    args,
  );
  assert.equal(order.status, "new");
  assert.equal(order.instruction_id.length, 32);
  assert.equal(
    (await scalar("select public.website_swish_order($1,$2,$3)", args)).id,
    order.id,
  );
  assert.equal(
    (
      await scalar("select public.website_swish_order($1,$2,$3)", [
        bidder,
        payment,
        crypto.randomUUID(),
      ])
    ).id,
    order.id,
  );
  await assert.rejects(
    scalar("select public.website_swish_order($1,$2,$3)", [
      rival,
      payment,
      request,
    ]),
    /not_found/,
  );
  await assert.rejects(
    scalar("select public.website_own_invoice($1,$2)", [rival, payment]),
    /not_found/,
  );
  assert.equal(
    await scalar("select public.website_swish_claim($1)", [order.id]),
    true,
  );
  assert.equal(
    await scalar("select public.website_swish_claim($1)", [order.id]),
    false,
  );
  await scalar("select public.website_swish_result($1,'CREATED')", [order.id]);
  assert.equal(
    await scalar("select paid from public.auctions where id=$1", [id]),
    false,
  );
  await scalar("select public.website_swish_result($1,'PAID','SWISHREF123')", [
    order.id,
  ]);
  await scalar("select public.website_swish_result($1,'PAID','SWISHREF123')", [
    order.id,
  ]);
  await scalar("select public.website_swish_result($1,'CREATED')", [order.id]);
  assert.equal(
    await scalar(
      "select status from website_private.swish_orders where id=$1",
      [order.id],
    ),
    "PAID",
  );
  assert.equal(
    await scalar("select paid from public.auctions where id=$1", [id]),
    true,
  );
  assert.equal(
    await scalar(
      "select reconciled_at from website_private.payments where id=$1",
      [payment],
    ),
    null,
  );
  assert.equal(
    await scalar(
      "select count(*)::integer from website_private.jobs where dedupe_key=$1",
      [
        `payment-buyer:${payment}:${await scalar("select user_id from website_private.accounts where auth_id=$1", [bidder])}`,
      ],
    ),
    1,
  );
  await assert.rejects(
    scalar("select public.website_swish_result($1,'PAID','DIFFERENT')", [
      order.id,
    ]),
    /payment_reference_mismatch/,
  );
  await assert.rejects(
    scalar("select public.website_swish_order($1,$2,$3)", args),
    /already_paid/,
  );
  assert.equal(
    await scalar(
      "select has_function_privilege('authenticated','public.website_swish_result(uuid,text,text)','execute')",
    ),
    false,
  );
});
