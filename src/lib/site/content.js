import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { load } from "cheerio";
import sanitizeHtml from "sanitize-html";
import {
  assetHref,
  localHref,
  publicPageKey,
  isStaticContentPath,
  REFERENCE_ORIGIN,
} from "./paths.js";

const snapshotDirectory = path.join(process.cwd(), "src/content/reference");

export function extractPage(html, pagePath) {
  const $ = load(html);
  const main = $("main").first();
  if (!main.length) return null;
  const alternates = {};
  $("link[rel=alternate][hreflang]").each((_, element) => {
    const language = $(element).attr("hreflang");
    if (["en", "sv", "de"].includes(language))
      alternates[language] = localHref($(element).attr("href"));
  });
  return {
    path: pagePath,
    title: $("title").text(),
    description: $("meta[name=description]").attr("content") || "",
    alternates,
    mainHtml: main.html(),
  };
}

export function cleanContent(html, locale = "en") {
  const $ = load(html, null, false);
  $(
    "script, style, link, meta, noscript, live-update-controller, input[name=authenticity_token], input[name*=auth_token], input[name*=csrf]",
  ).remove();
  $("[data-controller=live-update]").remove();
  $("*").each((_, element) => {
    const item = $(element);
    for (const name of Object.keys(element.attribs || {})) {
      if (
        /^on/i.test(name) ||
        /csrf|authenticity|auth-token|session-token/i.test(name)
      )
        item.removeAttr(name);
    }
    if (item.attr("href"))
      item.attr("href", localHref(item.attr("href"), locale));
    if (item.attr("action"))
      item.attr("action", localHref(item.attr("action"), locale));
    if (item.attr("src")) item.attr("src", assetHref(item.attr("src")));
    if (item.attr("poster"))
      item.attr("poster", assetHref(item.attr("poster")));
    if (item.attr("srcset")) item.removeAttr("srcset");
    if (item.attr("style"))
      item.attr(
        "style",
        item
          .attr("style")
          .replace(
            /url\(["']?([^"')]+)["']?\)/g,
            (_, url) => `url("${assetHref(url)}")`,
          ),
      );
    if (
      element.tagName === "input" &&
      !item.attr("aria-label") &&
      item.attr("placeholder")
    )
      item.attr("aria-label", item.attr("placeholder"));
    if (element.tagName === "img" && item.attr("alt") === undefined)
      item.attr("alt", "");
    if (element.tagName === "video") {
      item.attr("muted", "");
      item.attr("playsinline", "");
    }
    if (element.tagName === "a" && item.attr("target") === "_blank")
      item.attr("rel", "noopener noreferrer");
    if (
      element.tagName === "input" &&
      item.attr("name")?.includes("accept_terms")
    ) {
      item
        .attr("tabindex", "-1")
        .attr("aria-hidden", "true")
        .attr("data-honeypot", "true")
        .attr("autocomplete", "off");
    }
  });
  return sanitizeHtml($.html(), {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "main",
      "section",
      "article",
      "header",
      "footer",
      "nav",
      "aside",
      "img",
      "figure",
      "figcaption",
      "picture",
      "source",
      "video",
      "iframe",
      "details",
      "summary",
      "form",
      "input",
      "label",
      "button",
      "select",
      "option",
      "optgroup",
      "textarea",
      "fieldset",
      "legend",
      "dialog",
      "time",
      "lite-youtube",
      "countdown-controller",
    ],
    allowedAttributes: {
      "*": [
        "id",
        "class",
        "style",
        "title",
        "role",
        "aria-*",
        "data-*",
        "tabindex",
        "hidden",
      ],
      a: ["href", "target", "rel", "download"],
      img: ["src", "alt", "width", "height", "loading"],
      source: ["src", "type"],
      iframe: ["src", "title", "width", "height", "loading", "allowfullscreen"],
      video: [
        "src",
        "poster",
        "controls",
        "autoplay",
        "loop",
        "muted",
        "playsinline",
      ],
      form: ["action", "method", "enctype"],
      input: [
        "name",
        "type",
        "value",
        "placeholder",
        "required",
        "min",
        "max",
        "step",
        "checked",
        "disabled",
        "autocomplete",
        "inputmode",
        "pattern",
        "minlength",
        "maxlength",
        "multiple",
        "accept",
      ],
      button: ["type", "name", "value", "disabled"],
      label: ["for"],
      select: ["name", "required", "multiple", "disabled"],
      option: ["value", "selected", "disabled"],
      optgroup: ["label"],
      textarea: ["name", "placeholder", "required", "rows", "maxlength"],
      details: ["open", "name"],
      dialog: ["open"],
      time: ["datetime"],
      "lite-youtube": ["videoid", "playlabel"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedIframeHostnames: [
      "www.youtube.com",
      "www.youtube-nocookie.com",
      "player.vimeo.com",
    ],
    exclusiveFilter: (frame) => frame.tag === "iframe" && !frame.attribs.src,
    allowedStyles: {
      "*": {
        "aspect-ratio": [/^[\d.\s/]+$/],
        "background-image": [
          /^url\("https:\/\/bidders-highway\.fra1\.cdn\.digitaloceanspaces\.com\/[^"<>]+"\)$/,
        ],
        width: [/^[\d.]+(px|%)$/],
        height: [/^[\d.]+(px|%)$/],
        display: [/^(none|block|flex|grid)$/],
      },
    },
  });
}

async function snapshot(key) {
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(snapshotDirectory, "manifest.json"), "utf8"),
    );
    // Source slugs can contain literal punctuation while Next route keys are
    // percent-encoded. Canonicalize both sides so imports work without a live
    // source request, including the Swedish articles with ':' in their slugs.
    const file =
      manifest[key] ||
      Object.entries(manifest).find(([sourcePath]) => {
        const url = new URL(sourcePath, REFERENCE_ORIGIN);
        return publicPageKey(url.pathname, url.searchParams) === key;
      })?.[1];
    if (!file || !/^pages\/[a-f0-9]+\.json$/.test(file)) return null;
    const data = JSON.parse(
      await fs.readFile(path.join(snapshotDirectory, file), "utf8"),
    );
    const alternates = Array.isArray(data.alternates)
      ? Object.fromEntries(
          data.alternates.map((item) => [item.locale, localHref(item.href)]),
        )
      : data.alternates;
    return { ...data, alternates, source: "import" };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export const getPublicPage = cache(async (key) => {
  const requested = new URL(key, REFERENCE_ORIGIN);
  if (publicPageKey(requested.pathname, requested.searchParams) !== key)
    return null;
  // The copied content is for remaining informational pages only. Business
  // records must come from our database, even when it is empty or unavailable.
  // Never replace missing records with snapshots or original-site responses.
  if (!isStaticContentPath(requested.pathname)) return null;
  return snapshot(key);
});
