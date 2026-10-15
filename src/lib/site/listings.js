export const IMAGE_BASE =
  "https://bidders-highway.fra1.cdn.digitaloceanspaces.com/";

export function listingImage(filename) {
  return filename
    ? new URL(
        filename,
        process.env.NEXT_PUBLIC_LISTING_IMAGE_BASE_URL || IMAGE_BASE,
      ).href
    : null;
}

export function money(cents, currency = "SEK") {
  return cents == null
    ? "—"
    : `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(cents / 100)} ${currency}`;
}

export function filterListings(rows, search = {}) {
  const q = String(search.q || "")
    .trim()
    .toLocaleLowerCase();
  const timestamp = (value) => Date.parse(value) || 0;
  const price = (item) => (item.hidden_sale_price ? null : item.price_cents);
  return rows
    .filter((item) => {
      const year = Number(item.title?.match(/^\d{4}/)?.[0]);
      return (
        (!q ||
          `${item.title} ${item.description || ""} ${item.location || ""}`
            .toLocaleLowerCase()
            .includes(q)) &&
        (!search.kind || item.listing_type === search.kind) &&
        (!search.category || item.categories?.includes(search.category)) &&
        (!search.lifecycle_status ||
          search.lifecycle_status === "all" ||
          item.lifecycle_status === search.lifecycle_status) &&
        (!search.year_from || year >= Number(search.year_from)) &&
        (!search.year_to || year <= Number(search.year_to))
      );
    })
    .sort((a, b) => {
      if (search.sort === "ending_soon")
        return (
          (timestamp(a.ends_at) || Infinity) -
          (timestamp(b.ends_at) || Infinity)
        );
      if (search.sort === "recently_closed")
        return timestamp(b.ends_at) - timestamp(a.ends_at);
      if (["price_low", "price_high"].includes(search.sort)) {
        if (price(a) == null) return price(b) == null ? 0 : 1;
        if (price(b) == null) return -1;
        return search.sort === "price_low"
          ? price(a) - price(b)
          : price(b) - price(a);
      }
      return timestamp(b.listed_at) - timestamp(a.listed_at);
    });
}

// The cover is independent of the album's alphabetical ordering.
export function auctionImages(auction) {
  const images = (auction.images || []).filter((image) => image.filename);
  if (!auction.hero_image_filename) return images;
  return [
    images.find((image) => image.filename === auction.hero_image_filename) || {
      filename: auction.hero_image_filename,
    },
    ...images.filter((image) => image.filename !== auction.hero_image_filename),
  ];
}
