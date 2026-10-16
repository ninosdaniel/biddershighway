"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiError, websiteApi } from "../../lib/site/api";

const copy = {
  en: {
    purchase: "Buy this vehicle",
    after_sale: "Buy after auction",
    loading: "Loading the price…",
    price: "Vehicle price",
    fee: "Buyer fee, including applicable VAT",
    total: "Total purchase cost",
    valid: "Price confirmation valid until",
    accept: "I accept the terms and understand that this purchase is binding.",
    terms: "Terms and conditions",
    confirm: "Confirm purchase",
    busy: "Confirming purchase…",
    done: "Purchase confirmed",
    unpaid:
      "Payment is pending. Your buyer-fee invoice will appear in your account when it is ready.",
    account: "Account, verification & invoices",
    signIn: "Sign in",
    back: "Back to the vehicle",
    refresh: "Get a new price confirmation",
    errors: {
      purchase_unavailable: "This vehicle is no longer available to purchase.",
      seller_cannot_purchase: "You cannot buy your own vehicle.",
      purchase_quote_expired:
        "This price confirmation has expired. Review a new one before buying.",
      purchase_quote_changed:
        "The vehicle details, price or fees have changed. Review a new price confirmation before buying.",
      purchase_confirmation_required: "Accept the purchase terms to continue.",
      verification_required:
        "Verify your identity in your account before buying.",
      terms_required: "Accept the current terms in your account before buying.",
      address_required:
        "Complete your billing address in your account before buying.",
      transactions_not_enabled: "Purchases are not available yet.",
      account_disabled:
        "This account cannot make purchases. Please contact support.",
    },
  },
  sv: {
    purchase: "Köp detta fordon",
    after_sale: "Köp efter auktion",
    loading: "Hämtar priset…",
    price: "Fordonets pris",
    fee: "Köparavgift inklusive tillämplig moms",
    total: "Total köpkostnad",
    valid: "Prisbekräftelsen gäller till",
    accept: "Jag godkänner villkoren och förstår att köpet är bindande.",
    terms: "Allmänna villkor",
    confirm: "Bekräfta köp",
    busy: "Bekräftar köpet…",
    done: "Köpet är bekräftat",
    unpaid:
      "Betalning inväntas. Fakturan för köparavgiften visas på ditt konto när den är klar.",
    account: "Konto, verifiering och fakturor",
    signIn: "Logga in",
    back: "Tillbaka till fordonet",
    refresh: "Hämta en ny prisbekräftelse",
    errors: {
      purchase_unavailable: "Fordonet är inte längre tillgängligt för köp.",
      seller_cannot_purchase: "Du kan inte köpa ditt eget fordon.",
      purchase_quote_expired:
        "Prisbekräftelsen har gått ut. Granska en ny innan du köper.",
      purchase_quote_changed:
        "Fordonsuppgifterna, priset eller avgifterna har ändrats. Granska en ny prisbekräftelse innan du köper.",
      purchase_confirmation_required: "Godkänn köpvillkoren för att fortsätta.",
      verification_required:
        "Verifiera din identitet på ditt konto innan du köper.",
      terms_required:
        "Godkänn de aktuella villkoren på ditt konto innan du köper.",
      address_required:
        "Fyll i din faktureringsadress på ditt konto innan du köper.",
      transactions_not_enabled: "Köp är ännu inte tillgängliga.",
      account_disabled: "Det här kontot kan inte göra köp. Kontakta supporten.",
    },
  },
  de: {
    purchase: "Dieses Fahrzeug kaufen",
    after_sale: "Nach der Auktion kaufen",
    loading: "Preis wird geladen…",
    price: "Fahrzeugpreis",
    fee: "Käufergebühr einschließlich anwendbarer MwSt.",
    total: "Gesamtkosten des Kaufs",
    valid: "Preisbestätigung gültig bis",
    accept:
      "Ich akzeptiere die Bedingungen und verstehe, dass dieser Kauf verbindlich ist.",
    terms: "Allgemeine Geschäftsbedingungen",
    confirm: "Kauf bestätigen",
    busy: "Kauf wird bestätigt…",
    done: "Kauf bestätigt",
    unpaid:
      "Die Zahlung steht aus. Die Rechnung für die Käufergebühr erscheint in Ihrem Konto, sobald sie bereit ist.",
    account: "Konto, Verifizierung und Rechnungen",
    signIn: "Anmelden",
    back: "Zurück zum Fahrzeug",
    refresh: "Neue Preisbestätigung anfordern",
    errors: {
      purchase_unavailable:
        "Dieses Fahrzeug ist nicht mehr zum Kauf verfügbar.",
      seller_cannot_purchase: "Sie können Ihr eigenes Fahrzeug nicht kaufen.",
      purchase_quote_expired:
        "Diese Preisbestätigung ist abgelaufen. Prüfen Sie vor dem Kauf eine neue.",
      purchase_quote_changed:
        "Die Fahrzeugangaben, der Preis oder die Gebühren haben sich geändert. Prüfen Sie vor dem Kauf eine neue Preisbestätigung.",
      purchase_confirmation_required:
        "Akzeptieren Sie die Kaufbedingungen, um fortzufahren.",
      verification_required:
        "Bestätigen Sie vor dem Kauf Ihre Identität in Ihrem Konto.",
      terms_required:
        "Akzeptieren Sie vor dem Kauf die aktuellen Bedingungen in Ihrem Konto.",
      address_required:
        "Vervollständigen Sie vor dem Kauf Ihre Rechnungsadresse in Ihrem Konto.",
      transactions_not_enabled: "Käufe sind noch nicht verfügbar.",
      account_disabled:
        "Dieses Konto kann keine Käufe tätigen. Bitte kontaktieren Sie den Support.",
    },
  },
};
const invalidQuotes = new Set([
  "purchase_quote_expired",
  "purchase_quote_changed",
  "purchase_unavailable",
  "not_found",
]);

export function PurchaseCheckout({ locale, slug, kind }) {
  const w = copy[locale];
  const [quote, setQuote] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const request = useRef(null);
  const submitting = useRef(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setQuote(null);
    setError(null);
    setAccepted(false);
    request.current = null;
    websiteApi("purchase_quote", { slug, kind })
      .then((data) => {
        if (alive) setQuote(data);
      })
      .catch((e) => {
        if (alive) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, kind, version]);
  const format = (cents) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "SEK",
    }).format(cents / 100);
  const totals = receipt || quote;
  async function submit(event) {
    event.preventDefault();
    if (!quote || !accepted || submitting.current || receipt) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    request.current ||= crypto.randomUUID();
    try {
      setReceipt(
        await websiteApi(
          "purchase",
          { quote_id: quote.id, accepted: true },
          request.current,
        ),
      );
    } catch (e) {
      setError(e);
      // Keep the request ID after a lost response: retrying must return the
      // original receipt, including when that quote has since expired.
      if (invalidQuotes.has(e.message)) {
        setQuote(null);
        setAccepted(false);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="site-account site-transaction site-purchase"
      aria-busy={loading || busy}
    >
      <h1>{receipt ? w.done : w[kind]}</h1>
      {quote?.title && <h2>{quote.title}</h2>}
      {loading && <p role="status">{w.loading}</p>}
      {error && (
        <p role="alert">{w.errors[error.message] || apiError(error, locale)}</p>
      )}
      {totals && (
        <dl className="site-purchase-totals">
          <div>
            <dt>{w.price}</dt>
            <dd>{format(totals.price_cents)}</dd>
          </div>
          <div>
            <dt>{w.fee}</dt>
            <dd>{format(totals.buyer_fee_cents)}</dd>
          </div>
          <div>
            <dt>
              <strong>{w.total}</strong>
            </dt>
            <dd>
              <strong>{format(totals.total_cents)}</strong>
            </dd>
          </div>
        </dl>
      )}
      {receipt ? (
        <p role="status">{w.unpaid}</p>
      ) : (
        quote && (
          <form onSubmit={submit}>
            <p>
              {w.valid}{" "}
              <time dateTime={quote.expires_at}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Europe/Stockholm",
                }).format(new Date(quote.expires_at))}{" "}
                (Europe/Stockholm)
              </time>
            </p>
            <fieldset disabled={busy}>
              <label className="site-checkbox">
                <input
                  type="checkbox"
                  required
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                {w.accept}
              </label>
              <p>
                <Link
                  href={`/${locale}/docs/terms_and_conditions`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {w.terms}
                </Link>
              </p>
              <button className="site-button" disabled={!accepted || busy}>
                {busy ? w.busy : w.confirm}
              </button>
            </fieldset>
          </form>
        )
      )}
      {!loading && !busy && !receipt && !quote && (
        <button
          type="button"
          className="site-button"
          onClick={() => setVersion((v) => v + 1)}
        >
          {w.refresh}
        </button>
      )}
      {error?.message === "authentication_required" && (
        <p>
          <Link href={`/${locale}/sign_ins/new`}>{w.signIn}</Link>
        </p>
      )}
      <p>
        <Link href={`/${locale}/account`}>{w.account}</Link>
      </p>
      <Link href={`/${locale}/auctions/${encodeURIComponent(slug)}`}>
        {w.back}
      </Link>
    </section>
  );
}
