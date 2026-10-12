"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabaseClient";
import { Countdown } from "./Countdown";

const copy = {
  en: [
    "Cars for sale and auctions",
    "Find your next adventure.",
    "Search make, model or location",
    "All vehicles",
    "Live auctions",
    "Coming soon",
    "Sold",
    "Search",
    "Ending soon",
    "Newest first",
    "No vehicles match your search.",
    "We couldn't load the vehicles.",
    "Try again",
    "Sell with us",
    "Price undisclosed",
    "On request",
    "Vehicle listings",
    "No vehicles have been published yet.",
    "Check back soon for upcoming auctions and vehicles for sale.",
    "Loading vehicles…",
  ],
  sv: [
    "Bilar till salu och auktioner",
    "Hitta ditt nästa äventyr.",
    "Sök märke, modell eller plats",
    "Alla fordon",
    "Pågående auktioner",
    "Kommande",
    "Sålda",
    "Sök",
    "Avslutas snart",
    "Senaste först",
    "Inga fordon matchar din sökning.",
    "Fordonen kunde inte hämtas.",
    "Försök igen",
    "Sälj med oss",
    "Dolt slutpris",
    "Pris på förfrågan",
    "Fordonsannonser",
    "Inga fordon har publicerats ännu.",
    "Kom tillbaka snart för kommande auktioner och fordon till salu.",
    "Hämtar fordon…",
  ],
  de: [
    "Fahrzeuge und Auktionen",
    "Finden Sie Ihr nächstes Abenteuer.",
    "Marke, Modell oder Ort suchen",
    "Alle Fahrzeuge",
    "Laufende Auktionen",
    "Demnächst",
    "Verkauft",
    "Suchen",
    "Endet bald",
    "Neueste zuerst",
    "Keine passenden Fahrzeuge gefunden.",
    "Fahrzeuge konnten nicht geladen werden.",
    "Erneut versuchen",
    "Mit uns verkaufen",
    "Verkaufspreis verborgen",
    "Preis auf Anfrage",
    "Fahrzeugangebote",
    "Es wurden noch keine Fahrzeuge veröffentlicht.",
    "Schauen Sie bald wieder vorbei, um kommende Auktionen und Fahrzeuge zu entdecken.",
    "Fahrzeuge werden geladen…",
  ],
};
export function ListingsPage({ locale, search = {} }) {
  const w = copy[locale];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const router = useRouter();
  useEffect(() => {
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
  }, [retry]);
  const filtered = useMemo(() => {
    const q = String(search.q || "").toLocaleLowerCase();
    const status = search.lifecycle_status;
    return (rows || [])
      .filter((item) => {
        const year = Number(item.title?.match(/^\d{4}/)?.[0]);
        return (
          (!q ||
            `${item.title} ${item.description} ${item.location}`
              .toLocaleLowerCase()
              .includes(q)) &&
          (!status || status === "all" || item.lifecycle_status === status) &&
          (!search.kind || item.listing_type === search.kind) &&
          (!search.year_from || year >= Number(search.year_from)) &&
          (!search.year_to || year <= Number(search.year_to))
        );
      })
      .sort((a, b) =>
        search.sort === "ending_soon"
          ? new Date(a.ends_at || "9999-01-01") -
            new Date(b.ends_at || "9999-01-01")
          : new Date(b.listed_at || 0) - new Date(a.listed_at || 0),
      );
  }, [
    rows,
    search.q,
    search.lifecycle_status,
    search.kind,
    search.year_from,
    search.year_to,
    search.sort,
  ]);
  const image = (file) =>
    file
      ? new URL(file, process.env.NEXT_PUBLIC_LISTING_IMAGE_BASE_URL).href
      : "/brand/hero.webp";
  const price = (item) =>
    item.hidden_sale_price
      ? w[14]
      : item.price_cents == null
        ? w[15]
        : new Intl.NumberFormat(locale, {
            style: "currency",
            currency: item.price_currency || "SEK",
            maximumFractionDigits: 0,
          }).format(item.price_cents / 100);
  const count = 24,
    page = Math.max(1, Number(search.page) || 1),
    items = filtered.slice((page - 1) * count, page * count);
  const query = (changes) => {
    const params = new URLSearchParams({ ...search, ...changes });
    for (const [key, value] of params) if (!value) params.delete(key);
    return `/${locale}/listings?${params}`;
  };
  return (
    <div className="site-listings">
      <div className="site-listings-title">
        <h1>{w[0]}</h1>
        <Link className="site-button" href={`/${locale}/sales_inquiries/new`}>
          {w[13]} ↗
        </Link>
      </div>
      <form
        key={JSON.stringify(search)}
        className="site-listing-filters"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(
            query({
              ...Object.fromEntries(new FormData(e.currentTarget)),
              page: "1",
            }),
          );
        }}
      >
        <input
          name="q"
          aria-label={w[2]}
          placeholder={w[2]}
          defaultValue={search.q || ""}
        />
        <select
          name="lifecycle_status"
          aria-label={w[16]}
          defaultValue={search.lifecycle_status || ""}
        >
          {[
            ["", 3],
            ["live", 4],
            ["coming_soon", 5],
            ["sold", 6],
          ].map(([value, index]) => (
            <option key={value} value={value}>
              {w[index]}
            </option>
          ))}
        </select>
        <select
          name="sort"
          aria-label={w[8]}
          defaultValue={search.sort || "newest"}
        >
          <option value="newest">{w[9]}</option>
          <option value="ending_soon">{w[8]}</option>
        </select>
        <button className="site-button">{w[7]}</button>
      </form>
      {error ? (
        <div role="alert">
          <p>{w[11]}</p>
          <button
            className="site-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            {w[12]}
          </button>
        </div>
      ) : !rows ? (
        <p role="status">{w[19]}</p>
      ) : (
        <>
          {!rows.length ? (
            <div role="status" className="site-empty-listings">
              <h2>{w[17]}</h2>
              <p>{w[18]}</p>
            </div>
          ) : !items.length ? (
            <p>{w[10]}</p>
          ) : null}
          <div className="site-listing-grid">
            {items.map((item) => (
              <article
                className="site-listing-card"
                key={`${item.listing_type}:${item.id}`}
              >
                <Link
                  href={`/${locale}/${item.listing_type === "classified" ? "classifieds" : "auctions"}/${item.slug}`}
                >
                  <div className="site-card-photo">
                    <img
                      src={image(item.hero_image_filename)}
                      alt={item.title}
                      loading="lazy"
                    />
                    <span>
                      {item.lifecycle_status === "live"
                        ? w[4]
                        : item.lifecycle_status === "coming_soon"
                          ? w[5]
                          : item.lifecycle_status === "sold"
                            ? w[6]
                            : item.listing_type === "classified"
                              ? w[16]
                              : ""}
                    </span>
                  </div>
                  <div className="site-card-copy">
                    <h2>{item.title}</h2>
                    <p>{(item.description || "").replace(/<[^>]*>/g, "")}</p>
                    <div className="site-card-bottom">
                      <strong>{price(item)}</strong>
                      {item.lifecycle_status === "live" && item.ends_at && (
                        <Countdown end={item.ends_at} />
                      )}
                    </div>
                    <small>{item.location}</small>
                  </div>
                </Link>
              </article>
            ))}
          </div>
          {filtered.length > count && (
            <nav className="site-pagination" aria-label="Pagination">
              {page > 1 && (
                <Link href={query({ page: String(page - 1) })}>←</Link>
              )}
              <span>
                {page} / {Math.ceil(filtered.length / count)}
              </span>
              {page * count < filtered.length && (
                <Link href={query({ page: String(page + 1) })}>→</Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
