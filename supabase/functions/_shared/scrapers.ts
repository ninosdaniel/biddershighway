import { load } from "cheerio";
import { Database, fetchJson, rpc } from "./http.ts";

export async function scrapeSajab(db: Database, category = 215, page = 1) {
  const url = new URL("https://auctionet.com/api/v2/items.json");
  url.search = new URLSearchParams({
    company_id: "410",
    category_id: String(category),
    is: "ended",
    q: "*",
    per_page: "200",
    page: String(page),
  }).toString();
  const response = await fetchJson(url.href, {
    headers: { "User-Agent": "BiddersHighway/1.0 (auction research)" },
  });
  if (!Array.isArray(response.items))
    throw new Error("auctionet_invalid_response");
  const rows = [];
  for (const item of response.items) {
    if (Number(item.ends_at) > Date.now() / 1000) continue;
    const body = load(`${item.description || ""}\n${item.condition || ""}`);
    body("script,iframe,style").remove();
    const bid = Math.max(
      0,
      ...(item.bids || []).map(
        (b: { amount: number }) => Number(b.amount) || 0,
      ),
    );
    rows.push({
      id: String(item.id),
      data: {
        name: String(item.title || ""),
        body: body.text(),
        closed_at: new Date(Number(item.ends_at) * 1000).toISOString(),
        highest_bid_amount_cents: Math.round(bid * 100),
        currency: item.currency || "SEK",
        sold: item.state === "sold",
        url: `https://auctionet.com/sv/${item.id}`,
      },
    });
  }
  await rpc(db, "website_external_results", {
    p_provider: "sajab",
    p_rows: rows,
  });
  return Math.min(Number(response.pagination?.total_pages) || 1, 50);
}
export async function scrapeBilweb(db: Database) {
  const get = async (url: string) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`bilweb_http_${response.status}`);
    return load(await response.text());
  };
  const index = await get("https://bilwebauctions.se/auktion");
  const section = index("section")
    .filter((_, el) =>
      ["Tidigare auktioner", "Avslutade auktioner"].includes(
        index(el).find("h2").text().trim(),
      ),
    )
    .first();
  const href =
    section.find(".EventCard a[href^='/']").first().attr("href") ||
    index("h2")
      .filter((_, el) => index(el).text().trim() === "Tidigare auktioner")
      .nextAll("div")
      .find("a[href^='/']")
      .first()
      .attr("href");
  if (!href?.startsWith("/") || href.startsWith("//"))
    throw new Error("bilweb_auction_not_found");
  const doc = await get(new URL(href, "https://bilwebauctions.se").href);
  const cards = doc(".vehicle-item,.Card-Wrapper,.RowObject");
  if (!cards.length) throw new Error("bilweb_cards_not_found");
  for (const el of cards) {
    const card = doc(el);
    const name = card
      .find(".vehicle-title,.RowObject-title a,h4")
      .first()
      .text()
      .trim();
    const price = card
      .find(".highest-bid,span[class*='bid_amount_presentation']")
      .first()
      .text()
      .replace(/\D/g, "");
    const link = card.find("a[href]").first().attr("href");
    if (!name || !price || !link) continue;
    const url = new URL(link, "https://bilwebauctions.se");
    if (url.origin !== "https://bilwebauctions.se") continue;
    await rpc(db, "website_external_result", {
      p_provider: "bilweb",
      p_id: url.href,
      p_data: {
        name,
        url: url.href,
        highest_bid_amount_cents: Number(price) * 100,
        currency: "SEK",
        sold: /reservationspris.*uppnått/i.test(card.text()),
        body: card.find(".description,p.RowObject-desc").text().trim(),
      },
    });
  }
}
