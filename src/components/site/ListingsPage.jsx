"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabaseClient";
import {
  auctionImages,
  filterListings,
  listingImage,
} from "../../lib/site/listings";
import { ListingCard } from "./ListingCard";
import { Countdown } from "./Countdown";
import { ReserveBadges } from "./ReserveBadges";
import { SaveSearch } from "./CustomerWorkflows";

const copy = {
  sv: {
    title: "Bilauktioner och försäljningar",
    all: "Alla",
    auctions: "Auktioner",
    classifieds: "Annonser",
    live: "Live",
    soon: "Kommer snart",
    sold: "Såld",
    search: "Sök",
    placeholder: "Sök på modell eller plats",
    sort: "Sortera",
    latest: "Senast tillagda",
    ending_soon: "Slutar snart",
    recently_closed: "Senast stängda",
    price_low: "Pris lägst först",
    price_high: "Pris högst först",
    from: "Från årsmodell",
    to: "Till årsmodell",
    clear: "Rensa",
    submit: "Filtrera",
    empty: "Inga fordon matchar din sökning.",
    error: "Fordonen kunde inte hämtas.",
    retry: "Försök igen",
    loading: "Hämtar fordon…",
    kind: "Typ",
    status: "Status",
    featured: "Utvald auktion",
    view: "Se auktionen",
  },
  en: {
    title: "Car auctions and sales",
    all: "All",
    auctions: "Auctions",
    classifieds: "Classifieds",
    live: "Live",
    soon: "Coming soon",
    sold: "Sold",
    search: "Search",
    placeholder: "Search model or location",
    sort: "Sort by",
    latest: "Recently added",
    ending_soon: "Ending soon",
    recently_closed: "Recently closed",
    price_low: "Price low to high",
    price_high: "Price high to low",
    from: "From year",
    to: "To year",
    clear: "Clear",
    submit: "Filter",
    empty: "No vehicles match your search.",
    error: "We couldn't load the vehicles.",
    retry: "Try again",
    loading: "Loading vehicles…",
    kind: "Type",
    status: "Status",
    featured: "Featured auction",
    view: "View auction",
  },
  de: {
    title: "Autoauktionen und Verkäufe",
    all: "Alle",
    auctions: "Auktionen",
    classifieds: "Inserate",
    live: "Live",
    soon: "Demnächst",
    sold: "Verkauft",
    search: "Suchen",
    placeholder: "Modell oder Ort suchen",
    sort: "Sortieren",
    latest: "Zuletzt hinzugefügt",
    ending_soon: "Endet bald",
    recently_closed: "Zuletzt beendet",
    price_low: "Preis aufsteigend",
    price_high: "Preis absteigend",
    from: "Baujahr von",
    to: "Baujahr bis",
    clear: "Zurücksetzen",
    submit: "Filtern",
    empty: "Keine passenden Fahrzeuge gefunden.",
    error: "Fahrzeuge konnten nicht geladen werden.",
    retry: "Erneut versuchen",
    loading: "Fahrzeuge werden geladen…",
    kind: "Typ",
    status: "Status",
    featured: "Ausgewählte Auktion",
    view: "Auktion ansehen",
  },
};
const brands = [
  ["mercedes", "Mercedes-Benz"],
  ["volvo", "Volvo"],
  ["bmw", "BMW"],
  ["ford", "Ford"],
  ["porsche", "Porsche"],
  ["chevrolet", "Chevrolet"],
  ["honda", "Honda"],
  ["volkswagen", "Volkswagen"],
  ["jaguar", "Jaguar"],
  ["saab", "Saab"],
];
export function ListingsPage({
  locale,
  search = {},
  featured = null,
  initialRows = null,
  children,
}) {
  const w = copy[locale];
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (initialRows) {
      setRows(initialRows);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setError(false);
    (async () => {
      const all = [];
      for (let from = 0; ; from += 100) {
        const { data, error } = await getSupabase()
          .rpc("get_website_listings", {}, { get: true })
          .order("listed_at", { ascending: false, nullsFirst: false })
          .order("id")
          .order("listing_type")
          .range(from, from + 99)
          .abortSignal(controller.signal);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 100) break;
      }
      if (alive) setRows(all);
    })().catch(() => {
      if (alive) setError(true);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [retry, initialRows]);
  const filtered = useMemo(
    () => filterListings(rows || [], search),
    [rows, search],
  );
  const count = 12;
  const page = Math.min(
    Math.max(1, Math.floor(Number(search.page) || 1)),
    Math.max(1, Math.ceil(filtered.length / count)),
  );
  const items = filtered.slice((page - 1) * count, page * count);
  const defaultState = !Object.values(search).some(Boolean);
  const endingSoon = defaultState
    ? filterListings(rows || [], { sort: "ending_soon" })
        .filter(
          (item) =>
            ["live", "coming_soon"].includes(item.lifecycle_status) &&
            Date.parse(item.ends_at) > Date.now() &&
            item.slug !== featured?.slug,
        )
        .slice(0, 4)
    : [];
  const query = (changes) => {
    const params = new URLSearchParams({ ...search, page: "", ...changes });
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    return `/${locale}/listings${params.size ? `?${params}` : ""}`;
  };
  const pillGroup = (name, label, options) => (
    <nav className={`site-pills site-pills-${name}`} aria-label={label}>
      {options.map(([value, text]) => (
        <Link
          key={value}
          href={query({
            [name]: value,
            ...(name === "kind" && value === "auction"
              ? { sort: "ending_soon" }
              : {}),
            ...(value === "sold" ? { sort: "recently_closed" } : {}),
          })}
          aria-current={(search[name] || "") === value ? "page" : undefined}
        >
          {text}
        </Link>
      ))}
    </nav>
  );
  const featureImages = featured
    ? [
        auctionImages(featured)[0],
        ...(featured.images || []).filter((image) => image.in_hero_grid),
        ...(featured.images || []).filter((image) => !image.in_hero_grid),
      ].filter(Boolean)
    : [];
  const categories = [
    ...new Set((rows || []).flatMap((item) => item.categories || [])),
  ].sort((a, b) => a.localeCompare(b, "sv"));
  return (
    <>
      <div className="site-catalog-surface">
        <div className="site-listings">
          <a
            className="site-trustpilot"
            href="https://www.trustpilot.com/review/biddershighway.com"
            target="_blank"
            rel="noreferrer"
          >
            Trustpilot
          </a>
          <h1>{w.title}</h1>
          <div className="site-filter-pills">
            {pillGroup("kind", w.kind, [
              ["", w.all],
              ["auction", w.auctions],
              ["classified", w.classifieds],
            ])}
            {pillGroup("lifecycle_status", w.status, [
              ["", w.all],
              ["live", w.live],
              ["coming_soon", w.soon],
              ["sold", w.sold],
            ])}
          </div>
          <form
            key={JSON.stringify(search)}
            className="site-listing-filters"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(
                query(Object.fromEntries(new FormData(event.currentTarget))),
              );
            }}
          >
            <label className="site-filter-search">
              {w.search}
              <input
                type="search"
                name="q"
                placeholder={w.placeholder}
                defaultValue={search.q || ""}
              />
            </label>
            {categories.length > 0 && (
              <label className="site-filter-category">
                {{ sv: "Kategori", en: "Category", de: "Kategorie" }[locale]}
                <select name="category" defaultValue={search.category || ""}>
                  <option value="">
                    {
                      {
                        sv: "Alla kategorier",
                        en: "All categories",
                        de: "Alle Kategorien",
                      }[locale]
                    }
                  </option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {w.sort}
              <select name="sort" defaultValue={search.sort || "latest"}>
                {[
                  "latest",
                  "ending_soon",
                  "recently_closed",
                  "price_low",
                  "price_high",
                ].map((value) => (
                  <option key={value} value={value}>
                    {w[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="site-filter-year">
              {w.from}
              <input
                type="number"
                min="1886"
                name="year_from"
                defaultValue={search.year_from || ""}
              />
            </label>
            <label className="site-filter-year">
              {w.to}
              <input
                type="number"
                min="1886"
                name="year_to"
                defaultValue={search.year_to || ""}
              />
            </label>
            <div className="site-filter-actions">
              <Link href={`/${locale}/listings`}>{w.clear}</Link>
              <button type="submit">{w.submit}</button>
            </div>
          </form>
          {search.q && <SaveSearch locale={locale} term={search.q} />}
          <nav className="site-brand-pills" aria-label={w.search}>
            {brands.map(([q, name]) => (
              <Link
                key={q}
                href={query({ q })}
                aria-current={search.q === q ? "page" : undefined}
              >
                {name}
              </Link>
            ))}
          </nav>
          {defaultState && featured && featureImages.length > 0 && (
            <section className="site-featured-auction">
              <Link
                className="site-featured-main"
                href={`/${locale}/auctions/${featured.slug}`}
              >
                <img
                  src={listingImage(featureImages[0].filename)}
                  alt={featured.title}
                  fetchPriority="high"
                />
                <ReserveBadges item={featured} locale={locale} />
                <div className="site-featured-copy">
                  <span className="site-featured-label">{w.featured}</span>
                  <h2>{featured.title}</h2>
                  <p>
                    <span className="icon" aria-hidden="true">
                      pin_drop
                    </span>
                    {featured.location}{" "}
                    <Countdown end={featured.closed_at} locale={locale} />
                  </p>
                  <span className="site-featured-link">
                    {w.view}
                    <span className="icon" aria-hidden="true">
                      arrow_forward
                    </span>
                  </span>
                </div>
              </Link>
              {featureImages.slice(1, 5).map((image) => (
                <Link
                  key={image.filename}
                  href={`/${locale}/auctions/${featured.slug}`}
                >
                  <img
                    src={listingImage(image.thumbnail || image.filename)}
                    alt={featured.title}
                    loading="lazy"
                  />
                </Link>
              ))}
            </section>
          )}
          {error ? (
            <div role="alert">
              <p>{w.error}</p>
              <button
                className="site-button"
                onClick={() => setRetry((n) => n + 1)}
              >
                {w.retry}
              </button>
            </div>
          ) : !rows ? (
            <p role="status">{w.loading}</p>
          ) : (
            <>
              {endingSoon.length > 0 && (
                <section className="site-ending-soon">
                  <h2>{w.ending_soon}</h2>
                  <div className="site-listing-grid">
                    {endingSoon.map((item) => (
                      <ListingCard
                        key={`${item.listing_type}:${item.id}`}
                        item={item}
                        locale={locale}
                      />
                    ))}
                  </div>
                </section>
              )}
              {!items.length && <p role="status">{w.empty}</p>}
              <div className="site-listing-grid">
                {items.map((item) => (
                  <ListingCard
                    key={`${item.listing_type}:${item.id}`}
                    item={item}
                    locale={locale}
                  />
                ))}
              </div>
              {filtered.length > count && (
                <nav className="site-pagination" aria-label="Pagination">
                  {page > 1 ? (
                    <Link
                      aria-label="Previous"
                      href={query({ page: String(page - 1) })}
                    >
                      ←
                    </Link>
                  ) : (
                    <span aria-hidden="true">←</span>
                  )}
                  {[
                    ...new Set(
                      [
                        1,
                        page - 1,
                        page,
                        page + 1,
                        Math.ceil(filtered.length / count),
                      ].filter(
                        (n) => n > 0 && n <= Math.ceil(filtered.length / count),
                      ),
                    ),
                  ].map((n, i, values) => (
                    <span key={n}>
                      {i > 0 && n - values[i - 1] > 1 && (
                        <span className="site-pagination-gap">…</span>
                      )}
                      <Link
                        href={query({ page: String(n) })}
                        aria-current={page === n ? "page" : undefined}
                      >
                        {n}
                      </Link>
                    </span>
                  ))}
                  {page * count < filtered.length && (
                    <Link
                      aria-label="Next"
                      href={query({ page: String(page + 1) })}
                    >
                      →
                    </Link>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
        {children}
      </div>
    </>
  );
}
