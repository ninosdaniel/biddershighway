import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { buildListingSearchIndex, buildSearchableOptions, fetchListings, mapListing } from "./liveListings.js";

const baseUrl = "https://images.example.com/";
const vehicle = {
  id: "1",
  listing_type: "auction",
  title: "1988 Porsche 928 S4",
  description: "A silver coupe",
  location: "Stockholm",
  hero_image_filename: "car.jpg",
  lifecycle_status: "live",
  ends_at: "2026-10-20T12:30:00Z",
  price_cents: 13250000,
  price_currency: "SEK",
  hidden_sale_price: false,
};

function mockClient(fetch) {
  return createClient("https://example.supabase.co", "sb_publishable_test", {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test("maps database cents, image filenames, model year and Stockholm times", () => {
  const listing = mapListing(vehicle, baseUrl);
  assert.equal(listing.id, "auction:1");
  assert.equal(listing.price.replace(/\s/g, " "), "132 500 SEK");
  assert.equal(listing.year, "1988");
  assert.equal(listing.image, `${baseUrl}car.jpg`);
  assert.equal(listing.timing, "Ends 20 Oct, 14:30");
  assert.ok(buildListingSearchIndex(listing).includes("silver coupe"));
  assert.ok(buildSearchableOptions([listing]).includes(vehicle.title));
});

test("handles null fields, hidden prices and unsafe image URLs", () => {
  const empty = mapListing({ id: "2", listing_type: "classified" }, baseUrl);
  assert.equal(empty.title, "Vehicle listing");
  assert.equal(empty.price, "Price on request");
  assert.equal(empty.image, null);
  assert.equal(empty.timing, "Available now");
  const hidden = mapListing({ ...vehicle, hidden_sale_price: true, lifecycle_status: "sold", hero_image_filename: "javascript:alert(1)" }, baseUrl);
  assert.equal(hidden.price, "Price undisclosed");
  assert.equal(hidden.timing, "Sold");
  assert.equal(hidden.image, null);
  assert.doesNotThrow(() => buildSearchableOptions([empty, hidden]));
});

test("loads multiple pages through the Supabase SDK without private columns", async () => {
  const requests = [];
  const client = mockClient(async (input, options) => {
    assert.equal(options.method, "GET");
    const url = new URL(input);
    requests.push(url);
    const offset = Number(url.searchParams.get("offset"));
    const count = offset === 0 ? 100 : 1;
    return new Response(JSON.stringify(Array.from({ length: count }, (_, i) => ({ ...vehicle, id: String(offset + i) }))), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const listings = await fetchListings(client, { imageBaseUrl: baseUrl });
  assert.equal(listings.length, 101);
  assert.equal(listings[100].id, "auction:100");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].pathname, "/rest/v1/rpc/get_website_listings");
  assert.equal(requests[1].searchParams.get("offset"), "100");
  assert.equal(requests[0].searchParams.get("limit"), "100");
  for (const field of ["reserve_price_cents", "registration_number", "seller_id"]) {
    assert.ok(!requests[0].searchParams.get("select").includes(field));
  }
});

test("returns an empty list for an empty database and propagates permission errors", async () => {
  const empty = mockClient(async () => new Response("[]", { status: 200 }));
  assert.deepEqual(await fetchListings(empty), []);
  const denied = mockClient(async () => new Response(JSON.stringify({ code: "42501", message: "permission denied" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  }));
  await assert.rejects(fetchListings(denied), { code: "42501" });
});

test("passes cancellation to in-flight database requests", async () => {
  const controller = new AbortController();
  const client = mockClient(async (_input, options) => {
    assert.equal(options.signal, controller.signal);
    controller.abort();
    throw new DOMException("Aborted", "AbortError");
  });
  await assert.rejects(fetchListings(client, { signal: controller.signal }));
});
