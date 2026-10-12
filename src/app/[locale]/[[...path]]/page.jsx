import { notFound, redirect } from "next/navigation";
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
import { TransactionPage } from "../../../components/site/TransactionPage";
import { ListingsPage } from "../../../components/site/ListingsPage";
import { AuctionDetail } from "../../../components/site/AuctionDetail";
import { publicAuction } from "../../../lib/site/database";

async function resolve(params, searchParams) {
  const { locale, path = [] } = await params;
  if (!LOCALES.includes(locale)) return {};
  const pathname = `/${locale}${path.length ? `/${path.map(routeSegment).join("/")}` : ""}`;
  const search = await searchParams;
  const key = publicPageKey(pathname, search);
  return { locale, pathname, key, search };
}

export async function generateMetadata({ params, searchParams }) {
  const { key } = await resolve(params, searchParams);
  if (!key) return { title: "Bidders Highway" };
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
  const backendEnabled =
    process.env.NEXT_PUBLIC_WEBSITE_BACKEND_ENABLED === "true";
  // Public reads are independent of the switch that enables account/actions.
  // An empty database must remain an empty catalog, not a source-site preview.
  if (/^\/(en|sv|de)(\/(listings|classifieds))?$/.test(pathname))
    return (
      <>
        <SiteHeader locale={locale} />
        <main id="main-content">
          <ListingsPage
            locale={locale}
            search={
              pathname.endsWith("/classifieds")
                ? { ...search, kind: "classified" }
                : search
            }
          />
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  if (/^\/(en|sv|de)\/auctions\/[^/]+(?:\/albums.*)?$/.test(pathname)) {
    const auction = await publicAuction(
      decodeURIComponent(pathname.split("/")[3]),
      locale,
    );
    if (!auction) notFound();
    return (
      <>
        <SiteHeader locale={locale} />
        <main id="main-content">
          <AuctionDetail initial={auction} locale={locale}>
            <ReferenceContent html={auction.body || ""} locale={locale} />
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
