"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../../lib/supabaseClient";
import { apiError, backendEnabled, websiteApi } from "../../lib/site/api";
import { Captcha } from "./Captcha";
export function BackendForm({ action = "", locale, children, className }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(null);
  const router = useRouter();
  const isLead =
    /\/(leads|sales_inquiries|collection_leads|estate_leads|estate-sales|classified_leads)$/.test(
      action,
    );
  const words = {
    en: [
      "Sending…",
      "Check your email for a sign-in link.",
      "Thank you. Your inquiry has been received.",
    ],
    sv: [
      "Skickar…",
      "Kontrollera din e-post för en inloggningslänk.",
      "Tack! Vi har tagit emot din förfrågan.",
    ],
    de: [
      "Wird gesendet…",
      "Prüfen Sie Ihre E-Mails für den Anmeldelink.",
      "Vielen Dank. Ihre Anfrage wurde empfangen.",
    ],
  }[locale];
  if (/listing_updates/.test(action)) return null;
  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const data = new FormData(event.currentTarget);
        setError("");
        setMessage("");
        setBusy(true);
        requestId.current ||= crypto.randomUUID();
        try {
          if (!backendEnabled()) throw new Error("service_not_configured");
          if (/\/(sign_ins|users|newsletter_signups)$/.test(action)) {
            if (data.getAll("user[accept_terms]").includes("1"))
              throw new Error("invalid_input");
            const email = String(
              data.get("sign_in[email]") ||
                data.get("user[email]") ||
                data.get("newsletter_signup[email]") ||
                "",
            ).trim();
            const { error } = await getSupabase().auth.signInWithOtp({
              email,
              options: {
                shouldCreateUser: true,
                emailRedirectTo: `${location.origin}/${locale}/account`,
                data: {
                  name: data.get("user[name]") || "",
                  locale,
                  newsletter_optin: action.endsWith("/newsletter_signups"),
                },
              },
            });
            if (error) throw error;
            setMessage(words[1]);
          } else if (isLead) {
            const kind = /collection_leads/.test(action)
              ? "collection"
              : /estate/.test(action)
                ? "estate"
                : /classified/.test(action)
                  ? "classified"
                  : "sale";
            const result = await websiteApi(
              "lead",
              {
                kind,
                email: data.get("lead[email]"),
                owner: data.get("lead[owner]") || "",
                phone: data.get("lead[phone]"),
                registration_number:
                  data.get("lead[registration_number]") || "",
                accept_terms: data.getAll("lead[accept_terms]").includes("1"),
                utm_source: data.get("lead[utm_source]") || "",
                captcha: data.get("cf-turnstile-response") || "",
              },
              requestId.current,
            );
            if (kind === "sale" || kind === "classified") {
              sessionStorage.setItem(`lead:${result.id}`, result.capability);
              router.push(`/${locale}/detailed_leads/${result.id}/edit`);
            } else setMessage(words[2]);
          } else throw new Error("service_not_configured");
          requestId.current = null;
        } catch (e) {
          setError(apiError(e, locale));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        {isLead && <Captcha />}
      </fieldset>
      {busy && <p role="status">{words[0]}</p>}
      {message && (
        <p role="status" className="site-form-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="site-form-message">
          {error}
        </p>
      )}
    </form>
  );
}
