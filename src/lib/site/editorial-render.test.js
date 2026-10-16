import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { load } from "cheerio";

// Exercise the actual React server/client tree without a browser or a database.
// Only Next's router hook is stubbed because no App Router is mounted here.
test("React editorial pages render localized article, author, tag and pagination navigation", async () => {
  await fs.mkdir(".next", { recursive: true });
  const directory = await fs.mkdtemp(path.resolve(".next/editorial-render-"));
  try {
    const file = path.join(directory, "render.mjs");
    await build({
      stdin: {
        contents:
          'import React from "react"; import {renderToStaticMarkup} from "react-dom/server"; import {EditorialPage} from "./src/components/site/EditorialPage.jsx"; export const render = (props) => renderToStaticMarkup(React.createElement(EditorialPage,props));',
        resolveDir: process.cwd(),
        sourcefile: "editorial-preview.jsx",
        loader: "jsx",
      },
      outfile: file,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      jsx: "automatic",
      plugins: [
        {
          name: "test-router",
          setup(build) {
            build.onResolve({ filter: /^next\/link$/ }, () => ({
              path: "next/link.js",
              external: true,
            }));
            build.onResolve({ filter: /^next\/navigation$/ }, () => ({
              path: "router",
              namespace: "test-router",
            }));
            build.onLoad({ filter: /.*/, namespace: "test-router" }, () => ({
              contents: "export const useRouter = () => ({refresh(){}});",
            }));
          },
        },
      ],
    });
    const { render } = await import(pathToFileURL(file).href);
    for (const locale of ["en", "sv", "de"]) {
      const record = {
        id: "post-1",
        name: "Test article",
        slug: "article:guide",
        excerpt: "Article introduction",
        body: "<h2>Story heading</h2><p>Body <strong>text</strong></p><script>evil()</script>",
        slugs: { en: "guide", sv: "guide", de: "guide" },
        author: { name: "Jacob Odqvist", slug: "jacob" },
        published_at: "2026-01-01T00:00:00Z",
        tags: ["guides"],
        image: "example.jpg",
        thumbnail: "example.jpg",
      };
      const $ = load(
        render({
          locale,
          data: {
            kind: "post",
            record,
            comments: [
              {
                id: "comment-1",
                author: "Reader",
                body: "<script>not HTML</script>",
                created_at: "2026-01-01T00:00:00Z",
                parent_id: null,
              },
            ],
          },
        }),
      );
      assert.equal($("h1").text(), "Test article");
      assert.equal($(".editorial-body strong").text(), "text");
      assert.equal($("script").length, 0);
      assert.equal(
        $(".editorial-comment-body").text(),
        "<script>not HTML</script>",
      );
      assert.equal(
        $(".editorial-byline a").attr("href"),
        `/${locale}/authors/jacob`,
      );
      assert.equal($("#comments > a").attr("href"), `/${locale}/sign_ins/new`);
      const listing = load(
        render({
          locale,
          data: {
            kind: "posts",
            page: 2,
            page_size: 15,
            total: 32,
            hero: null,
            items: [record],
            tag: "guides",
            podcasts: [],
          },
        }),
      );
      assert.equal(
        listing("a[rel=next]").attr("href"),
        `/${locale}/posts?page=3&tag=guides`,
      );
      assert.equal(
        listing("a[rel=prev]").attr("href"),
        `/${locale}/posts?tag=guides`,
      );
      assert.equal(
        listing(".editorial-grid a").attr("href"),
        `/${locale}/posts/article%3Aguide`,
      );
      assert.equal(
        listing(".editorial-tags [aria-current=page]").attr("href"),
        `/${locale}/posts?tag=guides`,
      );
      const author = load(
        render({
          locale,
          data: {
            kind: "author",
            author: {
              name: "Writer",
              slug: "writer",
              description: "<p>Biography</p>",
            },
            items: [],
            page: 1,
            page_size: 15,
            total: 0,
          },
        }),
      );
      assert.equal(author("h1").text(), "Writer");
      assert.equal(author(".editorial-body").text(), "Biography");
      const page = load(
        render({
          locale,
          data: {
            kind: "page",
            record: { ...record, author: null, tags: [] },
            parent: { slug: "parent", name: "Parent" },
            items: [record],
          },
        }),
      );
      assert.equal(
        page(".editorial-breadcrumb a").last().attr("href"),
        `/${locale}/pages/parent`,
      );
      assert.equal(
        page(".editorial-grid a").attr("href"),
        `/${locale}/pages/article%3Aguide`,
      );
      assert.equal(page("#comments").length, 0);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
