import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { SiteFooter } from "../../../components/site/SiteFooter";
import { ReferenceContent } from "../../../components/site/ReferenceContent";
import { getPublicPage } from "../../../lib/site/content";
import {
  LOCALES,
  publicPageKey,
  isAccountPath,
  localHref,
  routeSegment,
} from "../../../lib/site/paths";
import { AccountPage } from "../../../components/site/AccountPage";
import { ConversationsPage, CustomerActivity } from "../../../components/site/CustomerWorkflows";
import { StaffWorkspace } from "../../../components/site/StaffWorkspace";
import { ClassifiedManager } from "../../../components/site/ClassifiedManager";
import { TransactionPage } from "../../../components/site/TransactionPage";
import { ListingsPage } from "../../../components/site/ListingsPage";
import { AuctionDetail } from "../../../components/site/AuctionDetail";
import { AuctionGallery } from "../../../components/site/AuctionGallery";
import { BrandArchive } from "../../../components/site/BrandArchive";
import { matchingEntry } from "../../../lib/site/brands";
import { listingImage } from "../../../lib/site/listings";
import vehicleMessages from "../../../content/vehicle-messages.json";
import {
  publicAuction,
  publicCatalog,
  featuredAuction,
  publicClassified,
  publicBrands,
} from "../../../lib/site/database";
import homeSv from "../../../content/home/sv.json";
import homeEn from "../../../content/home/en.json";
import homeDe from "../../../content/home/de.json";

async function resolve(params, searchParams) {
  const { locale, path = [] } = await params;
  if (!LOCALES.includes(locale)) return {};
  const pathname = `/${locale}${path.length ? `/${path.map(routeSegment).join("/")}` : ""}`;
  const search = await searchParams;
  const key = publicPageKey(pathname, search);
  return { locale, pathname, key, search };
}

export async function generateMetadata({ params, searchParams }) {
  const { key, pathname, locale } = await resolve(params, searchParams);
  if (/\/(account|admin)(\/|$)/.test(pathname || "")) return { title: "Bidders Highway", robots: { index: false, follow: false } };
  if (!key) return { title: "Bidders Highway" };
  const vehicle = pathname.match(
    /^\/(en|sv|de)\/(auctions|classifieds)\/([^/]+)(?:\/albums.*)?$/,
  );
  if (vehicle) {
    const record = await (
      vehicle[2] === "classifieds" ? publicClassified : publicAuction
    )(decodeURIComponent(vehicle[3]), locale);
    if (record)
      return {
        title: { absolute: `${record.title} - Bidders Highway` },
        description: record.excerpt || undefined,
        openGraph: {
          title: record.title,
          images: record.hero_image_filename
            ? [listingImage(record.hero_image_filename)]
            : [],
        },
      };
  }
  if (/^\/(en|sv|de)(\/(listings|classifieds))?$/.test(pathname)) {
    return {
      title: {
        absolute: `${{ sv: "Bilauktioner och försäljningar", en: "Car auctions and sales", de: "Autoauktionen und Verkäufe" }[locale]} - Bidders Highway`,
      },
    };
  }
  const archive = pathname.match(
    /^\/(en|sv|de)\/(cars|motorcycles)(?:\/([^/]+)(?:\/([^/]+))?)?$/,
  );
  if (archive) {
    const type = archive[2] === "cars" ? "car" : "motorcycle";
    const brands = await publicBrands(locale);
    const brand = brands.find(
      (b) =>
        b.slug === archive[3] && b.vehicle_type === (type === "car" ? 0 : 1),
    );
    const model = brand?.models.find((m) => m.slug === archive[4]);
    const name = [brand?.name, model?.name].filter(Boolean).join(" ");
    const view = brand ? "show_view" : "index_view";
    return {
      title: {
        absolute: `${vehicleMessages[`${locale}.views.brands.${view}.title_${type}`]?.replaceAll("%{brand}", name)} - Bidders Highway`,
      },
      description: vehicleMessages[
        `${locale}.views.brands.${view}.meta_description_${type}`
      ]?.replaceAll("%{brand}", name),
    };
  }
  const page = await getPublicPage(key);
  return {
    title: { absolute: page?.title || "Bidders Highway" },
    description: page?.description,
    ...(page?.robots?.startsWith("noindex")
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}

export default async function PublicPage({ params, searchParams }) {
  const { locale, pathname, key, search } = await resolve(params, searchParams);
  if (!locale) notFound();
  if (localHref(pathname, locale) !== pathname)
    redirect(localHref(pathname, locale));
  if (pathname === `/${locale}/admin`) return <><SiteHeader locale={locale} /><main id="main-content"><StaffWorkspace locale={locale} /></main><SiteFooter locale={locale} /></>;
  const manageClassified = pathname.match(/^\/(?:en|sv|de)\/(account|admin)\/classifieds(?:\/([^/]+)(?:\/edit)?)?$/);
  if (manageClassified) return <><SiteHeader locale={locale} /><main id="main-content"><ClassifiedManager locale={locale} staff={manageClassified[1] === "admin"} slug={manageClassified[2]} /></main><SiteFooter locale={locale} /></>;
  const conversation = pathname.match(/^\/(?:en|sv|de)\/account\/conversations(?:\/([a-f0-9-]{36}))?$/i);
  const contactSeller = pathname.match(/^\/(?:en|sv|de)\/classifieds\/([^/]+)\/conversations\/new$/);
  const activity = pathname.match(/^\/(?:en|sv|de)\/account\/(activity|saved_searches|preferences|(?:buyer_(?:live|won|lost)|seller_(?:draft|live|concluded))_auctions)$/);
  if (conversation || contactSeller || activity) return <><SiteHeader locale={locale} /><main id="main-content">{activity ? <CustomerActivity locale={locale} section={activity[1]} /> : <ConversationsPage locale={locale} id={conversation?.[1]} slug={contactSeller ? decodeURIComponent(contactSeller[1]) : undefined} />}</main><SiteFooter locale={locale} /></>;
  const backendEnabled =
    process.env.NEXT_PUBLIC_WEBSITE_BACKEND_ENABLED === "true";
  // Public reads are independent of the switch that enables account/actions.
  // An empty database must remain an empty catalog, not a source-site preview.
  if (/^\/(en|sv|de)(\/(listings|classifieds))?$/.test(pathname)) {
    const [rows, featured] = await Promise.all([
      publicCatalog(locale),
      featuredAuction(locale),
    ]);
    return (
      <>
        <SiteHeader locale={locale} />
        <main id="main-content">
          <ListingsPage
            locale={locale}
            featured={featured}
            initialRows={rows}
            search={
              pathname.endsWith("/classifieds")
                ? { ...search, kind: "classified" }
                : search
            }
          >
            <ReferenceContent
              html={{ sv: homeSv, en: homeEn, de: homeDe }[locale].html}
              locale={locale}
              backendEnabled={backendEnabled}
            />
          </ListingsPage>
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }
  const archive = pathname.match(
    /^\/(en|sv|de)\/(cars|motorcycles)(?:\/([^/]+)(?:\/([^/]+))?)?$/,
  );
  if (archive) {
    const [brands, rows] = await Promise.all([
      publicBrands(locale),
      publicCatalog(locale),
    ]);
    const vehicleType = archive[2] === "cars" ? 0 : 1;
    const brand = brands.find(
      (b) => b.slug === archive[3] && b.vehicle_type === vehicleType,
    );
    const model = brand?.models.find((m) => m.slug === archive[4]);
    if ((archive[3] && !brand) || (archive[4] && !model)) notFound();
    return (
      <>
        <SiteHeader locale={locale} />
        <main id="main-content">
          <BrandArchive
            locale={locale}
            vehicleType={vehicleType}
            brands={brands}
            brand={brand}
            model={model}
            rows={rows}
            page={search.page}
          />
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }
  if (
    /^\/(en|sv|de)\/(auctions|classifieds)\/[^/]+(?:\/albums(?:\/[^/]+(?:\/images\/[^/]+)?)?)?$/.test(
      pathname,
    )
  ) {
    const auction = await (
      pathname.split("/")[2] === "classifieds"
        ? publicClassified
        : publicAuction
    )(decodeURIComponent(pathname.split("/")[3]), locale);
    if (!auction) notFound();
    if (pathname.includes("/albums")) {
      const segments = pathname.split("/");
      const albumId = segments[5];
      const imageId = segments[7];
      if (
        albumId &&
        !auction.images.some(
          (image) => image.album_id === albumId || image.album === albumId,
        )
      )
        notFound();
      if (
        imageId &&
        !auction.images.some(
          (image) => image.id === imageId && image.album_id === albumId,
        )
      )
        notFound();
      return (
        <AuctionGallery
          auction={auction}
          locale={locale}
          albumId={albumId}
          imageId={imageId}
        />
      );
    }
    const brands = await publicBrands(locale);
    const brand = matchingEntry(
      auction.data?.manufacturer,
      brands.filter((b) => b.vehicle_type === auction.vehicle_type),
    );
    const model = brand && matchingEntry(auction.data?.model, brand.models);
    const brandBase = `/${locale}/${auction.vehicle_type === 1 ? "motorcycles" : "cars"}`;
    return (
      <>
        <SiteHeader locale={locale} />
        <main id="main-content">
          <AuctionDetail
            initial={auction}
            locale={locale}
            breadcrumb={
              brand && (
                <nav className="site-vehicle-breadcrumb">
                  <Link href={`${brandBase}/${brand.slug}`}>{brand.name}</Link>
                  {model && (
                    <>
                      {" "}
                      /{" "}
                      <Link href={`${brandBase}/${brand.slug}/${model.slug}`}>
                        {model.name}
                      </Link>
                    </>
                  )}
                </nav>
              )
            }
            disclaimer={
              <ReferenceContent
                html={
                  vehicleMessages[
                    `${locale}.components.auction_page_component.disclaimer`
                  ] || ""
                }
                locale={locale}
              />
            }
          >
            <ReferenceContent
              html={(auction.video_embed || "") + (auction.body || "")}
              locale={locale}
            />
          </AuctionDetail>
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }
  if (!key) {
    if (!isAccountPath(pathname)) notFound();
    const transaction =
      /\/auctions\/[^/]+\/(max_bids|offers|bookmarks)|\/detailed_leads\//.test(
        pathname,
      );
    return (
      <>
        <SiteHeader locale={locale} />
        <main id="main-content">
          {transaction ? (
            <TransactionPage locale={locale} pathname={pathname} />
          ) : (
            <AccountPage locale={locale} />
          )}
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  }
  const page = await getPublicPage(key);
  if (!page) notFound();
  if (page.redirect) redirect(page.redirect);
  return (
    <>
      <SiteHeader locale={locale} alternates={page.alternates} />
      <main id="main-content" lang={locale}>
        <ReferenceContent
          html={page.mainHtml}
          locale={locale}
          backendEnabled={backendEnabled}
        />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
