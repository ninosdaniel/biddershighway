import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const WORKSPACE = process.env.BH_WORKSPACE_DIR || process.cwd();
const require = createRequire(path.join(WORKSPACE, "package.json"));
const cheerio = require("cheerio");
const OUT =
  process.env.BH_REFERENCE_DIR || path.join(WORKSPACE, "src/content/reference");
const SOURCE =
  process.env.BH_SOURCE_DIR || "/private/tmp/bidders-highway-source";
const ORIGIN = "https://www.biddershighway.com";
const LIMIT = Math.min(Number(process.env.BH_CRAWL_LIMIT || 1200), 1200);
const CONCURRENCY = 3;
const ALLOWED_QUERY = new Set(["page", "tag"]);
const EDITORIAL =
  /^\/(en|sv|de)\/(questions|question_categories|posts|authors|pages|docs)(\/[^?#]*)?$/;
const SEED_ONLY = process.argv.includes("--seed-only");
const initialRoutes = [
  "",
  "/questions",
  "/posts",
  "/pages",
  "/docs/terms_and_conditions",
  "/docs/cookie_policy",
  "/docs/about_us",
  "/docs/confirmation_sent",
  "/sales_inquiries/new",
  "/collection_leads/new",
  "/estate-sales/new",
  "/sign_ins/new",
  "/users/new",
  "/cars",
  "/motorcycles",
];
const queue = SEED_ONLY
  ? ["/en"]
  : [
      "/",
      ...["en", "sv", "de"].flatMap((locale) =>
        initialRoutes.map((route) => `/${locale}${route}`),
      ),
    ];
const scheduled = new Set(queue);
const manifest = {};
const errors = [];
const assetUrls = new Set();
const omittedAtLimit = new Set();
const seenListingDetails = new Map();
const counts = {};
let processed = 0;

await fs.mkdir(path.join(OUT, "pages"), { recursive: true });
let priorManifest = {};
try {
  priorManifest = JSON.parse(
    await fs.readFile(path.join(OUT, "manifest.json"), "utf8"),
  );
} catch {}
let priorErrors = new Map();
try {
  priorErrors = new Map(
    JSON.parse(await fs.readFile(path.join(OUT, "errors.json"), "utf8"))
      .filter((item) => item.error === "HTTP 404")
      .map((item) => [item.path, item.error]),
  );
} catch {}
try {
  for (const asset of JSON.parse(
    await fs.readFile(path.join(OUT, "assets.json"), "utf8"),
  ))
    assetUrls.add(asset.url);
} catch {}
for (const key of Object.keys(priorManifest)) enqueue(key);

function normalized(raw, base = ORIGIN) {
  try {
    const u = new URL(raw, base);
    if (
      u.origin !== ORIGIN ||
      /(?:auth_token|token|email|invited|ref|utm_)/i.test(u.search)
    )
      return null;
    const params = new URLSearchParams();
    for (const [key, value] of [...u.searchParams].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (ALLOWED_QUERY.has(key)) params.set(key, value);
      else if (u.search) return null;
    }
    return `${u.pathname.replace(/\/$/, "") || "/"}${params.size ? `?${params}` : ""}`;
  } catch {
    return null;
  }
}

function enqueue(key) {
  if (SEED_ONLY || !key || scheduled.has(key)) return;
  if (scheduled.size >= LIMIT) {
    omittedAtLimit.add(key);
    return;
  }
  scheduled.add(key);
  queue.push(key);
}

function publicLink(key, from) {
  const pathname = key.split("?")[0];
  if (EDITORIAL.test(pathname)) return true;
  if (
    /^\/(en|sv|de)\/(auctions|classifieds)\/[^/]+$/.test(pathname) &&
    /^\/(en|sv|de)?$/.test(from)
  ) {
    const locale = pathname.split("/")[1];
    const keys = seenListingDetails.get(locale) || new Set();
    if (keys.has(key)) return true;
    if (keys.size >= 3) return false;
    keys.add(key);
    seenListingDetails.set(locale, keys);
    return true;
  }
  return false;
}

function extract(html, responseUrl, requestedPath) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content") || "";
  const canonicalUrl = $('link[rel="canonical"]').attr("href") || responseUrl;
  const alternates = $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({
      locale: $(el).attr("hreflang"),
      href: $(el).attr("href"),
    }))
    .get();
  const stylesheets = $('link[rel="stylesheet"]')
    .map((_, el) => $(el).attr("href"))
    .get();
  stylesheets.forEach((u) => {
    if (u?.startsWith("/assets/")) assetUrls.add(u);
  });
  $('link[rel="preload"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href?.startsWith("/assets/")) assetUrls.add(href);
  });
  let main = $("main").first();
  if (!main.length) throw new Error("No main element in public response");
  main
    .find(
      'script,noscript,meta,input[name="authenticity_token"],input[name*="auth_token"],input[name*="csrf"],input[name*="session"]',
    )
    .remove();
  main.find("*").each((_, el) => {
    for (const name of Object.keys(el.attribs || {})) {
      if (
        /^on/i.test(name) ||
        /(?:csrf|auth-token|session-token|authenticity)/i.test(name)
      )
        $(el).removeAttr(name);
      if (
        ["href", "src", "action"].includes(name) &&
        /^\s*javascript:/i.test($(el).attr(name) || "")
      )
        $(el).removeAttr(name);
    }
    if (
      el.tagName === "input" &&
      !["checkbox", "radio", "submit", "button", "hidden"].includes(
        $(el).attr("type") || "text",
      )
    )
      $(el).removeAttr("value");
    if (el.tagName === "textarea") $(el).empty();
  });
  const links = main
    .find("a[href]")
    .map((_, el) => $(el).attr("href"))
    .get()
    .map((href) => normalized(href, responseUrl))
    .filter(Boolean);
  for (const link of [
    ...links,
    ...alternates.map((a) => normalized(a.href)).filter(Boolean),
  ]) {
    if (publicLink(link, requestedPath.split("?")[0])) enqueue(link);
  }
  const mainHtml = $.html(main);
  for (const match of mainHtml.matchAll(
    /(?:https:\/\/www\.biddershighway\.com)?(\/assets\/[^\s"'<>\)]+)/g,
  ))
    assetUrls.add(match[1].replace(/&amp;/g, "&"));
  return {
    path: requestedPath,
    sourceUrl: responseUrl,
    title,
    description,
    canonicalUrl,
    alternates,
    stylesheets,
    mainHtml,
    links: [...new Set(links)],
  };
}

async function crawl(key) {
  if (priorErrors.has(key))
    return { cached: true, error: priorErrors.get(key) };
  const cache = priorManifest[key];
  if (cache) {
    try {
      const old = JSON.parse(await fs.readFile(path.join(OUT, cache), "utf8"));
      const page = extract(
        `<!doctype html><html><head><title>${old.title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>${old.stylesheets.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head><body>${old.mainHtml}</body></html>`,
        old.sourceUrl,
        key,
      );
      manifest[key] = cache;
      for (const alt of old.alternates || []) {
        const normalizedAlt = normalized(alt.href);
        if (normalizedAlt && EDITORIAL.test(normalizedAlt.split("?")[0]))
          enqueue(normalizedAlt);
      }
      return { cached: true, title: page.title };
    } catch {}
  }
  const response = SEED_ONLY
    ? {
        url: `${ORIGIN}${key}`,
        text: () =>
          fs.readFile("/private/tmp/bidders-reference-home.html", "utf8"),
      }
    : await fetch(`${ORIGIN}${key}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
        headers: {
          "User-Agent": "BiddersHighway-PublicContentMigration/1.0",
          Accept: "text/html",
        },
      });
  if (!SEED_ONLY) {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html"))
      throw new Error(`Unsupported content type ${type}`);
  }
  const body = await response.text();
  const page = extract(body, response.url, key);
  const robots = response.headers?.get("x-robots-tag");
  if (robots) page.robots = robots;
  const filename = `pages/${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}.json`;
  await fs.writeFile(
    path.join(OUT, filename),
    `${JSON.stringify(page, null, 2)}\n`,
  );
  manifest[key] = filename;
  const resolved = normalized(response.url);
  if (
    resolved &&
    (EDITORIAL.test(resolved.split("?")[0]) || scheduled.has(resolved))
  )
    manifest[resolved] ||= filename;
  return { title: page.title };
}

async function filesBelow(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(file)));
    else files.push(file);
  }
  return files;
}

async function checkpoint() {
  await fs.writeFile(
    path.join(OUT, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(OUT, "errors.json"),
    `${JSON.stringify(errors, null, 2)}\n`,
  );
}

while (queue.length && processed < LIMIT) {
  const batch = queue.splice(0, Math.min(CONCURRENCY, LIMIT - processed));
  let uncached = false;
  await Promise.all(
    batch.map(async (key) => {
      processed++;
      try {
        const result = await crawl(key);
        if (!result.cached) uncached = true;
        if (result.error) {
          errors.push({ path: key, error: result.error });
          return;
        }
        const family = key.split("/")[2]?.split("?")[0] || "home";
        counts[family] = (counts[family] || 0) + 1;
        if (!result.cached) console.log(`OK ${key} ${result.title}`);
      } catch (error) {
        uncached = true;
        errors.push({ path: key, error: error.message });
        console.log(`ERROR ${key} ${error.message}`);
      }
    }),
  );
  await checkpoint();
  if (queue.length && uncached)
    await new Promise((resolve) => setTimeout(resolve, 2600));
}

const sourceFiles = await filesBelow(path.join(SOURCE, "app/assets"));
const byBase = new Map(sourceFiles.map((file) => [path.basename(file), file]));
const assets = [...assetUrls].sort().map((url) => {
  const filename = path.basename(url.split("?")[0]);
  const base = filename.replace(/-[a-f0-9]{8,64}(?=\.[^.]+$)/, "");
  const logicalPath = url
    .split("?")[0]
    .replace(/^\/assets\//, "")
    .replace(/-[a-f0-9]{8,64}(?=\.[^.]+$)/, "");
  const relativeMatch = sourceFiles.find((file) =>
    ["images", "fonts", "stylesheets", "builds"].some(
      (kind) => file === path.join(SOURCE, "app/assets", kind, logicalPath),
    ),
  );
  return {
    url,
    filename,
    source: relativeMatch || byBase.get(filename) || byBase.get(base) || null,
  };
});
await fs.writeFile(
  path.join(OUT, "assets.json"),
  `${JSON.stringify(assets, null, 2)}\n`,
);
const comparablePath = (value) => {
  try {
    return decodeURIComponent(value).replace(/\?$/, "");
  } catch {
    return value;
  }
};
const redirects = {};
for (const error of errors.filter((item) => item.error === "HTTP 404")) {
  const candidates = Object.keys(manifest).filter(
    (key) => comparablePath(key) === comparablePath(error.path),
  );
  if (candidates.length === 1) redirects[error.path] = candidates[0];
}
await fs.writeFile(
  path.join(OUT, "redirects.json"),
  `${JSON.stringify(redirects, null, 2)}\n`,
);
const summary = {
  processed,
  manifestEntries: Object.keys(manifest).length,
  files: new Set(Object.values(manifest)).size,
  counts,
  errors,
  assets: assets.length,
  unmatchedAssets: assets.filter((a) => !a.source),
  remainingQueue: queue.length,
  capReached: processed >= LIMIT,
  omittedAtLimit: [...omittedAtLimit].sort(),
};
await fs.writeFile(
  path.join(OUT, "coverage.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
