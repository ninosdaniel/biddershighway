"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { interfaceText, t } from "../../lib/site/messages";
import { getSupabase } from "../../lib/supabaseClient";
import { backendEnabled } from "../../lib/site/api";

export function SiteHeader({ locale, alternates = {} }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const words = interfaceText[locale];
  const label = (key) => t(locale, `components.page_header_component.${key}`);
  const links = [
    ["auctions", "listings"],
    ["faq", "questions"],
    ["articles", "posts"],
    ["sell_with_us", "sales_inquiries/new"],
  ];
  useEffect(() => {
    if (!backendEnabled()) return;
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setLanguageOpen(false);
    document.documentElement.lang = locale;
    document.body.lang = locale;
  }, [pathname, locale]);

  useEffect(() => {
    function escape(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setLanguageOpen(false);
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">
        {words.skip}
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <button
            className="site-menu-toggle"
            aria-label={words.menu}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="icon" aria-hidden="true">
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
          <Link
            href={`/${locale}`}
            className="site-logo"
            aria-label="Bidders Highway"
          >
            <img
              src="/brand/logo.svg"
              width="160"
              height="43"
              alt="Bidders Highway"
            />
          </Link>
          <nav className="site-desktop-nav" aria-label="Main">
            {links.map(([key, path]) => (
              <Link
                key={key}
                href={`/${locale}/${path}`}
                className={key === "sell_with_us" ? "site-sell-link" : ""}
                aria-current={
                  pathname === `/${locale}/${path}` ? "page" : undefined
                }
              >
                {key === "articles"
                  ? t(locale, "activerecord.models.blog_post.other")
                  : label(key)}
              </Link>
            ))}
          </nav>
          <div className="site-header-actions">
            <div className="site-language">
              <button
                onClick={() => setLanguageOpen(!languageOpen)}
                aria-label={words.languages}
                aria-expanded={languageOpen}
                aria-controls="language-menu"
              >
                <span className="icon" aria-hidden="true">
                  language
                </span>{" "}
                {locale.toUpperCase()}
              </button>
              {languageOpen && (
                <nav
                  id="language-menu"
                  aria-label={words.languages}
                  className="site-dropdown"
                >
                  {[
                    ["sv", "Svenska"],
                    ["en", "English"],
                    ["de", "Deutsch"],
                  ].map(([code, name]) => (
                    <Link
                      key={code}
                      href={
                        alternates[code] ||
                        pathname.replace(/^\/(en|sv|de)/, `/${code}`)
                      }
                      hrefLang={code}
                      lang={code}
                      aria-current={locale === code ? "true" : undefined}
                    >
                      {name}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            <Link
              className="site-login-link"
              href={`/${locale}/${signedIn ? "account" : "sign_ins/new"}`}
            >
              <span className="icon" aria-hidden="true">
                person
              </span>
              {signedIn
                ? { en: "My account", sv: "Mitt konto", de: "Mein Konto" }[
                    locale
                  ]
                : label("sign_in")}
            </Link>
            <Link className="site-signup-link" href={`/${locale}/users/new`}>
              {label("create_account")}
            </Link>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="site-mobile-nav"
            aria-label="Mobile"
          >
            {links.map(([key, path]) => (
              <Link key={key} href={`/${locale}/${path}`}>
                {key === "articles"
                  ? t(locale, "activerecord.models.blog_post.other")
                  : label(key)}
              </Link>
            ))}
            <Link href={`/${locale}/listings?lifecycle_status=live`}>
              {t(locale, "components.hamburger_menu_component.live")}
            </Link>
            <Link href={`/${locale}/listings?lifecycle_status=coming_soon`}>
              {t(locale, "components.hamburger_menu_component.coming_soon")}
            </Link>
            <Link href={`/${locale}/${signedIn ? "account" : "sign_ins/new"}`}>
              {signedIn
                ? { en: "My account", sv: "Mitt konto", de: "Mein Konto" }[
                    locale
                  ]
                : label("sign_in")}
            </Link>
            <Link href={`/${locale}/users/new`}>{label("create_account")}</Link>
          </nav>
        )}
      </header>
      <div className="site-mobile-login">
        <Link href={`/${locale}/${signedIn ? "account" : "sign_ins/new"}`}>
          {signedIn
            ? { en: "My account", sv: "Mitt konto", de: "Mein Konto" }[locale]
            : label("sign_in")}
        </Link>
        <Link href={`/${locale}/users/new`}>{label("create_account")}</Link>
      </div>
    </>
  );
}
