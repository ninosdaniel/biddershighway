"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "../../lib/supabaseClient";
import { apiError, websiteApi } from "../../lib/site/api";

const words = {
  en: [
    "Place a bid",
    "Your maximum bid (SEK)",
    "Bid automatically up to my limit",
    "Confirm bid",
    "Bid accepted",
    "Account & verification",
    "Save vehicle details",
    "Tell us about your vehicle",
    "Saved",
    "Offer before auction",
    "Save auction",
    "Saved auction",
  ],
  sv: [
    "Lägg bud",
    "Ditt maxbud (SEK)",
    "Bjud automatiskt upp till min gräns",
    "Bekräfta bud",
    "Bud mottaget",
    "Konto och verifiering",
    "Spara fordonsuppgifter",
    "Berätta om ditt fordon",
    "Sparat",
    "Förhandsbud",
    "Bevaka auktion",
    "Auktionen bevakas",
  ],
  de: [
    "Gebot abgeben",
    "Ihr Höchstgebot (SEK)",
    "Automatisch bis zu meinem Limit bieten",
    "Gebot bestätigen",
    "Gebot angenommen",
    "Konto und Verifizierung",
    "Fahrzeugdaten speichern",
    "Erzählen Sie uns von Ihrem Fahrzeug",
    "Gespeichert",
    "Vorabgebot",
    "Auktion speichern",
    "Auktion gespeichert",
  ],
};
export function TransactionPage({ locale, pathname }) {
  const w = words[locale];
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [auction, setAuction] = useState(null);
  const request = useRef(null);
  const slug = pathname.match(/\/auctions\/([^/]+)/)?.[1];
  const lead = pathname.match(/\/detailed_leads\/([^/]+)/)?.[1];
  const offer = /\/offers/.test(pathname);
  const bookmark = /\/bookmarks/.test(pathname);
  useEffect(() => {
    if (slug)
      getSupabase()
        .rpc("get_website_auction", {
          p_slug: decodeURIComponent(slug),
          p_locale: locale,
        })
        .then(({ data }) => setAuction(data))
        .catch(() => {});
  }, [slug, locale]);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    request.current ||= crypto.randomUUID();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      let result;
      if (lead)
        result = await websiteApi(
          "update_lead",
          {
            ...data,
            id: lead,
            capability: sessionStorage.getItem(`lead:${lead}`) || "",
          },
          request.current,
        );
      else if (bookmark)
        result = await websiteApi(
          "bookmark",
          { slug: decodeURIComponent(slug), saved: true },
          request.current,
        );
      else {
        const value = Number(data.amount);
        if (!Number.isSafeInteger(value) || value <= 0)
          throw new Error("invalid_bid_increment");
        result = await websiteApi(
          offer ? "offer" : "bid",
          {
            slug: decodeURIComponent(slug),
            amount_cents: value * 100,
            auto_bid: data.auto_bid === "on",
          },
          request.current,
        );
      }
      if (result) {
        setStatus(lead ? w[8] : bookmark ? w[11] : w[4]);
        request.current = null;
      }
    } catch (e) {
      setError(apiError(e, locale));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="site-account site-transaction">
      <h1>{lead ? w[7] : bookmark ? w[10] : offer ? w[9] : w[0]}</h1>
      {auction && <h2>{auction.title}</h2>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {lead ? (
            <>
              {["manufacturer", "model", "year", "location"].map((key) => (
                <label key={key}>
                  {
                    {
                      en: {
                        manufacturer: "Make",
                        model: "Model",
                        year: "Year",
                        location: "Location",
                      },
                      sv: {
                        manufacturer: "Märke",
                        model: "Modell",
                        year: "År",
                        location: "Plats",
                      },
                      de: {
                        manufacturer: "Marke",
                        model: "Modell",
                        year: "Jahr",
                        location: "Ort",
                      },
                    }[locale][key]
                  }
                  <input name={key} />
                </label>
              ))}
              <label>
                {w[7]}
                <textarea name="comment" maxLength={10000} rows={6} />
              </label>
            </>
          ) : (
            !bookmark && (
              <>
                <label>
                  {w[1]}
                  <input
                    name="amount"
                    type="number"
                    min={auction ? auction.minimum_bid_cents / 100 : 1000}
                    step={500}
                    required
                  />
                </label>
                {!offer && (
                  <label className="site-checkbox">
                    <input name="auto_bid" type="checkbox" />
                    {w[2]}
                  </label>
                )}
                <label className="site-checkbox">
                  <input type="checkbox" required />
                  {
                    {
                      en: "I understand that my bid is binding.",
                      sv: "Jag förstår att mitt bud är bindande.",
                      de: "Ich verstehe, dass mein Gebot verbindlich ist.",
                    }[locale]
                  }
                </label>
              </>
            )
          )}
          <button className="site-button">
            {lead ? w[6] : bookmark ? w[10] : w[3]}
          </button>
        </fieldset>
      </form>
      {!lead && (
        <>
          <p>
            <Link href={`/${locale}/account`}>{w[5]}</Link>
          </p>
          <Link href={`/${locale}/auctions/${slug}`}>
            {auction?.title || "←"}
          </Link>
        </>
      )}
    </div>
  );
}
