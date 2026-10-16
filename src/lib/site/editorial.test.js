import assert from "node:assert/strict";
import test from "node:test";
import { load } from "cheerio";
import {
  editorialRoute,
  editorialAlternates,
  editorialMetadata,
  editorialPagination,
  cleanEditorial,
} from "./editorial.js";

test("editorial routes preserve punctuation, constrain filters and produce canonical translated links", () => {
  const slug = "tvättguiden: el/bensin?";
  assert.deepEqual(editorialRoute(`/sv/posts/${encodeURIComponent(slug)}`), {
    resource: "post",
    slug,
    page: 1,
    tag: null,
  });
  assert.deepEqual(
    editorialRoute("/en/posts", {
      page: "2",
      tag: "guides",
      auth_token: "private",
    }),
    { resource: "posts", slug: null, page: 2, tag: "guides" },
  );
  assert.equal(
    editorialRoute("/en/posts", { page: "-20", tag: "not-a-tag" }).page,
    1,
  );
  assert.equal(
    editorialRoute("/en/posts", { page: "999999999999999999999999999" }).page,
    10000,
  );
  for (const path of [
    "/en/authors",
    "/en/pages/a%2fb",
    "/en/posts/%2e%2e",
    "/en/posts/%zz",
    "/en/posts/test/edit",
  ])
    assert.equal(editorialRoute(path), null);
  const post = {
    kind: "post",
    record: {
      name: "Guide",
      excerpt: "Description",
      slug,
      slugs: { sv: slug, en: "guide", de: "ratgeber" },
      published_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      author: { name: "Writer" },
    },
  };
  assert.equal(
    editorialAlternates(post).sv,
    `/sv/posts/${encodeURIComponent(slug)}`,
  );
  const metadata = editorialMetadata(post, "de", "https://new.example");
  assert.equal(
    metadata.alternates.canonical,
    "https://new.example/de/posts/ratgeber",
  );
  assert.equal(
    metadata.alternates.languages.en,
    "https://new.example/en/posts/guide",
  );
  assert.equal(metadata.openGraph.publishedTime, post.record.published_at);
  assert.equal(metadata.openGraph.type, "article");
  assert.equal(
    editorialPagination("/sv/posts", 2, "guides"),
    "/sv/posts?page=2&tag=guides",
  );
  assert.equal(
    editorialAlternates({ kind: "posts", page: 3, tag: "event" }).en,
    "/en/posts?page=3&tag=event",
  );
  assert.equal(editorialMetadata(null, "en").robots.index, false);
});

test("live rich text keeps article media and internal links without importing scripts, account forms or widgets", () => {
  const html = cleanEditorial(
    `<h2>Title</h2><p><strong>Bold</strong><a href="https://www.biddershighway.com/sv/posts/guide" onclick="steal()">Guide</a></p><img src="/assets/logo-443fb49e.svg" onerror="steal()"><iframe src="https://www.youtube.com/embed/example"></iframe><iframe src="https://evil.example"></iframe><script>private()</script><form action="/sv/auctions/x/purchases"><input value="PRIVATE"><button>Buy</button></form><div data-controller="shopify">Text</div>`,
    "sv",
  );
  const $ = load(html);
  assert.equal($("h2").text(), "Title");
  assert.equal($("strong").text(), "Bold");
  assert.equal($("a").attr("href"), "/sv/posts/guide");
  assert.equal($("img").attr("src"), "/brand/logo.svg");
  assert.equal($("iframe").length, 1);
  assert.equal(
    $("script,form,input,button,[onclick],[onerror],[data-controller]").length,
    0,
  );
  assert.ok(!html.includes("PRIVATE"));
});
