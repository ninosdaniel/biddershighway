"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiError, websiteApi } from "../../lib/site/api";

const labels = {
  en: { account: "Your account", messages: "Messages", searches: "Saved searches", preferences: "Notifications and language", send: "Send message", message: "Message", empty: "No messages yet.", save: "Save", remove: "Remove", search: "Search term", saved: "Saved", signIn: "Sign in", older: "Earlier messages", daily: "Daily auction emails", features: "News and offers", welcome: "Welcome emails", sms: "SMS notifications", language: "Language", all: "All auctions", buyer_live: "Your active bids", buyer_won: "Won auctions", buyer_lost: "Lost auctions", seller_draft: "Your drafts", seller_live: "Your live auctions", seller_concluded: "Your concluded auctions", none: "No results yet.", maximum: "Your maximum bid" },
  sv: { account: "Ditt konto", messages: "Meddelanden", searches: "Bevakningar", preferences: "Notiser och språk", send: "Skicka meddelande", message: "Meddelande", empty: "Inga meddelanden ännu.", save: "Spara", remove: "Ta bort", search: "Sökord", saved: "Sparat", signIn: "Logga in", older: "Tidigare meddelanden", daily: "Dagliga auktionsmejl", features: "Nyheter och erbjudanden", welcome: "Välkomstmejl", sms: "SMS-notiser", language: "Språk", all: "Alla auktioner", buyer_live: "Dina aktiva bud", buyer_won: "Vunna auktioner", buyer_lost: "Förlorade auktioner", seller_draft: "Dina utkast", seller_live: "Dina pågående auktioner", seller_concluded: "Dina avslutade auktioner", none: "Inga resultat ännu.", maximum: "Ditt maxbud" },
  de: { account: "Ihr Konto", messages: "Nachrichten", searches: "Gespeicherte Suchen", preferences: "Benachrichtigungen und Sprache", send: "Nachricht senden", message: "Nachricht", empty: "Noch keine Nachrichten.", save: "Speichern", remove: "Entfernen", search: "Suchbegriff", saved: "Gespeichert", signIn: "Anmelden", older: "Frühere Nachrichten", daily: "Tägliche Auktions-E-Mails", features: "Neuigkeiten und Angebote", welcome: "Willkommens-E-Mails", sms: "SMS-Benachrichtigungen", language: "Sprache", all: "Alle Auktionen", buyer_live: "Ihre aktiven Gebote", buyer_won: "Gewonnene Auktionen", buyer_lost: "Verlorene Auktionen", seller_draft: "Ihre Entwürfe", seller_live: "Ihre laufenden Auktionen", seller_concluded: "Ihre beendeten Auktionen", none: "Noch keine Ergebnisse.", maximum: "Ihr Höchstgebot" },
};
export function AccountNavigation({ locale }) {
  const w = labels[locale];
  return <nav className="site-account-nav" aria-label={w.account}>
    <Link href={`/${locale}/account/classifieds`}>{{en:"Your classifieds",sv:"Dina annonser",de:"Ihre Inserate"}[locale]}</Link>
    {[["", "account"], ["conversations", "messages"], ["saved_searches", "searches"], ["activity", "all"], ["preferences", "preferences"]].map(([path, key]) => <Link key={key} href={`/${locale}/account${path ? `/${path}` : ""}`}>{w[key]}</Link>)}
  </nav>;
}
function ErrorMessage({ error, locale }) {
  return error && <div role="alert"><p>{apiError(error, locale)}</p>{error.message === "authentication_required" && <Link href={`/${locale}/sign_ins/new`}>{labels[locale].signIn}</Link>}</div>;
}
// Reuse the request ID only for identical retries. Editing after an error must
// not make a new submission conflict with the previous request's payload.
function useCommand() {
  const pending = useRef(null);
  return async (action, input) => {
    const key = JSON.stringify([action, input]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    const result = await websiteApi(action, input, pending.current.id);
    pending.current = null;
    return result;
  };
}
export function ConversationsPage({ locale, id, slug }) {
  const w = labels[locale], router = useRouter(), command = useCommand();
  const [data, setData] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    websiteApi("conversations", id ? { id } : {}).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e); });
    return () => { active = false; };
  }, [id, slug]);
  async function send(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await command(slug ? "conversation_start" : "conversation_reply", { ...(slug ? { slug } : { id }), body });
      setBody("");
      if (slug) router.push(`/${locale}/account/conversations/${result.id}`);
      else setData(await websiteApi("conversations", { id }));
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <div className="site-account"><AccountNavigation locale={locale} /><h1>{w.messages}</h1><ErrorMessage error={error} locale={locale} />
    {data && <div className="site-conversations"><aside><ul>{data.conversations.map(c => <li key={c.id}><Link aria-current={c.id === id ? "page" : undefined} href={`/${locale}/account/conversations/${c.id}`}><strong>{c.title}</strong><p>{c.preview}</p></Link></li>)}</ul>{!data.conversations.length && <p>{w.empty}</p>}</aside>
      <section aria-label={w.messages}>
        {data.messages.length >= 100 && <button disabled={busy} onClick={async () => { setBusy(true); try { const older = await websiteApi("conversations", { id, before: data.messages[0].created_at }); setData({ ...data, messages: [...older.messages, ...data.messages] }); } catch (e) { setError(e); } finally { setBusy(false); } }}>{w.older}</button>}
        <ol className="site-message-list">{data.messages.map(m => <li key={m.id} className={m.own ? "site-message-own" : ""}><strong>{m.own ? w.account : m.sender}</strong><p>{m.body}</p><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString(locale)}</time></li>)}</ol>
        {(slug || id) && <form onSubmit={send}><fieldset disabled={busy}><label>{w.message}<textarea required maxLength={5000} rows={5} value={body} onChange={e => setBody(e.target.value)} /></label><button className="site-button">{w.send}</button></fieldset></form>}
      </section></div>}
  </div>;
}
export function SaveSearch({ locale, term = "" }) {
  const w = labels[locale], command = useCommand();
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [saved, setSaved] = useState(false);
  return <form className="site-save-search" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    const value = new FormData(e.currentTarget).get("term"); setBusy(true); setError(null); setSaved(false);
    try { await command("saved_search_create", { term: value }); setSaved(true); } catch (e) { setError(e); } finally { setBusy(false); }
  }}><label>{w.search}<input name="term" defaultValue={term} key={term} minLength={2} maxLength={200} required /></label><button disabled={busy} className="site-button">{w.searches}</button>{saved && <p role="status">{w.saved} · <Link href={`/${locale}/account/saved_searches`}>{w.searches}</Link></p>}<ErrorMessage error={error} locale={locale} /></form>;
}
export function CustomerActivity({ locale, section = "activity" }) {
  const w = labels[locale], command = useCommand();
  const [data, setData] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  useEffect(() => { let active = true; websiteApi("account_activity").then(v => { if (active) setData(v); }).catch(e => { if (active) setError(e); }); return () => { active = false; }; }, []);
  async function run(action, input) { setBusy(true); setError(null); setStatus(""); try { await command(action, input); setData(await websiteApi("account_activity")); setStatus(w.saved); } catch (e) { setError(e); } finally { setBusy(false); } }
  const filter = section.replace(/_auctions$/, "");
  const auctions = data?.auctions.filter(a => {
    if (filter === "buyer_won") return a.role === "buyer" && a.won;
    if (filter === "buyer_lost") return a.role === "buyer" && !a.won && a.status >= 9;
    if (filter === "buyer_live") return a.role === "buyer" && a.status >= 2 && a.status < 9;
    if (filter === "seller_draft") return a.role === "seller" && a.status < 2;
    if (filter === "seller_live") return a.role === "seller" && a.status >= 2 && a.status < 9;
    if (filter === "seller_concluded") return a.role === "seller" && a.status >= 9;
    return true;
  });
  return <div className="site-account"><AccountNavigation locale={locale} /><h1>{section === "saved_searches" ? w.searches : section === "preferences" ? w.preferences : w[filter] || w.all}</h1><ErrorMessage error={error} locale={locale} />{status && <p role="status">{status}</p>}
    {data && (section === "saved_searches" ? <><SaveSearch locale={locale} /><ul>{data.saved_searches.map(s => <li key={s.id}><Link href={`/${locale}/listings?q=${encodeURIComponent(s.term)}`}>{s.term}</Link> <button disabled={busy} onClick={() => run("saved_search_delete", { id: s.id })}>{w.remove}</button></li>)}</ul></> : section === "preferences" ? <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); run("preferences", Object.fromEntries([...["email_daily_updates", "email_features", "email_welcome_series", "accepted_sms"].map(k => [k, form.get(k) === "on"]), ["locale", form.get("locale")]])); }}><fieldset disabled={busy}>
      {[["email_daily_updates", "daily"], ["email_features", "features"], ["email_welcome_series", "welcome"], ["accepted_sms", "sms"]].map(([key,label]) => <label className="site-checkbox" key={key}><input type="checkbox" name={key} defaultChecked={data.preferences[key]} />{w[label]}</label>)}
      <label>{w.language}<select name="locale" defaultValue={data.preferences.locale}><option value="sv">Svenska</option><option value="en">English</option><option value="de">Deutsch</option></select></label><button className="site-button">{w.save}</button></fieldset></form> : <><nav className="site-account-nav">{["buyer_live", "buyer_won", "buyer_lost", "seller_draft", "seller_live", "seller_concluded"].map(k => <Link key={k} href={`/${locale}/account/${k}_auctions`}>{w[k]}</Link>)}</nav><ul>{auctions.map(a => <li key={a.id}><Link href={`/${locale}/auctions/${a.slug}`}>{a.title}</Link>{a.own_maximum_cents != null && <p>{w.maximum}: {new Intl.NumberFormat(locale, { style: "currency", currency: "SEK" }).format(a.own_maximum_cents / 100)}</p>}</li>)}</ul>{!auctions.length && <p>{w.none}</p>}</>)}
  </div>;
}
