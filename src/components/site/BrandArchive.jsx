import Link from "next/link";
import { load } from "cheerio";
import messages from "../../content/vehicle-messages.json";
import { listingImage } from "../../lib/site/listings";
import { brandListings } from "../../lib/site/brands";
import { ListingCard } from "./ListingCard";
import { ReferenceContent } from "./ReferenceContent";
import { BackendForm } from "./BackendForm";

export function BrandArchive({
  locale,
  vehicleType,
  brands,
  brand,
  model,
  rows,
  page = 1,
}) {
  const type = vehicleType === 1 ? "motorcycle" : "car";
  const base = `/${locale}/${vehicleType === 1 ? "motorcycles" : "cars"}`;
  const t = (key, vars = {}) =>
    (messages[`${locale}.${key}`] || "").replace(
      /%\{([^}]+)\}/g,
      (_, name) => vars[name] ?? "",
    );
  const heading = t(`views.brands.index_view.heading_${type}`);
  if (!brand)
    return (
      <div className="site-brand-index">
        <h1>{heading}</h1>
        <p>{t(`views.brands.index_view.intro_${type}`)}</p>
        <ul>
          {brands
            .filter((b) => b.vehicle_type === vehicleType)
            .map((b) => (
              <li key={b.slug}>
                <Link href={`${base}/${b.slug}`}>{b.name}</Link>
              </li>
            ))}
        </ul>
      </div>
    );
  const name = [brand.name, model?.name].filter(Boolean).join(" ");
  const items = brandListings(rows || [], brands, brand, model);
  const $ = load((model || brand).summary || "", null, false);
  const paragraphs = $("p").toArray();
  const lead = paragraphs[0]
    ? $(paragraphs[0]).text()
    : t(`views.brands.show_view.meta_description_${type}`, { brand: name });
  const body = paragraphs
    .slice(1)
    .map((p) => $.html(p))
    .join("");
  const pages = Math.max(1, Math.ceil(items.length / 12));
  const current = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
  const route = `${base}/${brand.slug}${model ? `/${model.slug}` : ""}`;
  const hero = items.find((item) => item.hero_image_filename);
  return (
    <>
      <header className="site-brand-hero">
        <div>
          <nav>
            <Link href={base}>{heading}</Link> /{" "}
            {model ? (
              <>
                <Link href={`${base}/${brand.slug}`}>{brand.name}</Link> /{" "}
                {model.name}
              </>
            ) : (
              brand.name
            )}
          </nav>
          <h1>{name}</h1>
          <p>{lead}</p>
          <small>
            {t(
              `views.brands.show_view.listing_count.${items.length === 1 ? "one" : "other"}`,
              { count: items.length },
            )}
          </small>
        </div>
        {hero && (
          <img src={listingImage(hero.hero_image_filename)} alt={hero.title} />
        )}
      </header>
      <section className="site-brand-sell">
        <div>
          <h2>
            {t("components.sell_your_vehicle_component.title", {
              vehicle: name,
            })}
          </h2>
          <p>{t("components.sell_your_vehicle_component.body")}</p>
          <BackendForm
            action={`/${locale}/sales_inquiries`}
            locale={locale}
            className="site-brand-lead"
          >
            <input
              name="lead[lead_generator]"
              type="hidden"
              value={model ? "model_hub" : "brand_hub"}
            />
            <div className="site-brand-lead-fields">
              <label>
                <img src="/brand/reg-plate.svg" alt="" />
                <input
                  name="lead[registration_number]"
                  placeholder={
                    {
                      sv: "Registreringsnummer",
                      en: "Registration number",
                      de: "Kennzeichen",
                    }[locale]
                  }
                  aria-label={
                    {
                      sv: "Registreringsnummer",
                      en: "Registration number",
                      de: "Kennzeichen",
                    }[locale]
                  }
                  autoComplete="off"
                  required
                />
              </label>
              <input
                type="email"
                name="lead[email]"
                placeholder={
                  { sv: "E-post", en: "Email", de: "E-Mail" }[locale]
                }
                aria-label={{ sv: "E-post", en: "Email", de: "E-Mail" }[locale]}
                autoComplete="email"
                required
              />
              <input
                type="tel"
                name="lead[phone]"
                placeholder={
                  {
                    sv: "Telefonnummer",
                    en: "Phone number",
                    de: "Telefonnummer",
                  }[locale]
                }
                aria-label={
                  {
                    sv: "Telefonnummer",
                    en: "Phone number",
                    de: "Telefonnummer",
                  }[locale]
                }
                autoComplete="tel"
                required
              />
            </div>
            <button type="submit" className="site-button">
              {t("components.sell_your_vehicle_component.submit")}
            </button>
          </BackendForm>
          <small>{t("components.sell_your_vehicle_component.notice")}</small>
        </div>
      </section>
      <div className="site-brand-content">
        <nav
          className="site-brand-models"
          aria-label={t("views.brands.show_view.models")}
        >
          {brand.models.map((m) => (
            <Link
              key={m.slug}
              href={`${base}/${brand.slug}/${m.slug}`}
              aria-current={model?.slug === m.slug ? "page" : undefined}
            >
              {brand.name} {m.name}
            </Link>
          ))}
        </nav>
        {body && (
          <div className="site-brand-body">
            <ReferenceContent html={body} locale={locale} />
          </div>
        )}
        <div className="site-listing-grid">
          {items.slice((current - 1) * 12, current * 12).map((item) => (
            <ListingCard
              key={`${item.listing_type}:${item.id}`}
              item={item}
              locale={locale}
            />
          ))}
        </div>
        {pages > 1 && (
          <nav className="site-pagination" aria-label="Pagination">
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter(
                (p) => p === 1 || p === pages || Math.abs(p - current) <= 2,
              )
              .map((p, i, list) => (
                <span key={p}>
                  {i > 0 && list[i - 1] !== p - 1 && "…"}
                  <Link
                    href={`${route}?page=${p}`}
                    aria-current={p === current ? "page" : undefined}
                  >
                    {p}
                  </Link>
                </span>
              ))}
          </nav>
        )}
      </div>
    </>
  );
}
