import { getSupabase } from "../supabaseClient";
export const backendEnabled = () =>
  process.env.NEXT_PUBLIC_WEBSITE_BACKEND_ENABLED === "true";
export async function websiteApi(
  action,
  input = {},
  requestId = crypto.randomUUID(),
) {
  if (!backendEnabled()) throw new Error("service_not_configured");
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  if (session?.access_token)
    headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/website-api`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ action, input, request_id: requestId }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error)
    throw new Error(body.error || "service_unavailable");
  return body.data;
}
const errors = {
  en: {
    service_not_configured:
      "This service is being connected. Please try again later.",
    authentication_required: "Please sign in to continue.",
    verification_required:
      "Verify your identity in your account before bidding.",
    address_required: "Complete your address in your account before bidding.",
    terms_required: "Accept the current terms in your account before bidding.",
    auction_closed: "This auction is no longer accepting bids.",
    bid_too_low:
      "Another bid has been placed. Refresh the auction and try again.",
    invalid_bid_increment: "Use a bid in increments of 500 SEK.",
    bid_matches_existing_maximum:
      "That amount matches an existing bid limit. Choose another amount.",
    transactions_not_enabled: "Bidding is not available yet.",
    too_many_requests: "Too many attempts. Please try again shortly.",
    captcha_required: "Please complete the verification and try again.",
    generic: "We couldn't complete your request. Please try again.",
  },
  sv: {
    service_not_configured: "Tjänsten ansluts just nu. Försök igen senare.",
    authentication_required: "Logga in för att fortsätta.",
    verification_required:
      "Verifiera din identitet på ditt konto innan du budar.",
    address_required: "Fyll i din adress på ditt konto.",
    terms_required: "Godkänn de aktuella villkoren på ditt konto.",
    auction_closed: "Auktionen tar inte längre emot bud.",
    bid_too_low: "Ett nytt bud har lagts. Uppdatera auktionen.",
    invalid_bid_increment: "Ange ett bud i steg om 500 SEK.",
    transactions_not_enabled: "Budgivning är ännu inte tillgänglig.",
    generic: "Din förfrågan kunde inte slutföras. Försök igen.",
  },
  de: {
    service_not_configured:
      "Dieser Dienst wird gerade eingerichtet. Bitte versuchen Sie es später erneut.",
    authentication_required: "Bitte melden Sie sich an.",
    verification_required:
      "Bestätigen Sie vor dem Bieten Ihre Identität in Ihrem Konto.",
    terms_required: "Akzeptieren Sie die aktuellen Bedingungen in Ihrem Konto.",
    auction_closed: "Diese Auktion nimmt keine Gebote mehr an.",
    transactions_not_enabled: "Das Bieten ist noch nicht verfügbar.",
    generic:
      "Ihre Anfrage konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
  },
};
export const apiError = (error, locale = "en") =>
  errors[locale]?.[error.message] ||
  errors.en[error.message] ||
  errors[locale]?.generic ||
  errors.en.generic;
