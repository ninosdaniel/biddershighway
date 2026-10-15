"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { listingImage } from "../../lib/site/listings";
const names = {
  sv: {
    exterior: "Exteriör",
    interior: "Interiör",
    mechanics: "Mekanik",
    mechanical: "Mekanik",
    documentation: "Dokumentation",
    other: "Övrigt",
    miscellaneous: "Övrigt",
  },
  en: {
    exterior: "Exterior",
    interior: "Interior",
    mechanics: "Mechanics",
    mechanical: "Mechanics",
    documentation: "Documentation",
    other: "Other",
    miscellaneous: "Other",
  },
  de: {
    exterior: "Exterieur",
    interior: "Interieur",
    mechanics: "Technik",
    mechanical: "Technik",
    documentation: "Dokumentation",
    other: "Sonstiges",
    miscellaneous: "Sonstiges",
  },
};
export function AuctionGallery({ auction, locale, albumId, imageId }) {
  const router = useRouter();
  const base = `/${locale}/${auction.listing_type === "classified" ? "classifieds" : "auctions"}/${auction.slug}`;
  const albums = [
    ...new Map(
      auction.images.map((image) => [
        image.album_id || image.album,
        { id: image.album_id || image.album, name: image.album },
      ]),
    ).values(),
  ];
  const album = albums.find((item) => item.id === albumId) || albums[0];
  const images = auction.images.filter(
    (image) => (image.album_id || image.album) === album?.id,
  );
  const index = Math.max(
    0,
    images.findIndex((image) => image.id === imageId),
  );
  const current = images[index];
  const href = (image) =>
    `${base}/albums/${image.album_id || image.album}/images/${image.id}`;
  const previous = images[(index + images.length - 1) % images.length];
  const next = images[(index + 1) % images.length];
  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape") router.push(base);
      if (event.key === "ArrowLeft" && previous) router.replace(href(previous));
      if (event.key === "ArrowRight" && next) router.replace(href(next));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [base, previous, next, router]);
  return (
    <main className="site-album-page" id="main-content">
      <nav className="site-album-menu">
        <Link className="site-album-back" href={base}>
          ‹{" "}
          {
            {
              sv: "Tillbaka till objektet",
              en: "Back to vehicle",
              de: "Zurück zum Fahrzeug",
            }[locale]
          }
        </Link>
        {albums.map((item) => (
          <Link
            key={item.id}
            href={`${base}/albums/${item.id}`}
            prefetch={false}
            aria-current={album?.id === item.id ? "page" : undefined}
          >
            {names[locale][item.name] || item.name}
          </Link>
        ))}
      </nav>
      {current && (
        <>
          <div className="site-album-stage">
            <Link
              href={href(previous)}
              replace
              prefetch={false}
              aria-label={
                {
                  sv: "Föregående bild",
                  en: "Previous image",
                  de: "Vorheriges Bild",
                }[locale]
              }
            >
              ‹
            </Link>
            <img
              src={listingImage(current.filename)}
              alt={`${auction.title} — ${names[locale][current.album] || current.album} (${index + 1})`}
            />
            <Link
              href={href(next)}
              replace
              prefetch={false}
              aria-label={
                { sv: "Nästa bild", en: "Next image", de: "Nächstes Bild" }[
                  locale
                ]
              }
            >
              ›
            </Link>
          </div>
          <nav
            className="site-album-strip"
            aria-label={{ sv: "Bilder", en: "Photos", de: "Bilder" }[locale]}
          >
            {images.map((image, i) => (
              <Link
                href={href(image)}
                replace
                prefetch={false}
                key={image.id}
                aria-current={i === index ? "page" : undefined}
              >
                <img
                  src={listingImage(image.thumbnail || image.filename)}
                  alt={`${names[locale][image.album] || image.album} ${i + 1}`}
                  loading="lazy"
                />
              </Link>
            ))}
          </nav>
        </>
      )}
    </main>
  );
}
