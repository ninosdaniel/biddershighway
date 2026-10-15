import { test } from "node:test";
import assert from "node:assert/strict";
import { filterListings, auctionImages } from "./listings.js";
import { aliasMatchLength, matchingEntry, brandListings } from "./brands.js";

const rows = [
  {
    id: "a",
    title: "1983 Porsche 911",
    manufacturer: "Porsche",
    model: "911 SC",
    vehicle_type: 0,
    listing_type: "auction",
    lifecycle_status: "live",
    categories: ["sports"],
    location: "Stockholm",
    price_cents: 20000,
    listed_at: "2026-10-01",
    ends_at: "2026-10-18",
  },
  {
    id: "b",
    title: "1990 Volvo 240",
    listing_type: "classified",
    lifecycle_status: "sold",
    categories: ["classic"],
    price_cents: 10000,
    listed_at: "2026-10-10",
  },
  {
    id: "c",
    title: "1985 Porsche 911 Turbo",
    manufacturer: "Porsche",
    model: "911 Turbo",
    vehicle_type: 0,
    listing_type: "auction",
    lifecycle_status: "sold",
    categories: ["sports"],
    hidden_sale_price: true,
    price_cents: 99999999,
    listed_at: "2026-10-05",
  },
];

test("catalog filters combine category, status, type, year and free text without changing source rows", () => {
  assert.deepEqual(
    filterListings(rows, {
      category: "sports",
      kind: "auction",
      lifecycle_status: "live",
      year_from: 1980,
      year_to: 1984,
      q: "stockholm",
    }).map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(filterListings(rows, { category: "missing" }), []);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b", "c"],
  );
});

test("price sorting always keeps hidden and missing prices last", () => {
  const data = [...rows, { id: "d" }];
  assert.deepEqual(
    filterListings(data, { sort: "price_low" }).map((row) => row.id),
    ["b", "a", "c", "d"],
  );
  assert.deepEqual(
    filterListings(data, { sort: "price_high" }).map((row) => row.id),
    ["a", "b", "c", "d"],
  );
});

test("cover selection preserves album metadata and does not duplicate an image", () => {
  const images = [
    { filename: "inside", album: "interior" },
    { filename: "cover", album: "exterior" },
  ];
  assert.deepEqual(auctionImages({ hero_image_filename: "cover", images }), [
    images[1],
    images[0],
  ]);
  assert.equal(
    auctionImages({ hero_image_filename: "derived-cover", images }).length,
    3,
  );
});

test("brand/model aliases match original number boundaries and longest alias rules", () => {
  assert.ok(aliasMatchLength("PV444ES", { name: "PV 444" }));
  assert.ok(aliasMatchLength("P 1800S", { name: "P1800" }));
  assert.equal(aliasMatchLength("9111", { name: "911" }), 0);
  assert.equal(aliasMatchLength("93", { name: "9-3" }), 0);
  assert.equal(
    matchingEntry("Austin Healey 3000", [
      { name: "Austin" },
      { name: "Austin Healey" },
    ]).name,
    "Austin Healey",
  );
  const brand = {
    name: "Porsche",
    slug: "porsche",
    vehicle_type: 0,
    models: [
      { name: "911", slug: "911" },
      { name: "911 Turbo", slug: "911-turbo" },
    ],
  };
  assert.deepEqual(
    brandListings(rows, [brand], brand, brand.models[0]).map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(
    brandListings(rows, [brand], brand, brand.models[1]).map((row) => row.id),
    ["c"],
  );
});
