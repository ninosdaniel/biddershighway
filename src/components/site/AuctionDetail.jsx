"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiError, websiteApi } from "../../lib/site/api";
import vehicleMessages from "../../content/vehicle-messages.json";
import { ReserveBadges } from "./ReserveBadges";
import { auctionImages, listingImage, money } from "../../lib/site/listings";
import { Countdown } from "./Countdown";

const copy = {
  sv: {
    bid: "Lägg bud",
    offer: "Lägg förhandsbud",
    save: "Bevaka",
    price: "Högsta bud",
    reserve: "Reservationspris uppnått!",
    noReserve: "Reservationspris ej uppnått",
    bids: "Bud",
    questions: "Frågor",
    comments: "Kommentarer",
    send: "Skicka kommentar",
    pending: "Din kommentar väntar på granskning.",
    overview: "Översikt",
    photos: "Bilder",
    back: "Tillbaka",
    ended: "Auktionen avslutad",
    fee: "Köparavgift",
    location: "Plats",
    share: "Dela",
    copied: "Länk kopierad",
    close: "Stäng",
    previous: "Föregående",
    next: "Nästa",
    facts: "Basfakta",
    closing: "Stänger om",
    seller: "Säljare",
    placed: "Bud lagt av",
    sell: "Har du också ett liknande fordon att sälja?",
    contact: "Hör av dig till oss",
    terms: "Se våra allmänna villkor",
    all: "Se alla våra bilauktioner",
    fields: {
      year: "Årsmodell",
      manufacturer: "Bilmärke",
      model: "Modell",
      color: "Färg",
      odometer: "Avläst mätarställning (km)",
      transmission: "Växellåda",
    },
  },
  en: {
    bid: "Place a bid",
    offer: "Place an offer",
    save: "Watch",
    price: "Highest bid",
    reserve: "Reserve met!",
    noReserve: "Reserve not met",
    bids: "Bids",
    questions: "Questions",
    comments: "Comments",
    send: "Post comment",
    pending: "Your comment is awaiting moderation.",
    overview: "Overview",
    photos: "Photos",
    back: "Back",
    ended: "Auction ended",
    fee: "Buyer fee",
    location: "Location",
    share: "Share",
    copied: "Link copied",
    close: "Close",
    previous: "Previous",
    next: "Next",
    facts: "Basic facts",
    closing: "Closes in",
    seller: "Seller",
    placed: "Bid placed by",
    sell: "Do you have a similar vehicle to sell?",
    contact: "Get in touch with us",
    terms: "See our terms and conditions",
    all: "See all our car auctions",
    fields: {
      year: "Model year",
      manufacturer: "Make",
      model: "Model",
      color: "Color",
      odometer: "Odometer (km)",
      transmission: "Transmission",
    },
  },
  de: {
    bid: "Gebot abgeben",
    offer: "Angebot abgeben",
    save: "Beobachten",
    price: "Höchstgebot",
    reserve: "Mindestpreis erreicht!",
    noReserve: "Mindestpreis nicht erreicht",
    bids: "Gebote",
    questions: "Fragen",
    comments: "Kommentare",
    send: "Kommentar senden",
    pending: "Ihr Kommentar wird geprüft.",
    overview: "Übersicht",
    photos: "Bilder",
    back: "Zurück",
    ended: "Auktion beendet",
    fee: "Käufergebühr",
    location: "Standort",
    share: "Teilen",
    copied: "Link kopiert",
    close: "Schließen",
    previous: "Zurück",
    next: "Weiter",
    facts: "Basisdaten",
    closing: "Endet in",
    seller: "Verkäufer",
    placed: "Gebot von",
    sell: "Haben Sie ein ähnliches Fahrzeug zu verkaufen?",
    contact: "Kontaktieren Sie uns",
    terms: "Unsere Geschäftsbedingungen",
    all: "Alle Autoauktionen ansehen",
    fields: {
      year: "Baujahr",
      manufacturer: "Marke",
      model: "Modell",
      color: "Farbe",
      odometer: "Kilometerstand (km)",
      transmission: "Getriebe",
    },
  },
};
export function AuctionDetail({
  initial,
  locale,
  children,
  disclaimer,
  breadcrumb,
}) {
  const [auction, setAuction] = useState(initial);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const history = useRef(null);
  const w = copy[locale];
  const images = auctionImages(auction);
  const classified = auction.listing_type === "classified";
  useEffect(() => {
    setAuction(initial);
  }, [initial]);
  useEffect(() => {
    if (initial.listing_type === "classified") return;
    let alive = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(
          `/api/auctions/${encodeURIComponent(initial.slug)}?locale=${locale}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const data = await response.json();
          if (alive) setAuction(data);
        }
      } catch {
        /* Retain the last successful public response during outages. */
      }
    };
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [initial.slug, initial.listing_type, locale]);
  const date = (value) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Stockholm",
    }).format(new Date(value));
  const fieldName = (key) => `data_${key === "color" ? "exterior_color" : key}`;
  const fieldLabel = (key) =>
    vehicleMessages[
      `${locale}.activerecord.attributes.lot.${fieldName(key)}`
    ] ||
    w.fields[key] ||
    key;
  const fieldValue = (key, value) =>
    key === "odometer"
      ? `${new Intl.NumberFormat(locale).format(Number(value))} km`
      : vehicleMessages[
          `${locale}.activerecord.attributes.lot/${fieldName(key)}.${value}`
        ] || value;
  const facts = [
    "year",
    "manufacturer",
    "model",
    "color",
    "interior_color",
    "interior_material",
    "engine_displacement",
    "drive",
    "propulsion",
    "steering",
    "transmission",
    "odometer",
  ]
    .filter((key) => auction.data?.[key] != null && auction.data[key] !== "")
    .map((key) => [key, auction.data[key]]);
  const albumBase = `/${locale}/${classified ? "classifieds" : "auctions"}/${auction.slug}/albums`;
  const thumbnails = (auction.images || []).some((image) => image.in_hero_grid)
    ? auction.images.filter((image) => image.in_hero_grid).slice(0, 5)
    : (auction.images || []).slice(0, 5);
  const albumLink = (image) =>
    `${albumBase}/${image.album_id || image.album}${image.id ? `/images/${image.id}` : ""}`;
  const functionTests = [
    "vehicle_drivable",
    "show_inspection_issue",
    "show_ac_issue",
    "show_trip_meter_issue",
    "show_media_issue",
    "show_broken_electrics",
    "show_warning_lights",
    "show_seat_belt_issue",
    "show_lighting_issue",
    "show_engine_issue",
    "show_brake_issue",
    "show_clutch_issue",
    "show_transmission_issue",
  ]
    .map((key) => [key, auction.function_test?.[key]])
    .filter(([, value]) => typeof value === "boolean");
  const consignorImage = auction.consignor
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const highest = auction.bids?.[0];
  return (
    <div className="site-auction-surface">
      <article className="site-auction">
        <Link className="site-auction-back" href={`/${locale}/listings`}>
          ‹ {w.back}
        </Link>
        <div className="site-auction-layout">
          <div className="site-auction-visual">
            <div className="site-auction-cover">
              {images[0] && (
                <Link href={albumBase} aria-label={`${w.photos} 1`}>
                  <img
                    src={listingImage(images[0].filename)}
                    alt={auction.title}
                    fetchPriority="high"
                  />
                </Link>
              )}
              {[2, 3].includes(auction.status) && (
                <ReserveBadges item={auction} locale={locale} />
              )}
            </div>
            <div className="site-auction-thumbnails">
              {thumbnails.map((image, i) => (
                <Link
                  key={image.filename}
                  href={albumLink(image)}
                  aria-label={`${w.photos} ${i + 2}`}
                >
                  <img
                    src={listingImage(image.thumbnail || image.filename)}
                    alt={`${auction.title} — ${image.album || i + 2}`}
                    loading="lazy"
                  />
                </Link>
              ))}
            </div>
            <div className="site-hero-badges">
              {functionTests.length > 0 && (
                <Link href={`/${locale}/question_categories/verification`}>
                  <span className="icon" aria-hidden="true">
                    fact_check
                  </span>
                  {
                    vehicleMessages[
                      `${locale}.components.hero_badges_component.function_tested`
                    ]
                  }
                </Link>
              )}
              {!classified && (
                <Link href={`/${locale}/question_categories/shipping`}>
                  <span className="icon" aria-hidden="true">
                    local_shipping
                  </span>
                  {
                    vehicleMessages[
                      `${locale}.components.hero_badges_component.transport`
                    ]
                  }
                </Link>
              )}
            </div>
          </div>
          <aside className="site-auction-sidebar">
            <div className="site-auction-sticky">
              {breadcrumb}
              <h1>{auction.title}</h1>
              {classified && auction.excerpt && (
                <p className="site-classified-excerpt">{auction.excerpt}</p>
              )}
              <div className="site-auction-people">
                {auction.seller && (
                  <div className="site-auction-location">
                    <span className="icon" aria-hidden="true">
                      account_circle
                    </span>
                    <div>
                      <small>{w.seller}</small>
                      <strong>{auction.seller}</strong>
                    </div>
                  </div>
                )}
                <div className="site-auction-location">
                  <span className="icon" aria-hidden="true">
                    pin_drop
                  </span>
                  <div>
                    <small>{w.location}</small>
                    <strong>{auction.location}</strong>
                  </div>
                </div>
              </div>
              <div className="site-auction-share">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  <span className="icon" aria-hidden="true">
                    share
                  </span>
                  {copied ? w.copied : w.share}
                </button>
                <a href="#comments">
                  <span className="icon" aria-hidden="true">
                    chat
                  </span>
                  {w.comments}
                </a>
              </div>
              <section id="bid-container" className="site-bid-panel">
                <div className="site-bid-price">
                  <span>
                    {classified
                      ? vehicleMessages[
                          `${locale}.components.classified_bid_bar_component.asking_price`
                        ]
                      : w.price}
                  </span>
                  <strong>
                    {money(auction.amount_cents, auction.currency)}
                  </strong>
                </div>
                {!classified && (
                  <details ref={history} className="site-bid-history">
                    <summary aria-label={w.bids}>
                      <span className="icon" aria-hidden="true">
                        keyboard_arrow_down
                      </span>
                      <span className="site-sr-only">{w.bids}</span>
                    </summary>
                    <h2>{w.bids}</h2>
                    <ol>
                      {(auction.bids || []).map((bid, i) => (
                        <li key={`${bid.created_at}:${i}`}>
                          <div>
                            <strong>{bid.bidder}</strong>
                            <time dateTime={bid.created_at}>
                              {date(bid.created_at)}
                            </time>
                          </div>
                          <strong>{money(bid.amount_cents)}</strong>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {highest && (
                  <p className="site-bid-by">
                    {w.placed} {highest.bidder}, {date(highest.created_at)}
                  </p>
                )}
                <div className="site-bid-actions">
                  {!classified && (
                    <Link
                      className="site-watch-button"
                      href={`/${locale}/auctions/${auction.slug}/bookmarks/new`}
                    >
                      {w.save}
                    </Link>
                  )}
                  {classified && auction.status === "live" && (
                    <Link className="site-button" href={`/${locale}/classifieds/${auction.slug}/conversations/new`}>
                      {
                        vehicleMessages[
                          `${locale}.components.classified_contact_seller_button_component.cta`
                        ]
                      }
                    </Link>
                  )}
                  {[2, 3].includes(auction.status) && (
                    <Link
                      className="site-button"
                      href={`/${locale}/auctions/${auction.slug}/${auction.status === 2 ? "offers" : "max_bids"}/new`}
                    >
                      {auction.status === 2 ? w.offer : w.bid}
                    </Link>
                  )}
                </div>
                {!classified && auction.estimated_value && (
                  <p className="site-bid-reserve">
                    {
                      vehicleMessages[
                        `${locale}.activerecord.attributes.lot.estimated_value`
                      ]
                    }
                    : {auction.estimated_value}
                  </p>
                )}
                {!classified &&
                  (auction.status === 3 ? (
                    <div className="site-bid-countdown">
                      {w.closing}{" "}
                      <Countdown end={auction.closed_at} locale={locale} />
                      <small>({date(auction.closed_at)})</small>
                    </div>
                  ) : (
                    auction.status !== 2 && (
                      <p className="site-bid-countdown">{w.ended}</p>
                    )
                  ))}
              </section>
              {!classified && (
                <p className="site-sell-similar">
                  {w.sell}{" "}
                  <Link href={`/${locale}/sales_inquiries/new`}>
                    {w.contact}
                  </Link>
                  .
                </p>
              )}
            </div>
          </aside>
          <div className="site-auction-content">
            <nav className="site-auction-tabs">
              <a href="#data-sheet" aria-current="page">
                {w.overview}
              </a>
              {!classified && (
                <a
                  href="#bid-container"
                  onClick={() => {
                    if (history.current) history.current.open = true;
                  }}
                >
                  {w.bids}
                  <span>{auction.bids?.length || 0}</span>
                </a>
              )}
              <a href="#comments">
                {w.questions}
                <span>{auction.comments?.length || 0}</span>
              </a>
              {images.length > 0 && (
                <Link href={albumBase}>
                  {w.photos}
                  <span>{auction.images.length}</span>
                </Link>
              )}
            </nav>
            {!classified && auction.valuation_notes && (
              <div className="site-valuation">
                <blockquote>“{auction.valuation_notes}”</blockquote>
                <div>
                  <img
                    src={`/brand/${consignorImage}.jpg`}
                    alt={auction.consignor}
                    width="48"
                    height="48"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  <p>
                    <strong>{auction.consignor}</strong>
                    <small>
                      {
                        vehicleMessages[
                          `${locale}.components.auction_page_component.consignor`
                        ]
                      }
                    </small>
                  </p>
                </div>
              </div>
            )}
            {facts.length > 0 && (
              <section id="data-sheet">
                <h2>{w.facts}</h2>
                <dl className="site-auction-facts">
                  {facts.map(([key, value]) => (
                    <div key={key}>
                      <dt>{fieldLabel(key)}:</dt>
                      <dd>{fieldValue(key, value)}</dd>
                    </div>
                  ))}
                  {auction.vin && (
                    <div>
                      <dt>VIN:</dt>
                      <dd>{auction.vin}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
            <div className="site-auction-description">{children}</div>
            {functionTests.length > 0 && (
              <section className="site-function-test">
                <h3>
                  {
                    vehicleMessages[
                      `${locale}.components.function_test_component.title`
                    ]
                  }
                </h3>
                <ul>
                  {functionTests.map(([key, value]) => (
                    <li key={key} className={value ? "passed" : "failed"}>
                      <span className="icon" aria-hidden="true">
                        {value ? "check" : "close"}
                      </span>
                      {vehicleMessages[
                        `${locale}.components.function_test_component.labels.${key}`
                      ] || key}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!classified && (
              <div className="site-auction-disclaimer">{disclaimer}</div>
            )}
            <section id="comments">
              <h2>
                {auction.comments?.length || 0} {w.comments}
              </h2>
              {classified ? (
                <Link className="site-button" href={`/${locale}/sign_ins/new`}>
                  {
                    {
                      sv: "Logga in för att kommentera",
                      en: "Sign in to comment",
                      de: "Zum Kommentieren anmelden",
                    }[locale]
                  }
                </Link>
              ) : (
                <form
                  className="site-comment-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    setBusy(true);
                    setError("");
                    try {
                      await websiteApi("comment", {
                        slug: auction.slug,
                        body: new FormData(form).get("body"),
                      });
                      setStatus(w.pending);
                      form.reset();
                    } catch (e) {
                      setError(apiError(e, locale));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <textarea
                    name="body"
                    aria-label={w.comments}
                    maxLength={5000}
                    rows={3}
                    required
                  />
                  <button disabled={busy} aria-label={w.send}>
                    <span className="icon" aria-hidden="true">
                      send
                    </span>
                  </button>
                </form>
              )}
              {status && <p role="status">{status}</p>}
              {error && <p role="alert">{error}</p>}
              {(auction.comments || []).map((comment) => (
                <blockquote className="site-auction-comment" key={comment.id}>
                  <header>
                    <strong>{comment.author}</strong>
                    <time dateTime={comment.created_at}>
                      {date(comment.created_at)}
                    </time>
                  </header>
                  <p>{comment.body}</p>
                </blockquote>
              ))}
            </section>
            <Link className="site-all-auctions" href={`/${locale}/listings`}>
              {w.all}
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
