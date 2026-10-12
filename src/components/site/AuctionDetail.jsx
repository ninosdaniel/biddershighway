"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabaseClient";
import { apiError, websiteApi } from "../../lib/site/api";
import { Countdown } from "./Countdown";
const copy = {
  en: [
    "Place a bid",
    "Place an offer",
    "Save auction",
    "Current bid",
    "Reserve met",
    "Reserve not met",
    "Bid history",
    "Questions & comments",
    "Post comment",
    "Your comment is awaiting moderation.",
    "Description",
    "Photos",
    "Back to auctions",
    "Auction ended",
    "Buyer fee",
    "Photos",
  ],
  sv: [
    "Lägg bud",
    "Lägg förhandsbud",
    "Bevaka auktion",
    "Högsta bud",
    "Reservationspris uppnått",
    "Reservationspris ej uppnått",
    "Budhistorik",
    "Frågor och kommentarer",
    "Skicka kommentar",
    "Din kommentar väntar på granskning.",
    "Beskrivning",
    "Bilder",
    "Tillbaka till auktioner",
    "Auktionen avslutad",
    "Köparavgift",
    "Bilder",
  ],
  de: [
    "Gebot abgeben",
    "Angebot abgeben",
    "Auktion speichern",
    "Höchstgebot",
    "Mindestpreis erreicht",
    "Mindestpreis nicht erreicht",
    "Gebotshistorie",
    "Fragen und Kommentare",
    "Kommentar senden",
    "Ihr Kommentar wird geprüft.",
    "Beschreibung",
    "Bilder",
    "Zurück zu den Auktionen",
    "Auktion beendet",
    "Käufergebühr",
    "Bilder",
  ],
};
export function AuctionDetail({ initial, locale, children }) {
  const [auction, setAuction] = useState(initial);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const w = copy[locale];
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.hidden) return;
      const { data, error } = await getSupabase().rpc("get_website_auction", {
        p_slug: initial.slug,
        p_locale: locale,
      });
      if (alive && data && !error) setAuction(data);
    };
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [initial.slug, locale]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const image = (file) =>
    new URL(file, process.env.NEXT_PUBLIC_LISTING_IMAGE_BASE_URL).href;
  const images = auction.images.length
    ? auction.images
    : [{ filename: auction.hero_image_filename }].filter((i) => i.filename);
  const money = (cents) =>
    cents === null
      ? "—"
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "SEK",
          maximumFractionDigits: 0,
        }).format(cents / 100);
  return (
    <article className="site-auction">
      <Link href={`/${locale}/listings`}>← {w[12]}</Link>
      <h1>{auction.title}</h1>
      <p>{auction.location}</p>
      <div className="site-auction-gallery">
        {images.slice(0, 5).map((item, index) => (
          <button
            key={item.id || item.filename}
            onClick={() => setSelected(index)}
            aria-label={`${w[11]} ${index + 1}`}
          >
            <img
              src={image(item.filename)}
              alt={`${auction.title} — ${index + 1}`}
              loading={index ? "lazy" : "eager"}
            />
          </button>
        ))}
      </div>
      <button className="site-link-button" onClick={() => setSelected(0)}>
        {w[11]} ({images.length})
      </button>
      {selected !== null && images[selected] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={w[15]}
          className="site-lightbox"
        >
          <button
            className="site-lightbox-close"
            autoFocus
            onClick={() => setSelected(null)}
            aria-label="Close"
          >
            ×
          </button>
          <button
            onClick={() =>
              setSelected((selected + images.length - 1) % images.length)
            }
            aria-label="Previous"
          >
            ←
          </button>
          <img
            src={image(images[selected].filename)}
            alt={`${auction.title} — ${selected + 1}`}
          />
          <button
            onClick={() => setSelected((selected + 1) % images.length)}
            aria-label="Next"
          >
            →
          </button>
        </div>
      )}
      <div className="site-auction-columns">
        <div>
          <h2>{w[10]}</h2>
          {children}
          <h2>{w[7]}</h2>
          {auction.comments.map((comment) => (
            <blockquote key={comment.id}>
              <strong>{comment.author}</strong>
              <p>{comment.body}</p>
            </blockquote>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = new FormData(form).get("body");
              setBusy(true);
              setError("");
              try {
                await websiteApi("comment", { slug: auction.slug, body });
                setStatus(w[9]);
                form.reset();
              } catch (err) {
                setError(apiError(err, locale));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {w[7]}
              <textarea name="body" maxLength={5000} rows={4} required />
            </label>
            <button className="site-button" disabled={busy}>
              {w[8]}
            </button>
          </form>
          {status && <p role="status">{status}</p>}
          {error && <p role="alert">{error}</p>}
        </div>
        <aside>
          <p>{w[3]}</p>
          <strong className="site-auction-price">
            {money(auction.amount_cents)}
          </strong>
          {auction.reserve_met !== null && (
            <p>{auction.reserve_met ? w[4] : w[5]}</p>
          )}
          {auction.status === 3 && <Countdown end={auction.closed_at} />}
          {[2, 3].includes(auction.status) ? (
            <Link
              className="site-button"
              href={`/${locale}/auctions/${auction.slug}/${auction.status === 2 ? "offers" : "max_bids"}/new`}
            >
              {auction.status === 2 ? w[1] : w[0]}
            </Link>
          ) : (
            <p>{w[13]}</p>
          )}
          <Link
            className="site-button site-button-outline"
            href={`/${locale}/auctions/${auction.slug}/bookmarks/new`}
          >
            {w[2]}
          </Link>
          <p>
            {w[14]}: {auction.commission_percent}% ·{" "}
            <Link href={`/${locale}/docs/terms_and_conditions`}>
              4 000–60 000 SEK + VAT
            </Link>
          </p>
          <h2>{w[6]}</h2>
          <ol>
            {auction.bids.map((bid, i) => (
              <li key={`${bid.created_at}:${i}`}>
                <strong>{money(bid.amount_cents)}</strong>
                <span>{bid.bidder}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </article>
  );
}
