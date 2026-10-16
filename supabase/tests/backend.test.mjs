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
  await db.exec(await fs.readFile(new URL("./fixtures/customer-schema.sql", import.meta.url), "utf8"));
  await db.exec(await fs.readFile(new URL("./fixtures/editorial-schema.sql", import.meta.url), "utf8"));
  for (const file of [
    "20261012000200_website_backend.sql",
    "20261012000300_website_jobs.sql",
    "20261012000400_website_queries.sql",
    "20261012000600_identity_orders.sql",
    "20261012000700_swish_payments.sql",
    "20261012000800_hidden_price_projection.sql",
    "20261015001100_customer_workflows.sql",
    "20261015001200_ai_workflows.sql",
    "20261015001300_saved_search_notifications.sql",
    "20261015001500_classified_management.sql",
    "20261015001600_vehicle_uploads.sql",
    "20261016001800_classified_ownership_and_upload_completion.sql",
    "20261016001900_purchase_checkout.sql",
    "20261016002000_questionnaire_ai_context.sql",
    "20261016002100_live_editorial.sql",
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

const classifiedCommand = (actor, action, input, request = crypto.randomUUID()) =>
  scalar("select public.website_classified_command($1,$2,$3,$4)", [actor, action, input, request]);
const classifiedInput = {
  manufacturer: "Porsche", model: "911", year: "1990", registration_number: "TEST",
  asking_price_cents: 5_000_000, body_sv: "<p>Test vehicle</p>", location: "Stockholm",
};

const customerCommand = (actor, action, input, request = crypto.randomUUID()) => scalar("select public.website_customer_command($1,$2,$3,$4)", [actor, action, input, request]);
async function advanceAi(runId, stage, context, result = null) {
  const job = (await db.query("update website_private.jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where payload->>'run_id'=$1 and payload->>'stage'=$2 returning id,lease_token", [runId,stage])).rows[0];
  await scalar("select public.website_ai_advance($1,$2,$3,$4,$5,$6)",[runId,stage,context,result,job.id,job.lease_token]);
  await scalar("select public.website_finish_job($1,$2)",[job.id,job.lease_token]);
}
test("Claude workflows require explicit staff access and protect newer edits", async () => {
  const lot = await scalar("insert into public.lots(name,registration_number,body_sv,created_at,updated_at) values('AI car','TEST','Original',now(),now()) returning id");
  await db.query("update public.users set role='admin' where id=(select user_id from website_private.accounts where auth_id=$1)",[rival]);
  await assert.rejects(scalar("select public.website_ai_request($1,'lot_summary',$2,$3)",[rival,lot,crypto.randomUUID()]), /forbidden/);
  await db.query("insert into website_private.staff(auth_id) values($1)",[seller]);
  await assert.rejects(scalar("select public.website_ai_request($1,'lot_summary',$2,$3)",[seller,lot,crypto.randomUUID()]), /ai_not_enabled/);
  await db.exec("update website_private.settings set value='true' where key='ai_enabled'");
  const request=crypto.randomUUID();
  const run=await scalar("select public.website_ai_request($1,'lot_summary',$2,$3)",[seller,lot,request]);
  assert.equal((await scalar("select public.website_ai_request($1,'lot_summary',$2,$3)",[seller,lot,request])).id,run.id);
  await assert.rejects(scalar("select public.website_ai_advance($1,'generate','{}','{}',$2,$3)",[run.id,crypto.randomUUID(),crypto.randomUUID()]), /stale_record/);
  await advanceAi(run.id,"generate",{}, {excerpt_sv:"A reviewed excerpt",categories:["Sportbilar"]});
  await db.query("update public.lots set body_sv='Human edit',updated_at=now() where id=$1",[lot]);
  await assert.rejects(scalar("select public.website_ai_apply($1,$2)",[seller,run.id]), /stale_record/);
  assert.equal(await scalar("select body_sv from public.lots where id=$1",[lot]),"Human edit");
  const fresh=await scalar("select public.website_ai_request($1,'lot_summary',$2,$3)",[seller,lot,crypto.randomUUID()]);
  await advanceAi(fresh.id,"generate",{}, {excerpt_sv:"A reviewed excerpt",categories:["Sportbilar"]});
  await assert.rejects(scalar("select public.website_ai_apply($1,$2)",[bidder,fresh.id]), /forbidden/);
  await scalar("select public.website_ai_apply($1,$2)",[seller,fresh.id]);
  await scalar("select public.website_ai_apply($1,$2)",[seller,fresh.id]);
  assert.equal(await scalar("select excerpt_sv from public.lots where id=$1",[lot]),"A reviewed excerpt");
  assert.equal(await scalar("select count(*)::int from public.taggings where taggable_id=$1",[lot]),1);
  await db.query("update public.users set role='normal_user' where id=(select user_id from website_private.accounts where auth_id=$1)",[rival]);
});

test("Claude valuation binds reports to retrieved evidence and converts SEK to cents once", async () => {
  const lead=await scalar("insert into public.leads(registration_number,data_manufacturer,data_model,email,created_at,updated_at) values('TEST','Porsche','911','private@example.test',now(),now()) returning id");
  const comparison=await scalar("insert into public.reported_auctions(name,body,search_tokens,highest_bid_amount_cents,url,closed_at,created_at,updated_at) values('Porsche 911','Test','porsche 911',45000000,'https://example.test/car',now(),now(),now()) returning id");
  const run=await scalar("select public.website_ai_request($1,'lead_valuation',$2,$3)",[seller,lead,crypto.randomUUID()]);
  const source=await scalar("select public.website_ai_run($1)",[run.id]);
  assert.ok(!JSON.stringify(source.source).includes("private@example.test"));
  await advanceAi(run.id,"queries",{comparisons:[{id:comparison}]});
  await advanceAi(run.id,"qualify",{qualification:{qualified:true,confidence:.8,notable:true,reasoning:"Collector car"}});
  await advanceAi(run.id,"value",{}, {qualified:true,confidence:.8,estimated_value:450000,reasoning:"Comparable sale",matches:[{id:comparison}]});
  const applied=await scalar("select public.website_ai_apply($1,$2)",[seller,run.id]);
  assert.equal(await scalar("select valuation_cents from public.sales_reports where id=$1",[applied.report_id]),45000000);
  await scalar("select public.website_ai_apply($1,$2)",[seller,run.id]);
  assert.equal(await scalar("select count(*)::int from public.sales_reports"),1);
  for(const signature of ["public.website_staff_data(uuid,text,uuid,text,integer)","public.website_ai_request(uuid,text,uuid,uuid)","public.website_ai_run(uuid)","public.website_reported_candidates(text[],text[],integer)","public.website_ai_apply(uuid,uuid)"]) {
    assert.equal(await scalar("select has_function_privilege('authenticated',$1,'execute')",[signature]),false);
  }
});
test("classified conversations preserve history, isolate members and deduplicate retries", async () => {
  const owner = await scalar("select user_id from website_private.accounts where auth_id=$1", [seller]);
  const lot = await scalar("insert into public.lots(name,registration_number,seller_id,created_at,updated_at) values('Classified','TEST',$1,now(),now()) returning id", [owner]);
  await db.query("insert into public.classifieds(lot_id,slug,published_status,created_at,updated_at) values($1,'message-car',1,now(),now())", [lot]);
  const request = crypto.randomUUID(), input = { slug: "message-car", body: "Is the service history available?" };
  const first = await customerCommand(bidder, "conversation_start", input, request);
  assert.deepEqual(await customerCommand(bidder, "conversation_start", input, request), first);
  assert.equal(await scalar("select count(*)::int from public.conversation_messages where conversation_id=$1", [first.id]), 1);
  assert.equal((await scalar("select public.website_conversations($1,$2)", [seller, first.id])).messages[0].body, input.body);
  await assert.rejects(scalar("select public.website_conversations($1,$2)", [rival, first.id]), /not_found/);
  await assert.rejects(customerCommand(rival, "conversation_reply", { id: first.id, body: "Intrusion" }), /not_found/);
  await assert.rejects(customerCommand(seller, "conversation_start", input), /own_listing/);
  await customerCommand(seller, "conversation_reply", { id: first.id, body: "Yes, it is." });
  assert.equal((await scalar("select public.website_conversations($1,$2)", [bidder, first.id])).messages.length, 2);
  const serialized = JSON.stringify(await scalar("select public.website_conversations($1,$2)", [bidder, first.id]));
  assert.ok(!serialized.includes("@example.test"));
  assert.ok(!serialized.includes("user_id"));
  for (const role of ["anon", "authenticated"]) assert.equal(await scalar("select has_function_privilege($1,'public.website_conversations(uuid,uuid,timestamp with time zone)','execute')", [role]), false);
});

test("saved searches belong to the confirmed account; preferences cannot change authority", async () => {
  const search = await customerCommand(bidder, "saved_search_create", { term: "Porsche 911", email: "other@example.test" });
  assert.equal((await customerCommand(bidder, "saved_search_create", { term: "porsche 911" })).id, search.id);
  await assert.rejects(customerCommand(rival, "saved_search_delete", { id: search.id }), /not_found/);
  const activity = await scalar("select public.website_account_activity($1)", [bidder]);
  assert.equal(activity.saved_searches[0].id, search.id);
  await customerCommand(bidder, "preferences", { locale: "de", email_features: false, role: "admin", verified: true });
  assert.equal(await scalar("select role from public.users where id=(select user_id from website_private.accounts where auth_id=$1)", [bidder]), "normal_user");
  await customerCommand(bidder, "saved_search_delete", { id: search.id });
  assert.equal((await scalar("select public.website_account_activity($1)", [bidder])).saved_searches.length, 0);
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

// Source: biddershighway/highway@0bae38c, app/services/sold_state.rb.
// Exercise this checkout's real bidding and settlement RPCs; its website_private
// schema differs from the app_private schema in BiddersHW/biddershighway.
for (const [price, rate, expected] of [
  [5_000_000, 2.5, 200_000],
  [8_000_000, 2.5, 200_000],
  [12_000_000, 2.5, 240_000],
  [5_000_000, 0, 0],
  [30_000_000, 10, 2_400_000],
]) {
  test(`source seller fee: ${price} cents at ${rate}% settles to ${expected} cents before VAT`, async () => {
    const slug = `seller-fee-${price}-${rate}`;
    const id = await auction(slug, price);
    await db.query(
      "update public.auctions set commission_seller_percent=$2 where id=$1",
      [id, rate],
    );
    await command(bidder, "bid", {
      slug,
      amount_cents: price,
      auto_bid: false,
    });
    await db.query(
      "update public.auctions set closed_at=now()-interval '1 second' where id=$1",
      [id],
    );
    await scalar("select public.website_tick()");
    await scalar("select public.website_tick()");
    const sale = (await db.query(
      "select lifecycle_status,sale_price_cents,commission_seller_cents,commission_seller_vat,paid from public.auctions where id=$1",
      [id],
    )).rows[0];
    assert.equal(sale.lifecycle_status, 9);
    assert.equal(Number(sale.sale_price_cents), price);
    assert.equal(Number(sale.commission_seller_cents), expected);
    assert.equal(Number(sale.commission_seller_vat), 1.25);
    assert.equal(sale.paid, false);
    const payments = (await db.query(
      "select amount_cents,paid_at from website_private.payments where auction_id=$1 and kind='seller_commission'",
      [id],
    )).rows;
    assert.equal(payments.length, expected === 0 ? 0 : 1);
    if (expected > 0) {
      assert.equal(Number(payments[0].amount_cents), expected * 1.25);
      assert.equal(payments[0].paid_at, null);
    }
  });
}

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

test("unassigned and other sellers' classifieds reject unrelated customer edits", async () => {
  const draft = await classifiedCommand(rival, "classified_create", classifiedInput);
  const input = { ...classifiedInput, slug: draft.slug };
  await assert.rejects(classifiedCommand(bidder, "classified_update", input), /not_found/);
  await db.query("update public.lots set seller_id=null where id=(select lot_id from public.classifieds where id=$1)", [draft.id]);
  await assert.rejects(classifiedCommand(bidder, "classified_update", input), /not_found/);
  // Explicit staff may still manage unassigned records.
  assert.equal((await classifiedCommand(seller, "classified_update", input)).saved, true);
});

test("upload reservations enforce ownership even when a classified has no seller", async () => {
  const draft = await classifiedCommand(rival, "classified_create", classifiedInput);
  const input = { slug: draft.slug, filename: "photo.png", mime: "image/png", size: 8 };
  const reserve = actor => scalar("select public.website_vehicle_upload($1,'reserve',$2)", [actor, input]);
  await assert.rejects(reserve(bidder), /forbidden/);
  await db.query("update public.lots set seller_id=null where id=(select lot_id from public.classifieds where id=$1)", [draft.id]);
  await assert.rejects(reserve(bidder), /forbidden/);
  assert.ok((await reserve(seller)).id);
});

test("draft photo completion persists once, assigns the cover and isolates tickets", async () => {
  const request = crypto.randomUUID();
  const draft = await classifiedCommand(bidder, "classified_create", classifiedInput, request);
  assert.deepEqual(await classifiedCommand(bidder, "classified_create", classifiedInput, request), draft);
  const ticket = await scalar("select public.website_vehicle_upload($1,'reserve',$2)", [bidder, {
    slug: draft.slug, filename: "photo.png", mime: "image/png", size: 8,
  }]);
  const input = { id: ticket.id, url: "https://example.test/storage/v1/object/public/website-vehicle-images/test.png" };
  const complete = actor => scalar("select public.website_vehicle_upload($1,'complete',$2)", [actor, input]);
  await assert.rejects(complete(rival), /not_found/);
  const uploaded = await complete(bidder);
  assert.ok(uploaded.image_id);
  assert.equal((await complete(bidder)).image_id, uploaded.image_id);
  assert.equal(await scalar("select count(*)::int from public.images where id=$1", [uploaded.image_id]), 1);
  assert.equal(await scalar("select hero_image_filename from public.lots where id=(select lot_id from public.classifieds where id=$1)", [draft.id]), input.url);
  assert.equal(await scalar("select image_id from website_private.uploads where id=$1", [ticket.id]), uploaded.image_id);
});

const purchaseQuote = (actor, slug, kind = "purchase") => scalar("select public.website_purchase_quote($1,$2,$3)", [actor, slug, kind]);
const purchase = (actor, quote, request = crypto.randomUUID(), accepted = true) => scalar("select public.website_purchase($1,$2,$3,$4)", [actor, quote.id, accepted, request]);
async function buyable(slug, state = 6, price = 10_000_000) {
  const id = await auction(slug, price);
  await db.query("update public.auctions set lifecycle_status=$2 where id=$1", [id, state]);
  return id;
}

test("direct purchase settles the quoted price and fee once without marking paid", async () => {
  const id = await buyable("direct-purchase");
  await db.query("update public.auctions set commission_buyer_percent=10 where id=$1", [id]);
  const quote = await purchaseQuote(bidder, "direct-purchase");
  assert.equal(quote.price_cents, 10_000_000);
  assert.equal(quote.buyer_fee_ex_vat_cents, 800_000);
  assert.equal(quote.buyer_fee_cents, 1_000_000);
  assert.equal(quote.total_cents, 11_000_000);
  assert.equal(quote.seller_id, undefined);
  assert.equal(quote.seller_percent, undefined);
  const request = crypto.randomUUID();
  const receipt = await purchase(bidder, quote, request);
  assert.equal(receipt.purchased, true);
  assert.equal(receipt.paid, false);
  const row = (await db.query("select lifecycle_status,sale_type,sale_price_cents,paid,closed_at<now() as ended from public.auctions where id=$1", [id])).rows[0];
  assert.deepEqual(row, { lifecycle_status: 9, sale_type: "manual_sale", sale_price_cents: 10_000_000, paid: false, ended: true });
  assert.equal(Number(await scalar("select amount_cents from website_private.payments where auction_id=$1 and kind='buyer_commission'", [id])), quote.buyer_fee_cents);
  await db.query("update website_private.purchase_quotes set expires_at=now()-interval '1 day' where id=$1", [quote.id]);
  assert.deepEqual(await purchase(bidder, quote, request), receipt);
  await assert.rejects(purchase(bidder, quote), /purchase_unavailable/);
  for (const kind of ["settlement", "report_sale", "refresh_listings"])
    assert.equal(await scalar("select count(*)::int from website_private.jobs where kind=$2 and dedupe_key like '%'||$1", [id, kind]), 1);
  assert.equal(await scalar("select count(*)::int from website_private.payments where auction_id=$1", [id]), 2);
});

test("after-sales can purchase an unsold vehicle and closes outstanding offers", async () => {
  const id = await buyable("after-sale", 10, 2_000_000);
  const legacyBidder = await scalar("select user_id from website_private.accounts where auth_id=$1", [bidder]);
  await db.query("insert into public.offers(auction_id,user_id,amount_cents,status,created_at,updated_at) values($1,$2,1000000,'pending',now(),now())", [id, legacyBidder]);
  await db.query("update public.auctions set commission_seller_percent=0 where id=$1", [id]);
  const quote = await purchaseQuote(bidder, "after-sale", "after_sale");
  assert.equal(quote.buyer_fee_cents, 500_000); // Original minimum, including Swedish VAT.
  assert.equal((await purchase(bidder, quote)).total_cents, 2_500_000);
  assert.equal(await scalar("select lifecycle_status from public.auctions where id=$1", [id]), 9);
  assert.equal(await scalar("select status from public.offers where auction_id=$1", [id]), "rejected");
  assert.equal(await scalar("select count(*)::int from website_private.payments where auction_id=$1", [id]), 1);
});

test("purchase quotes apply the original fee cap and international-company VAT", async () => {
  const id = await buyable("purchase-tax", 6, 200_000_000);
  await db.query("update public.users set customer_type=2 where id=(select user_id from website_private.accounts where auth_id=$1)", [rival]);
  try {
    const quote = await purchaseQuote(rival, "purchase-tax");
    assert.equal(quote.buyer_fee_ex_vat_cents, 6_000_000);
    assert.equal(quote.buyer_fee_cents, 6_000_000);
    assert.equal(quote.total_cents, 206_000_000);
    await purchase(rival, quote);
    assert.equal(Number(await scalar("select amount_cents from website_private.payments where auction_id=$1 and kind='buyer_commission'", [id])), quote.buyer_fee_cents);
  } finally {
    await db.query("update public.users set customer_type=0 where id=(select user_id from website_private.accounts where auth_id=$1)", [rival]);
  }
});

test("purchase rejects changed prices, tax and commissions without creating a sale", async () => {
  const id = await buyable("changed-purchase");
  for (const [change, restore] of [
    ["update public.auctions set reserve_price_cents=11000000 where id=$1", "update public.auctions set reserve_price_cents=10000000 where id=$1"],
    ["update public.auctions set commission_buyer_percent=9 where id=$1", "update public.auctions set commission_buyer_percent=7.5 where id=$1"],
    ["update public.auctions set commission_seller_percent=2 where id=$1", "update public.auctions set commission_seller_percent=2.5 where id=$1"],
    ["update public.users set customer_type=2 where id=(select buyer.user_id from website_private.accounts buyer where auth_id='11111111-1111-4111-8111-111111111111') and exists(select 1 from public.auctions where id=$1)", "update public.users set customer_type=0 where id=(select buyer.user_id from website_private.accounts buyer where auth_id='11111111-1111-4111-8111-111111111111') and exists(select 1 from public.auctions where id=$1)"],
  ]) {
    const quote = await purchaseQuote(bidder, "changed-purchase");
    await db.query(change, [id]);
    await assert.rejects(purchase(bidder, quote), /purchase_quote_changed/);
    await db.query(restore, [id]);
  }
  assert.equal(await scalar("select count(*)::int from website_private.payments where auction_id=$1", [id]), 0);
  assert.equal(await scalar("select lifecycle_status from public.auctions where id=$1", [id]), 6);
});

test("competing purchase quotes yield one buyer and cannot cross accounts or reuse another request", async () => {
  await buyable("competing-purchase");
  const first = await purchaseQuote(bidder, "competing-purchase");
  const second = await purchaseQuote(rival, "competing-purchase");
  await assert.rejects(purchase(rival, first), /not_found/);
  const request = crypto.randomUUID();
  await purchase(bidder, first, request);
  await assert.rejects(purchase(rival, second), /purchase_unavailable/);
  await assert.rejects(purchase(bidder, second, request), /idempotency_conflict/);
});

test("purchase requires confirmation, a current quote and the enabled transaction gate", async () => {
  await buyable("purchase-gates");
  const quote = await purchaseQuote(bidder, "purchase-gates");
  await assert.rejects(purchase(bidder, quote, crypto.randomUUID(), false), /purchase_confirmation_required/);
  await db.exec("update website_private.settings set value='false' where key='transactions_enabled'");
  try { await assert.rejects(purchase(bidder, quote), /transactions_not_enabled/); }
  finally { await db.exec("update website_private.settings set value='true' where key='transactions_enabled'"); }
  await db.query("update website_private.purchase_quotes set expires_at=now()-interval '1 second' where id=$1", [quote.id]);
  await assert.rejects(purchase(bidder, quote), /purchase_quote_expired/);
  const fresh = await purchaseQuote(bidder, "purchase-gates");
  await db.query("update website_private.accounts set verified_at=null where auth_id=$1", [bidder]);
  try { await assert.rejects(purchase(bidder, fresh), /verification_required/); }
  finally { await db.query("update website_private.accounts set verified_at=now() where auth_id=$1", [bidder]); }
});

test("checkout availability rejects self-purchase and private, sold or invalid-price listings", async () => {
  const id = await buyable("availability");
  await assert.rejects(purchaseQuote(seller, "availability"), /seller_cannot_purchase/);
  await assert.rejects(purchaseQuote(bidder, "missing"), /purchase_unavailable/);
  for (const state of [2, 3, 4, 7, 9, 10]) {
    await db.query("update public.auctions set lifecycle_status=$2 where id=$1", [id, state]);
    await assert.rejects(purchaseQuote(bidder, "availability"), /purchase_unavailable/);
  }
  await db.query("update public.auctions set lifecycle_status=6 where id=$1", [id]);
  await assert.rejects(purchaseQuote(bidder, "availability", "after_sale"), /purchase_unavailable/);
  for (const assignment of ["published_status=0", "hidden_sale_price=true", "reserve_price_cents=0", "reserve_price_cents=null", "seller_id=null", "buyer_id=seller_id"]) {
    await db.query(`update public.auctions set ${assignment} where id=$1`, [id]);
    await assert.rejects(purchaseQuote(bidder, "availability"), /purchase_unavailable/);
    await db.query("update public.auctions set published_status=1,hidden_sale_price=false,reserve_price_cents=10000000,buyer_id=null,seller_id=(select user_id from website_private.accounts where auth_id=$2) where id=$1", [id, seller]);
  }
  const view = await scalar("select public.get_website_auction('availability','en')");
  assert.equal(view.purchase_kind, "purchase");
  assert.equal(view.reserve_price_cents, undefined);
  await db.query("update public.auctions set lifecycle_status=10 where id=$1", [id]);
  assert.equal((await scalar("select public.get_website_auction('availability','en')")).purchase_kind, "after_sale");
  await db.query("update public.auctions set hidden_sale_price=true where id=$1", [id]);
  assert.equal((await scalar("select public.get_website_auction('availability','en')")).purchase_kind, null);
});

test("sale research upserts the committed price once and purchase RPCs remain service-only", async () => {
  const id = await buyable("purchase-research");
  await db.query("update public.lots set name='1990 Porsche 911',data='{\"data_year\":\"1990\"}' where id=(select lot_id from public.auctions where id=$1)", [id]);
  assert.equal(await scalar("select public.website_sale_report_source($1)", [id]), null);
  await purchase(bidder, await purchaseQuote(bidder, "purchase-research"));
  assert.deepEqual(await scalar("select public.website_sale_report_source($1)", [id]), { name: "1990 Porsche 911" });
  for (let i=0;i<2;i++) await scalar("select public.website_record_sale_report($1,'porsche','911')", [id]);
  const records = (await db.query("select sold,highest_bid_amount_cents,year,source from public.reported_auctions where url='https://www.biddershighway.com/sv/auctions/purchase-research'")).rows;
  assert.deepEqual(records, [{sold:true, highest_bid_amount_cents:10_000_000, year:1990, source:"biddershighway"}]);
  for (const role of ["anon", "authenticated"]) {
    for (const fn of ["website_purchase_quote(uuid,text,text)", "website_purchase(uuid,uuid,boolean,uuid)", "website_sale_report_source(uuid)", "website_record_sale_report(uuid,text,text)"])
      assert.equal(await scalar("select has_function_privilege($1,$2,'execute')", [role, "public."+fn]), false);
    assert.equal(await scalar("select has_table_privilege($1,'website_private.purchase_quotes','select')", [role]), false);
  }
});

test("Claude questionnaire snapshot includes vehicle type and safe fallbacks, and rejects stale drafts", async () => {
  const lead = await scalar("insert into public.leads(registration_number,data_manufacturer,data_model,data_year,data_odometer,car_info_data,created_at,updated_at) values('ABC123','Honda','CB750','1978',20450,$1,now(),now()) returning id", [{ result: { history: [{ type: "owner", city: "PRIVATE" }, { type: "registry" }, { type: "owner", name: "PRIVATE" }] } }]);
  const lot = await scalar("insert into public.lots(name,registration_number,lead_id,body_sv,created_at,updated_at) values('Honda CB750','ABC123',$1,'Human text',now(),now()) returning id", [lead]);
  const questionnaire = await scalar("insert into public.questionnaires(lead_id,form_type,answers,created_at,updated_at) values($1,1,'{\"engine_condition\":4}',now(),now()) returning id", [lead]);
  const run = await scalar("select public.website_ai_request($1,'lot_text',$2,$3)", [seller, lot, crypto.randomUUID()]);
  const source = (await scalar("select public.website_ai_run($1)", [run.id])).source;
  assert.deepEqual(source.questionnaire.answers, { engine_condition: 4 });
  assert.equal(source.questionnaire.form_type, 1);
  assert.equal(source.questionnaire.vehicle_name, "1978 Honda CB750");
  assert.equal(source.questionnaire.odometer, 20450);
  assert.equal(source.questionnaire.total_owners, 2);
  assert.ok(!JSON.stringify(source).includes("PRIVATE"));
  await advanceAi(run.id, "generate", {}, { body_sv: "<p>Draft based on the original answers</p>" });
  await db.query("update public.questionnaires set answers='{\"engine_condition\":1}',updated_at=now() where id=$1", [questionnaire]);
  await assert.rejects(scalar("select public.website_ai_apply($1,$2)", [seller, run.id]), /stale_record/);
  const fresh = await scalar("select public.website_ai_request($1,'lot_text',$2,$3)", [seller, lot, crypto.randomUUID()]);
  await advanceAi(fresh.id, "generate", {}, { body_sv: "<p>Fresh draft</p>" });
  await db.query("update public.leads set data_odometer=30000 where id=$1", [lead]);
  await assert.rejects(scalar("select public.website_ai_apply($1,$2)", [seller, fresh.id]), /stale_record/);
  assert.equal(await scalar("select body_sv from public.lots where id=$1", [lot]), "Human text");
});

test("purchase enforces accepted terms and billing details even after a quote is issued", async () => {
  const id = await buyable("purchase-account-gates");
  const quote = await purchaseQuote(bidder, "purchase-account-gates");
  await db.query("update public.users set accepted_terms_at='2020-01-01' where id=(select user_id from website_private.accounts where auth_id=$1)", [bidder]);
  try { await assert.rejects(purchase(bidder, quote), /terms_required/); }
  finally { await command(bidder, "accept_terms", { accepted: true }); }
  const address = await scalar("select address from website_private.accounts where auth_id=$1", [bidder]);
  await db.query("update website_private.accounts set address=address-'postal_code' where auth_id=$1", [bidder]);
  try { await assert.rejects(purchase(bidder, quote), /address_required/); }
  finally { await db.query("update website_private.accounts set address=$2 where auth_id=$1", [bidder, address]); }
  await db.query("update public.users set banned=true where id=(select user_id from website_private.accounts where auth_id=$1)", [bidder]);
  try { await assert.rejects(purchase(bidder, quote), /account_disabled/); }
  finally { await db.query("update public.users set banned=false where id=(select user_id from website_private.accounts where auth_id=$1)", [bidder]); }
  assert.equal(await scalar("select count(*)::int from website_private.payments where auction_id=$1", [id]), 0);
});

test("checkout cannot silently change the vehicle or reinterpret another currency as SEK", async () => {
  const id = await buyable("purchase-vehicle-currency");
  const quote = await purchaseQuote(bidder, "purchase-vehicle-currency");
  await db.query("update public.lots set name='Another vehicle',updated_at=now() where id=(select lot_id from public.auctions where id=$1)", [id]);
  await assert.rejects(purchase(bidder, quote), /purchase_quote_changed/);
  await db.query("update public.auctions set reserve_price_currency='EUR' where id=$1", [id]);
  await assert.rejects(purchaseQuote(bidder, "purchase-vehicle-currency"), /purchase_unavailable/);
  assert.equal((await scalar("select public.get_website_auction('purchase-vehicle-currency','en')")).purchase_kind, null);
  assert.equal(await scalar("select count(*)::int from website_private.payments where auction_id=$1", [id]), 0);
});

const editorial = (resource, locale = 'en', slug = null, page = 1, tag = null) =>
  scalar('select public.get_website_editorial($1,$2,$3,$4,$5)', [resource, locale, slug, page, tag]);
async function editorialFixture() {
  await db.exec('delete from public.blog_posts; delete from public.pages; delete from public.authors; delete from public.media_posts;');
  return scalar("insert into public.authors(name,slug,description_sv,description_en,description_de,created_at,updated_at) values('Test Author','test-author','Svensk bio','English biography','',now(),now()) returning id");
}
async function article(author, slug, published = '-1 hour') {
  return scalar("insert into public.blog_posts(author_id,name_sv,name_en,name_de,slug_sv,slug_en,slug_de,excerpt_sv,body_sv,published_at,created_at,updated_at) values($1,'Svensk titel','English title','',$2,$2||'-en',$2||'-de','Svensk ingress','<p>Published body</p>',now()+$3::interval,now(),now()) returning id", [author, slug, published]);
}
async function editorialPage(slug, published = '-1 hour', parent = null) {
  return scalar("insert into public.pages(slug,name_sv,name_en,name_de,body_sv,body_en,body_de,meta_description_sv,meta_description_en,meta_description_de,parent_id,published_at,created_at,updated_at) values($1,'Svensk sida','English page','','<p>Svensk sida</p>','<p>English page</p>','','Svensk beskrivning','English description','',$2,now()+$3::interval,now(),now()) returning id", [slug, parent, published]);
}

test('live editorial resolves translated URLs and field fallbacks, and immediately reflects edits and unpublishing', async () => {
  const author = await editorialFixture();
  const id = await article(author, 'tvättguiden:-exteriört');
  const upcoming = await article(author, 'unreleased', '1 day');
  let data = await editorial('post', 'de', 'tvättguiden:-exteriört-en');
  assert.equal(data.record.id, id);
  assert.equal(data.record.slug, 'tvättguiden:-exteriört-de');
  assert.equal(data.record.name, 'Svensk titel');
  assert.equal(data.record.excerpt, 'Svensk ingress');
  assert.equal(data.record.author.description, 'English biography');
  assert.deepEqual(Object.keys(data.record.author).sort(), ['description', 'name', 'slug']);
  for (const locale of ['en','sv','de']) assert.equal(await editorial('post', locale, 'unreleased'), null);
  await db.query("update public.blog_posts set name_de='Deutscher Titel',body_de='<p>Neue Übersetzung</p>',hero_image_filename='hero',hero_image_metadata='{\"main\":{},\"thumb\":{}}' where id=$1", [id]);
  data = await editorial('post', 'de', 'tvättguiden:-exteriört');
  assert.equal(data.record.body, '<p>Neue Übersetzung</p>');
  assert.equal(data.record.name, 'Deutscher Titel');
  assert.equal(data.record.image, await scalar("select md5('heromain')"));
  assert.equal((await editorial('posts', 'de')).hero.body, null);
  await db.query("update public.blog_posts set published_at=now()+interval '1 day' where id=$1", [id]);
  assert.equal(await editorial('post', 'en', 'tvättguiden:-exteriört'), null);
  assert.equal((await editorial('posts')).hero, null);
  assert.deepEqual((await editorial('author','en','test-author')).items, []);
  await db.query("update public.blog_posts set published_at=now()-interval '1 second' where id=$1", [upcoming]);
  assert.equal((await editorial('posts')).hero.id, upcoming);
});

test('editorial pagination preserves the Rails hero exclusion, 15-item limit, tag selection and author scope', async () => {
  const author = await editorialFixture();
  const ids = [];
  for (let i=0; i<33; i++) ids.push(await article(author, `story-${i}`, `-${i+1} minutes`));
  const first = await editorial('posts');
  const second = await editorial('posts', 'en', null, 2);
  const third = await editorial('posts', 'en', null, 3);
  assert.equal(first.hero.id, ids[0]);
  assert.equal(first.total, 32);
  assert.equal(first.page_size, 15);
  assert.equal(first.items.length, 15);
  assert.equal(second.hero, null);
  assert.equal(third.items.length, 2);
  const listed = [...first.items,...second.items,...third.items].map(p=>p.id);
  assert.equal(new Set(listed).size, 32);
  assert.ok(!listed.includes(ids[0]));
  const tag = await scalar("insert into public.tags(name,created_at,updated_at) values('guides',now(),now()) returning id");
  for (const id of [ids[0],ids[2]]) await db.query("insert into public.taggings(tag_id,taggable_type,taggable_id,context,created_at) values($1,'BlogPost',$2,'tags',now())",[tag,id]);
  const filtered = await editorial('posts','en',null,1,'guides');
  assert.equal(filtered.hero, null);
  assert.deepEqual(filtered.items.map(p=>p.id),[ids[0],ids[2]]);
  assert.deepEqual(filtered.items[0].tags,['guides']);
  const invalid = await editorial('posts','en',null,1,"guides' OR true");
  assert.equal(invalid.hero.id, ids[0]);
  assert.equal(invalid.tag, null);
  const authorPage = await editorial('author','en','test-author');
  assert.equal(authorPage.total,33);
  assert.equal(authorPage.items[0].id,ids[0]);
  const outsider = await article(crypto.randomUUID(),'other-author');
  assert.ok(!(await editorial('author','en','test-author')).items.some(p=>p.id===outsider));
  // A collision in another language must not override the requested locale.
  await db.query("update public.blog_posts set slug_sv='shared',slug_en='english-first' where id=$1",[ids[0]]);
  await db.query("update public.blog_posts set slug_en='shared' where id=$1",[ids[1]]);
  assert.equal((await editorial('post','en','shared')).record.id,ids[1]);
  assert.equal((await editorial('post','sv','shared')).record.id,ids[0]);
  assert.equal(await editorial('author','en','missing'),null);
});

test('pages hide drafts and private parents while exposing published children and English fallback', async () => {
  await editorialFixture();
  const root = await editorialPage('root');
  const child = await editorialPage('child','-1 hour',root);
  const future = await editorialPage('scheduled','1 day',root);
  await editorialPage('draft',null);
  assert.equal((await editorial('pages')).items.length,1);
  const data = await editorial('page','de','root');
  assert.equal(data.record.name,'English page');
  assert.equal(data.record.body,'<p>English page</p>');
  assert.equal(data.record.excerpt,'English description');
  assert.deepEqual(data.items.map(p=>p.id),[child]);
  assert.equal(data.items[0].body,null);
  assert.equal((await editorial('page','en','child')).parent.id,root);
  assert.equal(await editorial('page','en','scheduled'),null);
  assert.equal(await editorial('page','en','draft'),null);
  await db.query('update public.pages set published_at=null where id=$1',[root]);
  assert.equal((await editorial('page','en','child')).parent,null);
  assert.deepEqual((await editorial('pages')).items,[]);
  await db.query("update public.pages set published_at=now()-interval '1 second' where id=$1",[future]);
  assert.ok(await editorial('page','en','scheduled'));
});

test('article comments bind authors, reject private or unrelated parents, and retry without duplicates', async () => {
  const author = await editorialFixture();
  const post = await article(author,'comments');
  const other = await article(author,'other-comments');
  const future = await article(author,'hidden-comments','1 day');
  const request = crypto.randomUUID();
  const comment = (target,body,parent=null,id=crypto.randomUUID(),actor=bidder) => scalar('select public.website_post_comment($1,$2,$3,$4,$5)',[actor,target,body,parent,id]);
  await assert.rejects(comment(post,'',null),/invalid_comment/);
  await assert.rejects(comment(post,'x'.repeat(5001)),/invalid_comment/);
  await assert.rejects(comment(post,'Test',null,crypto.randomUUID(),crypto.randomUUID()),/authentication_required/);
  await assert.rejects(comment(future,'No access'),/not_found/);
  const created = await comment(post,'  Public comment  ',null,request);
  assert.equal(created.published,true);
  assert.deepEqual(await comment(post,'Public comment',null,request),created);
  await assert.rejects(comment(post,'Changed input',null,request),/idempotency_conflict/);
  assert.equal(await scalar('select count(*)::int from public.comments where commentable_id=$1',[post]),1);
  assert.equal(await scalar('select user_id from public.comments where id=$1',[created.id]),await scalar('select user_id from website_private.accounts where auth_id=$1',[bidder]));
  await assert.rejects(comment(other,'Cross-post parent',created.id),/not_found/);
  const reply = await comment(post,'A reply',created.id);
  let comments = (await editorial('post','en','comments')).comments;
  assert.equal(comments.length,2);
  assert.equal(comments.find(c=>c.id===reply.id).parent_id,created.id);
  assert.deepEqual(Object.keys(comments[0]).sort(),['author','body','created_at','id','parent_id']);
  await db.query('update public.comments set published_status=0 where id=$1',[created.id]);
  await assert.rejects(comment(post,'Private parent',created.id),/not_found/);
  comments=(await editorial('post','en','comments')).comments;
  assert.ok(!comments.some(c=>c.id===created.id));
  await db.query("update public.blog_posts set published_at=now()+interval '1 day' where id=$1",[post]);
  await assert.rejects(comment(post,'Now unpublished'),/not_found/);
  assert.equal(await editorial('post','en','comments'),null);
});

test('anonymous editorial reads expose only published podcasts and cannot execute private helpers or comment writes', async () => {
  const author = await editorialFixture();
  await article(author,'public-reading');
  await db.exec("insert into public.media_posts(name,link,summary,tag,published_at,created_at,updated_at) values('Released','https://example.test/podcast','Episode',1,now()-interval '1 day',now(),now()),('Scheduled','https://example.test/secret','PRIVATE',1,now()+interval '1 day',now(),now()),('Video','https://example.test/video','VIDEO',0,now(),now(),now())");
  await db.exec('set role anon');
  try {
    const data=await editorial('posts');
    assert.equal(data.hero.slug,'public-reading-en');
    assert.deepEqual(data.podcasts.map(p=>p.name),['Released']);
    assert.ok(!JSON.stringify(data).includes('PRIVATE'));
  } finally { await db.exec('reset role'); }
  for (const role of ['anon','authenticated']) {
    assert.equal(await scalar("select has_function_privilege($1,'public.get_website_editorial(text,text,text,integer,text)','execute')",[role]),true);
    assert.equal(await scalar("select has_function_privilege($1,'public.website_post_comment(uuid,uuid,text,uuid,uuid)','execute')",[role]),false);
    assert.equal(await scalar("select has_function_privilege($1,'website_private.editorial_post(public.blog_posts,text,boolean)','execute')",[role]),false);
  }
  await assert.rejects(editorial('post','fr','public-reading'),/invalid_input/);
  await assert.rejects(editorial('admin'),/invalid_input/);
});


test('reviewed Claude blog translations appear in the live reader only after apply', async () => {
  const author = await editorialFixture();
  const post = await article(author,'translated-story');
  const run = await scalar("select public.website_ai_request($1,'blog_translate',$2,$3)",[seller,post,crypto.randomUUID()]);
  await advanceAi(run.id,'generate',{}, {name_en:'Translated story',name_de:'Übersetzte Geschichte',excerpt_en:'New excerpt',excerpt_de:'Neuer Text',body_en:'<p>Reviewed English</p>',body_de:'<p>Geprüftes Deutsch</p>'});
  assert.equal((await editorial('post','de','translated-story')).record.body,'<p>Published body</p>');
  await scalar('select public.website_ai_apply($1,$2)',[seller,run.id]);
  const live=await editorial('post','de','translated-story');
  assert.equal(live.record.name,'Übersetzte Geschichte');
  assert.equal(live.record.body,'<p>Geprüftes Deutsch</p>');
  assert.equal(live.record.slug,'translated-story-de');
});
