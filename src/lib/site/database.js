import { createClient } from "@supabase/supabase-js";
export async function publicAuction(slug, locale) {
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
}
