import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { load } from "cheerio";
import { cleanContent, extractPage, getPublicPage } from "./content.js";
import {
  assetHref,
  isPublicPath,
  localHref,
  publicPageKey,
  routeSegment,
  purchaseRoute,
  isAccountPath,
} from "./paths.js";

test("original purchase and after-sale URLs resolve to private checkout screens", () => {
  for (const locale of ["en", "sv", "de"]) {
    for (const suffix of ["purchases", "purchases/new", "after_sales", "after_sales/new"]) {
      const path = `/${locale}/auctions/porsche-%C3%A5/${suffix}`;
      assert.deepEqual(purchaseRoute(path), { slug: "porsche-å", kind: suffix.startsWith("purchases") ? "purchase" : "after_sale" });
      assert.equal(isAccountPath(path), true);
      assert.equal(publicPageKey(path), null);
    }
    assert.deepEqual(purchaseRoute(`/${locale}/after_sales/test-car`), { slug: "test-car", kind: "after_sale" });
  }
  for (const path of ["/en/auctions/a%2Fb/purchases", "/en/auctions/%2e%2e/purchases", "/en/auctions/%zz/purchases", "/en/auctions/x/purchases/new/other", "/en/after_sales/x?token=secret", "/fr/after_sales/car"]) assert.equal(purchaseRoute(path), null);
});

test("public content cannot request administrative, private, or arbitrary paths", () => {
  for (const url of [
    "/en/questions",
    "/sv/posts/example",
    "/de/sales_inquiries/new",
    "/en/auctions/car/albums/all",
  ])
    assert.equal(isPublicPath(url), true);
  for (const url of [
    "/cli/users",
    "/filter/auctions",
    "/en/account/settings",
    "//evil.example",
    "/en/pages/%2e%2e",
    "/en/pages/x\\y",
  ])
    assert.equal(isPublicPath(url), false);
  assert.equal(
    publicPageKey("/en/listings", {
      q: "Volvo",
      page: "2",
      auth_token: "secret",
      email: "private@example.com",
    }),
    "/en/listings?page=2&q=Volvo",
  );
  assert.equal(
    publicPageKey("/en/posts/corvette-—-sportscar"),
    "/en/posts/corvette-%E2%80%94-sportscar",
  );
  assert.equal(
    publicPageKey("/en/posts/corvette-%E2%80%94-sportscar"),
    "/en/posts/corvette-%E2%80%94-sportscar",
  );
  assert.equal(isPublicPath("/en/pages/x%2Fy"), false);
  assert.equal(
    publicPageKey("/en/posts/which-car%3F"),
    "/en/posts/which-car%3F",
  );
});

test("same-site links and original assets resolve within Next", () => {
  assert.equal(
    localHref("https://www.biddershighway.com/en/posts?page=2"),
    "/en/posts?page=2",
  );
  assert.equal(
    localHref("https://biddershighway.com/sv/questions"),
    "/sv/questions",
  );
  assert.equal(localHref("/"), "/sv");
  assert.equal(localHref("javascript:alert(1)"), "");
  assert.equal(assetHref("/assets/logo-443fb49e.svg"), "/brand/logo.svg");
  assert.equal(
    assetHref("https://bidders-highway.fra1.cdn.digitaloceanspaces.com/photo"),
    "https://bidders-highway.fra1.cdn.digitaloceanspaces.com/photo",
  );
});

test("content migration strips executable content and session tokens while preserving FAQ and form behavior", () => {
  const html = cleanContent(
    `<main><script>alert(1)</script><details><summary>Question?</summary><p>Answer</p></details><a href="https://www.biddershighway.com/en/posts" onclick="bad()">Articles</a><img src="/assets/logo-443fb49e.svg" onerror="bad()"><form action="/en/sales_inquiries" method="post"><input name="authenticity_token" value="private"><input name="lead[email]" type="email" required placeholder="Email"><input name="lead[accept_terms]" type="checkbox"></form><iframe src="https://evil.example"></iframe></main>`,
  );
  const $ = load(html);
  assert.equal(
    $("script,iframe,[onclick],[onerror],input[name=authenticity_token]")
      .length,
    0,
  );
  assert.equal($("details summary").text(), "Question?");
  assert.equal($("a").attr("href"), "/en/posts");
  assert.equal($("form").attr("action"), "/en/sales_inquiries");
  assert.equal($("input[type=email]").is("[required]"), true);
  assert.equal($("input[type=checkbox]").attr("data-honeypot"), "true");
  assert.equal(html.includes("private"), false);
});

test("metadata and locale links come from the correct page", () => {
  const page = extractPage(
    '<html><head><title>FAQ</title><meta name="description" content="Answers"><link rel="alternate" hreflang="sv" href="https://www.biddershighway.com/sv/questions"></head><body><header>Header</header><main><h1>FAQ</h1></main><footer>Footer</footer></body></html>',
    "/en/questions",
  );
  assert.equal(page.title, "FAQ");
  assert.equal(page.description, "Answers");
  assert.deepEqual(page.alternates, { sv: "/sv/questions" });
  assert.equal(page.mainHtml, "<h1>FAQ</h1>");
});

test("published editorial routes never resurrect local snapshots", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Editorial content must load locally");
  });
  for (const slug of [
    "tvattguiden:-exteriort",
    "tvattguiden:-interiort",
    "guide:-agarbyte",
  ]) {
    for (const param of [slug, encodeURIComponent(slug)]) {
      const key = publicPageKey(`/sv/posts/${routeSegment(param)}`);
      const page = await getPublicPage(key);
      assert.equal(page, null, key);
    }
  }
});

test("vehicle snapshots and missing pages cannot supply data outside Supabase", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Runtime pages must never fetch original-site data");
  });
  const previousMode = process.env.REFERENCE_CONTENT_MODE;
  process.env.REFERENCE_CONTENT_MODE = "snapshot";
  t.after(() => {
    if (previousMode === undefined) delete process.env.REFERENCE_CONTENT_MODE;
    else process.env.REFERENCE_CONTENT_MODE = previousMode;
  });
  const manifest = JSON.parse(
    await fs.readFile("src/content/reference/manifest.json", "utf8"),
  );
  const vehiclePaths = Object.keys(manifest).filter((key) =>
    /^\/(en|sv|de)(?:$|\/(auctions|classifieds|listings|cars|motorcycles|themes)(\/|\?|$))/.test(
      key,
    ),
  );
  assert.ok(vehiclePaths.length > 0);
  for (const path of [
    ...vehiclePaths,
    "/en/listings",
    "/en/classifieds",
    "/en/posts/missing-local-article",
  ]) {
    const url = new URL(path, "https://www.biddershighway.com");
    assert.equal(
      await getPublicPage(publicPageKey(url.pathname, url.searchParams)),
      null,
      path,
    );
  }
});
