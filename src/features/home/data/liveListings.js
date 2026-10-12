// The read-only RPC exposes only public card fields from live_listings.
export const LISTING_COLUMNS = [
  "id",
  "listing_type",
  "slug",
  "title",
  "description",
  "location",
  "hero_image_filename",
  "lifecycle_status",
  "listed_at",
  "ends_at",
  "reserve_lowered",
  "price_cents",
  "price_currency",
  "hidden_sale_price",
].join(",");

const PAGE_SIZE = 100;
const statusLabels = {
  coming_soon: "Coming soon",
  live: "Live",
  purchasable: "Available to buy",
  sold: "Sold",
  unsold: "Auction ended",
};

function imageUrl(filename, baseUrl) {
  if (!filename) return null;

  try {
    const url = new URL(filename, baseUrl);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function formatPrice(row) {
  if (row.hidden_sale_price) return "Price undisclosed";
  if (row.price_cents == null) return "Price on request";

  const amount = Number(row.price_cents) / 100;
  if (!Number.isFinite(amount)) return "Price on request";

  const currency = row.price_currency || "SEK";
  try {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("sv-SE")} ${currency}`;
  }
}

function formatTiming(row) {
  if (row.lifecycle_status === "sold") return "Sold";
  if (row.lifecycle_status === "unsold") return "Auction ended";
  if (row.lifecycle_status === "coming_soon") return "Coming soon";
  if (row.listing_type === "classified" || row.lifecycle_status === "purchasable") {
    return "Available now";
  }

  const end = row.ends_at && new Date(row.ends_at);
  if (!end || Number.isNaN(end.getTime())) return "End time to be announced";

  return `Ends ${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(end)}`;
}

export function mapListing(row, imageBaseUrl) {
  return {
    id: `${row.listing_type}:${row.id}`,
    slug: row.slug,
    title: row.title?.trim() || "Vehicle listing",
    description: row.description || "",
    location: row.location || "Location not specified",
    type: row.listing_type,
    // The view includes the model year in the title, but does not expose
    // separate manufacturer, colour or body-style fields.
    year: row.title?.match(/^\s*(\d{4})\b/)?.[1] || "",
    price: formatPrice(row),
    timing: formatTiming(row),
    image: imageUrl(row.hero_image_filename, imageBaseUrl),
    featuredTag: row.reserve_lowered
      ? "Reserve lowered"
      : statusLabels[row.lifecycle_status] || "",
  };
}

export async function fetchListings(client, { signal, imageBaseUrl } = {}) {
  const rows = [];

  // Supabase caps each response; keep fetching pages so filters see all listings.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client
      .rpc("get_website_listings", {}, { get: true })
      .select(LISTING_COLUMNS)
      .order("listed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .order("listing_type", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows.map((row) => mapListing(row, imageBaseUrl));
}

export function buildSearchableOptions(listings) {
  return Array.from(
    new Set(
      listings.flatMap((listing) => [
        listing.year,
        listing.title,
        listing.location,
        listing.type === "auction" ? "Auction" : "Classified",
      ]).filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildListingSearchIndex(listing) {
  return [listing.year, listing.type, listing.title, listing.description, listing.location]
    .join(" ")
    .toLowerCase();
}
