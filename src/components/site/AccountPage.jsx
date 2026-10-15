"use client";
import { AccountNavigation } from "./CustomerWorkflows";
import Link from "next/link";
import { BankId } from "./BankId";
import { InvoiceActions } from "./InvoiceActions";
import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabaseClient";
import { apiError, websiteApi } from "../../lib/site/api";

const copy = {
  en: [
    "Your account",
    "Sign in",
    "Save changes",
    "Name",
    "Street address",
    "City",
    "Postal code",
    "Country (two letters)",
    "Phone",
    "Verify identity",
    "Identity verified",
    "I accept the terms and conditions",
    "Saved auctions",
    "Your auctions",
    "Notifications",
    "Invoices",
    "Sign out",
    "Saved",
    "Daily auction emails",
    "Paid",
    "Awaiting payment",
    "Contact details",
  ],
  sv: [
    "Ditt konto",
    "Logga in",
    "Spara ändringar",
    "Namn",
    "Gatuadress",
    "Ort",
    "Postnummer",
    "Land (två bokstäver)",
    "Telefon",
    "Verifiera identitet",
    "Identitet verifierad",
    "Jag godkänner användarvillkoren",
    "Bevakade auktioner",
    "Dina auktioner",
    "Notiser",
    "Fakturor",
    "Logga ut",
    "Sparat",
    "Dagliga auktionsmejl",
    "Betald",
    "Inväntar betalning",
    "Kontaktuppgifter",
  ],
  de: [
    "Ihr Konto",
    "Anmelden",
    "Änderungen speichern",
    "Name",
    "Straße",
    "Ort",
    "Postleitzahl",
    "Land (zwei Buchstaben)",
    "Telefon",
    "Identität bestätigen",
    "Identität bestätigt",
    "Ich akzeptiere die Geschäftsbedingungen",
    "Gespeicherte Auktionen",
    "Ihre Auktionen",
    "Benachrichtigungen",
    "Rechnungen",
    "Abmelden",
    "Gespeichert",
    "Tägliche Auktions-E-Mails",
    "Bezahlt",
    "Zahlung ausstehend",
    "Kontaktdaten",
  ],
};
export function AccountPage({ locale }) {
  const w = copy[locale];
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [contacts, setContacts] = useState({});
  const load = () =>
    websiteApi("account")
      .then(setAccount)
      .catch((e) => setError(apiError(e, locale)));
  useEffect(() => {
    let alive = true;
    websiteApi("account")
      .then((a) => {
        if (alive) setAccount(a);
      })
      .catch((e) => {
        if (alive) setError(apiError(e, locale));
      });
    return () => {
      alive = false;
    };
  }, [locale]);
  const run = async (action, input) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await websiteApi(action, input);
      setStatus(w[17]);
      await load();
      return result;
    } catch (e) {
      setError(apiError(e, locale));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="site-account">
      <AccountNavigation locale={locale} />
      <h1>{w[0]}</h1>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!account ? (
        <Link className="site-button" href={`/${locale}/sign_ins/new`}>
          {w[1]}
        </Link>
      ) : (
        <>
          <p>{account.email}</p>
          <button
            onClick={async () => {
              await getSupabase().auth.signOut();
              setAccount(null);
            }}
            className="site-link-button"
          >
            {w[16]}
          </button>
          <div className="site-account-grid">
            <section>
              <h2>{w[21]}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  run("profile", {
                    ...data,
                    locale,
                    email_daily_updates: data.email_daily_updates === "on",
                  });
                }}
              >
                <fieldset disabled={busy}>
                  {[
                    ["name", w[3], account.name],
                    ["line1", w[4], account.address.line1],
                    ["city", w[5], account.address.city],
                    ["postal_code", w[6], account.address.postal_code],
                    ["country", w[7], account.address.country],
                    ["phone", w[8], account.address.phone],
                  ].map(([name, label, value]) => (
                    <label key={name}>
                      {label}
                      <input
                        name={name}
                        defaultValue={value || ""}
                        required
                        maxLength={name === "country" ? 2 : 200}
                      />
                    </label>
                  ))}
                  <label className="site-checkbox">
                    <input
                      type="checkbox"
                      name="email_daily_updates"
                      defaultChecked={account.email_daily_updates}
                    />
                    {w[18]}
                  </label>
                  <button className="site-button">{w[2]}</button>
                </fieldset>
              </form>
            </section>
            <section>
              <h2>{w[9]}</h2>
              {account.verified ? (
                <p>{w[10]}</p>
              ) : (
                <button
                  disabled={busy}
                  className="site-button"
                  onClick={async () => {
                    const result = await run("verify_identity", { locale });
                    if (
                      result?.url &&
                      new URL(result.url).hostname.endsWith(".stripe.com")
                    )
                      location.assign(result.url);
                  }}
                >
                  {w[9]}
                </button>
              )}
              {!account.verified && (
                <BankId locale={locale} onComplete={load} />
              )}
              {!account.terms_accepted && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("accept_terms", { accepted: true });
                  }}
                >
                  <label className="site-checkbox">
                    <input required type="checkbox" />
                    {w[11]}
                  </label>
                  <Link href={`/${locale}/docs/terms_and_conditions`}>
                    {w[11]}
                  </Link>
                  <button disabled={busy} className="site-button">
                    {w[2]}
                  </button>
                </form>
              )}
            </section>
          </div>
          <section>
            <h2>{w[12]}</h2>
            <ul>
              {account.bookmarks.map((item) => (
                <li key={item.id}>
                  <Link href={`/${locale}/auctions/${item.slug}`}>
                    {item.title}
                  </Link>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run("bookmark", { slug: item.slug, saved: false })
                    }
                    aria-label={`${w[12]}: ${item.title}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>{w[13]}</h2>
            <ul>
              {account.auctions.map((item) => (
                <li key={item.slug}>
                  <Link href={`/${locale}/auctions/${item.slug}`}>
                    {item.title}
                  </Link>
                  {item.paid && (
                    <button
                      onClick={async () => {
                        const result = await run("contact", {
                          slug: item.slug,
                        });
                        if (result)
                          setContacts({ ...contacts, [item.slug]: result });
                      }}
                    >
                      {w[21]}
                    </button>
                  )}
                  {contacts[item.slug] && (
                    <p>
                      {contacts[item.slug].name} · {contacts[item.slug].email} ·{" "}
                      {contacts[item.slug].phone}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>
              {{ en: "Offers", sv: "Förhandsbud", de: "Angebote" }[locale]}
            </h2>
            <ul>
              {account.offers?.map((item) => (
                <li key={item.id}>
                  <Link href={`/${locale}/auctions/${item.slug}`}>
                    {item.slug}
                  </Link>
                  <span>
                    {new Intl.NumberFormat(locale, {
                      style: "currency",
                      currency: "SEK",
                    }).format(item.amount_cents / 100)}
                  </span>
                  {item.can_decide && item.status === "pending" && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              {
                                en: "Accept this binding sale offer?",
                                sv: "Acceptera detta bindande köpeanbud?",
                                de: "Dieses verbindliche Kaufangebot annehmen?",
                              }[locale],
                            )
                          )
                            run("offer_decision", {
                              id: item.id,
                              accept: true,
                            });
                        }}
                      >
                        {
                          { en: "Accept", sv: "Acceptera", de: "Annehmen" }[
                            locale
                          ]
                        }
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run("offer_decision", { id: item.id, accept: false })
                        }
                      >
                        {{ en: "Decline", sv: "Avböj", de: "Ablehnen" }[locale]}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>{w[15]}</h2>
            <ul>
              {account.payments.map((item) => (
                <li key={item.id}>
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: item.currency,
                  }).format(item.amount_cents / 100)}{" "}
                  — {item.paid_at ? w[19] : w[20]}
                  {item.url && /^https:\/\//.test(item.url) && (
                    <a href={item.url} rel="noopener noreferrer">
                      {w[15]}
                    </a>
                  )}
                  <InvoiceActions
                    payment={item}
                    locale={locale}
                    onPaid={load}
                  />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>{w[14]}</h2>
            <ul>
              {account.notifications.map((item) => (
                <li key={item.id}>
                  <Link
                    href={
                      item.link?.startsWith("/") && !item.link.startsWith("//")
                        ? item.link
                        : `/${locale}/account`
                    }
                    onClick={() => run("notification_read", { id: item.id })}
                  >
                    {item.title}
                  </Link>
                  <p>{item.text}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
