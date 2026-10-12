import messages from "../../content/messages.json" with { type: "json" };

export function t(locale, key) {
  return (
    messages[`${locale}.${key}`] ||
    messages[`en.${key}`] ||
    key.split(".").pop().replaceAll("_", " ")
  );
}

export const interfaceText = {
  en: {
    menu: "Open navigation",
    close: "Close",
    languages: "Language",
    search: "Search",
    unavailable:
      "This service is not available here yet. Please contact support@biddershighway.com.",
    retry: "Please try again.",
    sending: "Sending…",
    back: "Back",
    next: "Next",
    photos: "View photos",
    saved: "Saved",
    save: "Save vehicle",
    account: "My account",
    backend: "Account services are not connected yet.",
    cookies: "We use essential cookies to keep this website working.",
    accept: "Got it",
    skip: "Skip to content",
  },
  sv: {
    menu: "Öppna navigation",
    close: "Stäng",
    languages: "Språk",
    search: "Sök",
    unavailable:
      "Den här tjänsten är inte tillgänglig här ännu. Kontakta support@biddershighway.com.",
    retry: "Försök igen.",
    sending: "Skickar…",
    back: "Tillbaka",
    next: "Nästa",
    photos: "Visa bilder",
    saved: "Sparad",
    save: "Spara fordon",
    account: "Mitt konto",
    backend: "Kontotjänster är ännu inte anslutna.",
    cookies: "Vi använder nödvändiga cookies för att webbplatsen ska fungera.",
    accept: "Jag förstår",
    skip: "Hoppa till innehåll",
  },
  de: {
    menu: "Navigation öffnen",
    close: "Schließen",
    languages: "Sprache",
    search: "Suchen",
    unavailable:
      "Dieser Dienst ist hier noch nicht verfügbar. Kontaktieren Sie support@biddershighway.com.",
    retry: "Bitte versuchen Sie es erneut.",
    sending: "Wird gesendet…",
    back: "Zurück",
    next: "Weiter",
    photos: "Bilder ansehen",
    saved: "Gespeichert",
    save: "Fahrzeug speichern",
    account: "Mein Konto",
    backend: "Kontodienste sind noch nicht verbunden.",
    cookies:
      "Wir verwenden notwendige Cookies, damit diese Website funktioniert.",
    accept: "Verstanden",
    skip: "Zum Inhalt",
  },
};
