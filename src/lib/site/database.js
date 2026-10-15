import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { hasReadDatabase, readDatabase } from "./read-database";
import {
  catalogSql,
  auctionSql,
  featuredSql,
  classifiedSql,
  brandsSql,
} from "./public-queries";

export const publicAuction = cache(async (slug, locale) => {
  if (hasReadDatabase()) {
    const rows = await readDatabase(auctionSql, [slug, locale]);
    return rows[0]?.auction || null;
  }
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
  const { data, error } = await client.rpc("get_website_auction", {
    p_slug: slug,
    p_locale: locale,
  });
  if (error) throw new Error("Auction data could not be loaded");
  return data;
});

export const publicCatalog = cache(async (locale) => {
  if (!hasReadDatabase()) return null;
  return JSON.parse(JSON.stringify(await readDatabase(catalogSql, [locale])));
});

export const featuredAuction = cache(async (locale) => {
  if (!hasReadDatabase()) return null;
  const rows = await readDatabase(featuredSql);
  return rows[0] ? publicAuction(rows[0].slug, locale) : null;
});

export const publicClassified = cache(async (slug, locale) => {
  if (!hasReadDatabase()) return null;
  return (
    (await readDatabase(classifiedSql, [slug, locale]))[0]?.classified || null
  );
});

export const publicBrands = cache(async (locale) => {
  if (!hasReadDatabase()) return [];
  return readDatabase(brandsSql, [locale]);
});
