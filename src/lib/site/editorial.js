import { load } from "cheerio";
import { cleanContent } from "./content.js";
import { isPublicPath, LOCALES, REFERENCE_ORIGIN } from "./paths.js";
import { editorialCopy } from "./editorial-copy.js";
import { listingImage } from "./listings.js";

export const EDITORIAL_TAGS = [
  "collections",
  "event",
  "jacobs_takes",
  "guides",
  "our_cars",
  "featured_cars",
];

export function editorialRoute(pathname, search = {}) {
  if (!isPublicPath(pathname)) return null;
  const match = pathname.match(
    /^\/(en|sv|de)\/(posts|pages|authors)(?:\/([^/]+))?\/?$/,
  );
  if (!match || (match[2] === "authors" && !match[3])) return null;
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const page = /^\d+$/.test(params.get("page") || "")
    ? Math.max(1, Math.min(10000, Number(params.get("page"))))
    : 1;
  const tag =
    match[2] === "posts" &&
    !match[3] &&
    EDITORIAL_TAGS.includes(params.get("tag"))
      ? params.get("tag")
      : null;
  return {
    resource: match[3]
      ? { posts: "post", pages: "page", authors: "author" }[match[2]]
      : match[2],
    slug: match[3] ? decodeURIComponent(match[3]) : null,
    page,
    tag,
  };
}

export function editorialHref(locale, collection, slug) {
  return `/${locale}/${collection}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
}

export function editorialPagination(path, page = 1, tag = null) {
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (tag) query.set("tag", tag);
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function editorialAlternates(data) {
  return Object.fromEntries(
    LOCALES.map((locale) => {
      const path =
        data.kind === "post"
          ? editorialHref(locale, "posts", data.record.slugs[locale])
          : data.kind === "page"
            ? editorialHref(locale, "pages", data.record.slug)
            : data.kind === "author"
              ? editorialHref(locale, "authors", data.author.slug)
              : editorialHref(locale, data.kind);
      return [locale, editorialPagination(path, data.page, data.tag)];
    }),
  );
}

export function editorialMetadata(data, locale, origin = REFERENCE_ORIGIN) {
  if (!data)
    return {
      title: "Bidders Highway",
      robots: { index: false, follow: false },
    };
  const title =
    data.record?.name || data.author?.name || editorialCopy[locale][data.kind];
  const description = data.record?.excerpt || undefined;
  const paths = editorialAlternates(data);
  const canonical = new URL(paths[locale], origin).href;
  const image = listingImage(data.record?.image || data.hero?.image);
  return {
    title: { absolute: `${title} - Bidders Highway` },
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        Object.entries(paths).map(([language, path]) => [
          language,
          new URL(path, origin).href,
        ]),
      ),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: data.kind === "post" ? "article" : "website",
      images: image ? [image] : [],
      ...(data.kind === "post"
        ? {
            publishedTime: data.record.published_at,
            modifiedTime: data.record.updated_at,
            authors: data.record.author ? [data.record.author.name] : [],
          }
        : {}),
    },
  };
}

// Editorial HTML is rich text, not an interactive imported form. Never turn
// stored markup into account actions or third-party widget controllers.
export function cleanEditorial(html, locale) {
  const $ = load(html || "", null, false);
  $(
    "form, input, button, select, textarea, dialog, countdown-controller",
  ).remove();
  $("*").each((_, element) => {
    for (const name of Object.keys(element.attribs || {})) {
      if (name.startsWith("data-")) $(element).removeAttr(name);
    }
  });
  return cleanContent($.html(), locale);
}

export function authorImage(name) {
  const images = {
    "Alexander Aalto": "alexander-aalto",
    "Bidders Highway": "bidders-highway",
    "Erik Cederberg": "erik-cederberg",
    "Fredrik Johansson": "fredrik-johansson",
    "Jacob Odqvist": "jacob-odqvist",
    "Johan Halse": "johan-halse",
    "Rasmus Christensen": "rasmus-christensen",
    "Tomas Jönsson": "tomas-jonsson",
  };
  return `/brand/${images[name] || "bidders-highway"}.jpg`;
}
