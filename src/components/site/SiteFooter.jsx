import Link from "next/link";
import { t } from "../../lib/site/messages";

export function SiteFooter({ locale }) {
  const label = (key) => t(locale, `components.footer_component.${key}`);
  const columns = [
    [
      "auctions",
      [
        ["ongoing", "listings?lifecycle_status=live"],
        ["closed", "listings?lifecycle_status=sold"],
        ["purchasable", "listings?kind=classified"],
        ["cars", "cars"],
        ["motorcycles", "motorcycles"],
        ["collection_sales", "collection_leads/new"],
        ["estate_sales", "estate-sales/new"],
      ],
    ],
    [
      "help",
      [
        ["faq", "questions"],
        ["cookie_policy", "docs/cookie_policy"],
        ["terms_and_conditions", "docs/terms_and_conditions"],
      ],
    ],
    [
      "company",
      [
        ["about_us", "pages/about-us"],
        ["articles", "posts"],
        ["contact_us", "mailto:support@biddershighway.com"],
        ["work_with_us", "jobs"],
      ],
    ],
  ];
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <Link href={`/${locale}`}>
          <img
            src="/brand/logo-footer.svg"
            width="230"
            height="90"
            alt="Bidders Highway"
          />
        </Link>
        {columns.map(([title, links]) => (
          <div key={title}>
            <h2>{label(title)}</h2>
            <ul>
              {links.map(([key, path]) => (
                <li key={key}>
                  <Link
                    href={
                      path.startsWith("mailto:") ? path : path === "jobs"
                        ? "https://biddershighway.uhigher.com"
                        : `/${locale}/${path}`
                    }
                  >
                    {label(key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} Bidders Highway</span>
        <span>Bidders Highway AB, 133 33 Saltsjöbaden</span>
        <span>Org.no 559296-2939</span>
      </div>
    </footer>
  );
}
