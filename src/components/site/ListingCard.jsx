import Link from "next/link";
import { listingImage, money } from "../../lib/site/listings";
import { Countdown } from "./Countdown";
import { ReserveBadges } from "./ReserveBadges";

export function ListingCard({ item, locale }) {
  const label = {
    sv: {
      auction: "Auktion",
      classified: "Annons",
      lowered: "Sänkt reservationspris",
      sold: "Såld",
      soon: "Kommer snart",
    },
    en: {
      auction: "Auction",
      classified: "Classified",
      lowered: "Lowered reserve",
      sold: "Sold",
      soon: "Coming soon",
    },
    de: {
      auction: "Auktion",
      classified: "Inserat",
      lowered: "Mindestpreis gesenkt",
      sold: "Verkauft",
      soon: "Demnächst",
    },
  }[locale];
  const src = listingImage(item.hero_image_filename);
  return (
    <article
      className="site-listing-card"
      id={`${item.listing_type}_${item.id}_listing_card`}
    >
      <Link
        href={`/${locale}/${item.listing_type === "classified" ? "classifieds" : "auctions"}/${item.slug}`}
        prefetch={false}
      >
        <div className="site-card-photo">
          {src && (
            <img
              src={src}
              alt={item.title}
              loading="lazy"
              width="820"
              height="560"
            />
          )}
          <span className={`site-card-kind ${item.listing_type}`}>
            {label[item.listing_type]}
          </span>
          <ReserveBadges item={item} locale={locale} />
        </div>
        <p className="site-card-location">
          <span className="icon" aria-hidden="true">
            pin_drop
          </span>
          {item.location}
        </p>
        <h2>{item.title}</h2>
        <p className="site-card-description">
          {(item.description || "").replace(/<[^>]*>/g, "")}
        </p>
        {item.lifecycle_status === "live" && item.ends_at && (
          <Countdown end={item.ends_at} locale={locale} />
        )}
        {item.lifecycle_status === "coming_soon" && (
          <span className="site-card-state">{label.soon}</span>
        )}
        {item.lifecycle_status === "sold" && (
          <span className="site-card-state">{label.sold}</span>
        )}
        {!item.hidden_sale_price &&
          !["coming_soon", "unsold"].includes(item.lifecycle_status) &&
          item.price_cents != null && (
            <div className="site-card-price">
              {money(item.price_cents, item.price_currency)}
            </div>
          )}
      </Link>
    </article>
  );
}
