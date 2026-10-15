// Read-only integration check. Never executes mutations or prints credentials.
import assert from "node:assert/strict";
import { readDatabase } from "../src/lib/site/read-database.js";
import {
  catalogSql,
  auctionSql,
  classifiedSql,
  brandsSql,
} from "../src/lib/site/public-queries.js";

const [transaction] = await readDatabase(
  "SELECT current_setting('transaction_read_only') AS mode",
);
assert.equal(transaction.mode, "on");
const rows = await readDatabase(catalogSql, ["sv"]);
assert.ok(rows.filter((item) => item.listing_type === "classified").every((item) => !item.no_reserve && !item.reserve_met && !item.reserve_close));
const brands = await readDatabase(brandsSql, ["sv"]);
for (const [type, query, key] of [
  ["auction", auctionSql, "auction"],
  ["classified", classifiedSql, "classified"],
]) {
  const sample = rows.find((item) => item.listing_type === type);
  if (!sample) continue;
  const [result] = await readDatabase(query, [sample.slug, "sv"]);
  assert.ok(result?.[key]?.title);
  const forbidden = new Set([
    "email",
    "phone",
    "seller_id",
    "buyer_id",
    "lead_id",
    "pipedrive_owner_data",
    "reserve_price_cents",
    "data_vin",
    "registration_number",
    "payment_intent_id",
  ]);
  function check(value) {
    if (!value || typeof value !== "object") return;
    for (const [field, child] of Object.entries(value)) {
      assert.ok(
        !forbidden.has(field),
        `Private field in ${type} projection: ${field}`,
      );
      check(child);
    }
  }
  check(result[key]);
  if (result[key].vin) assert.match(result[key].vin, /\*+$/);
  assert.deepEqual(
    await readDatabase(query, ["__missing_public_reader_check__", "sv"]),
    [],
  );
}
console.log(
  `Read-only transaction verified; ${rows.length} published listings, ${brands.length} brands; auction/classified projections passed.`,
);
