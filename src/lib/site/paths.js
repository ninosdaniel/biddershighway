import redirects from "../../content/reference/redirects.json" with { type: "json" };
export const REFERENCE_ORIGIN = "https://www.biddershighway.com";
export const LOCALES = ["en", "sv", "de"];

// Next can supply decoded metadata params and encoded page params. Normalize
// both before constructing a URL, while retaining literal malformed '%' text.
export function routeSegment(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

const publicRoutes = [
  /^\/(en|sv|de)\/?$/,
  /^\/(en|sv|de)\/(listings|questions|posts|pages|cars|motorcycles|classifieds)\/?$/,
  /^\/(en|sv|de)\/(questions|question_categories|posts|authors|pages|docs|themes|auctions|classifieds)\/[^/]+$/,
  /^\/(en|sv|de)\/(cars|motorcycles)\/[^/]+(?:\/[^/]+)?$/,
  /^\/(en|sv|de)\/(auctions|classifieds)\/[^/]+\/albums(?:\/[^/]+(?:\/images\/[^/]+)?)?$/,
  /^\/(en|sv|de)\/(sales_inquiries|collection_leads|estate-sales|classified_leads|sign_ins|users|valuations)\/new$/,
];

export function isPublicPath(pathname) {
  if (typeof pathname !== "string" || /%5c|[?#]/i.test(pathname)) return false;
  if (/%2f/i.test(pathname) && !/^\/(en|sv|de)\/posts\/[^/]+$/.test(pathname))
    return false;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (
    /[\\\x00-\x1f]/.test(decoded) ||
    decoded.split("/").some((segment) => [".", ".."].includes(segment))
  )
    return false;
  return publicRoutes.some((pattern) => pattern.test(pathname));
}

export function publicPageKey(pathname, search = {}) {
  if (!isPublicPath(pathname)) return null;
  const allowed = new Set([
    "page",
    "tag",
    "q",
    "kind",
    "lifecycle_status",
    "category",
    "year_from",
    "year_to",
    "sort",
  ]);
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const clean = new URLSearchParams();
  for (const [key, value] of params) {
    if (allowed.has(key) && value && value.length <= 200) clean.set(key, value);
  }
  clean.sort();
  return (
    pathname
      .replace(/\/$/, "")
      .split("/")
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join("/") + (clean.size ? `?${clean}` : "")
  );
}

export function isStaticContentPath(pathname) {
  return /^\/(en|sv|de)\/(questions|question_categories|docs|sales_inquiries|collection_leads|estate-sales|classified_leads|sign_ins|users|valuations)(\/|$)/.test(
    pathname,
  );
}

export function localHref(value, locale = "en") {
  if (!value) return "";
  if (value.startsWith("#") || /^(mailto:|tel:)/i.test(value)) return value;
  try {
    const url = new URL(value, REFERENCE_ORIGIN);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    if (
      !["www.biddershighway.com", "biddershighway.com"].includes(url.hostname)
    )
      return url.href;
    const path = url.pathname === "/" ? "/sv" : url.pathname;
    if (path === `/${locale}/jobs`) return "https://biddershighway.uhigher.com";
    return (redirects[path] || path) + url.search + url.hash;
  } catch {
    return "";
  }
}

export function assetHref(value) {
  if (!value) return value;
  let url;
  try {
    url = new URL(value, REFERENCE_ORIGIN);
  } catch {
    return "";
  }
  if (url.origin === REFERENCE_ORIGIN && url.pathname.startsWith("/assets/")) {
    const name = url.pathname.slice(8).replace(/-[a-f0-9]{8,64}(?=\.)/i, "");
    return `/brand/${name}`;
  }
  return ["https:", "http:"].includes(url.protocol) ? url.href : "";
}

export function isAccountPath(pathname) {
  if (purchaseRoute(pathname)) return true;
  if (
    typeof pathname !== "string" ||
    /[\\\x00-\x20]/.test(pathname) ||
    /\.\.|%2e|%2f|%5c/i.test(pathname)
  )
    return false;
  return /^\/(en|sv|de)\/(account(?:\/[^/]+)*|terms|notifications|saved_searches|detailed_leads\/[^/]+\/edit|auctions\/[^/]+\/(max_bids|offers|bookmarks)(?:\/new)?|offer_acceptances\/[^/]+|offer_rejections\/[^/]+)$/.test(
    pathname,
  );
}

// Preserve both Rails checkout URLs and the after-sale landing link.
export function purchaseRoute(pathname) {
  if (typeof pathname !== "string" || /[?#\\\x00-\x20]|%2f|%5c/i.test(pathname)) return null;
  const route = pathname.match(/^\/(en|sv|de)\/auctions\/([^/]+)\/(purchases|after_sales)(?:\/new)?$/);
  const afterSale = pathname.match(/^\/(en|sv|de)\/after_sales\/([^/]+)$/);
  if (!route && !afterSale) return null;
  try {
    const slug = decodeURIComponent((route || afterSale)[2]);
    if ([".", ".."].includes(slug) || /[\\/\x00-\x1f]/.test(slug)) return null;
    return { slug, kind: route?.[3] === "purchases" ? "purchase" : "after_sale" };
  } catch {
    return null;
  }
}
