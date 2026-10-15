"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { websiteApi, apiError } from "../../lib/site/api";

const tasks = {
  leads: [["lead_valuation", "Vehicle analysis"]],
  lots: [["lot_text", "Write auction text"], ["lot_summary", "Summary and categories"], ["lot_translate", "Translate to English and German"], ["classified_classify", "Classify vehicle"], ["classified_text", "Translate classified"]],
  brands: [["brand_summary", "Write brand introduction"]],
  vehicle_models: [["model_summary", "Write model introduction"]],
  blog_posts: [["blog_translate", "Translate article"]],
  pages: [["page_translate", "Translate page"]],
};
const text = {
  en: { title: "Editorial and vehicle analysis", description: "Choose a record to prepare an analysis or a text draft. Review the result before applying it.", leads: "Sales inquiries", lots: "Vehicles", brands: "Brands", vehicle_models: "Models", blog_posts: "Articles", pages: "Pages", search: "Search", recent: "Recent drafts", refresh: "Refresh", apply: "Apply reviewed result", applied: "Applied", ready: "Ready for review", processing: "Processing", queued: "Queued", failed: "Needs attention", empty: "No records found.", previous: "Previous", next: "Next", signIn: "Sign in with a staff account", source: "Source", compare: "Comparable sales", estimate: "Estimated value", qualified: "Suitable for Bidders Highway", no: "No", yes: "Yes", confirm: "Apply this reviewed result to the record?", saved: "Result applied.", forbidden: "This account does not have staff access.", stale_record: "The source has changed. Create a new draft to preserve the latest edits.", ai_not_enabled: "AI processing has not been enabled yet.", noDrafts: "No drafts yet." },
  sv: { title: "Redaktion och fordonsanalys", description: "Välj ett objekt för att skapa en analys eller ett textutkast. Granska resultatet innan du använder det.", leads: "Säljförfrågningar", lots: "Fordon", brands: "Märken", vehicle_models: "Modeller", blog_posts: "Artiklar", pages: "Sidor", search: "Sök", recent: "Senaste utkast", refresh: "Uppdatera", apply: "Använd granskat resultat", applied: "Sparat", ready: "Klart för granskning", processing: "Bearbetas", queued: "Köad", failed: "Behöver åtgärdas", empty: "Inga objekt hittades.", previous: "Föregående", next: "Nästa", signIn: "Logga in med personalkonto", source: "Underlag", compare: "Jämförbara affärer", estimate: "Uppskattat värde", qualified: "Passar Bidders Highway", no: "Nej", yes: "Ja", confirm: "Använd detta granskade resultat för objektet?", saved: "Resultatet har sparats.", forbidden: "Kontot saknar personalbehörighet.", stale_record: "Underlaget har ändrats. Skapa ett nytt utkast för att bevara de senaste ändringarna.", ai_not_enabled: "AI-bearbetning har ännu inte aktiverats.", noDrafts: "Inga utkast ännu." },
  de: { title: "Redaktion und Fahrzeuganalyse", description: "Wählen Sie einen Datensatz für eine Analyse oder einen Textentwurf. Prüfen Sie das Ergebnis vor der Übernahme.", leads: "Verkaufsanfragen", lots: "Fahrzeuge", brands: "Marken", vehicle_models: "Modelle", blog_posts: "Artikel", pages: "Seiten", search: "Suchen", recent: "Letzte Entwürfe", refresh: "Aktualisieren", apply: "Geprüftes Ergebnis übernehmen", applied: "Übernommen", ready: "Bereit zur Prüfung", processing: "In Bearbeitung", queued: "In Warteschlange", failed: "Prüfung erforderlich", empty: "Keine Datensätze gefunden.", previous: "Zurück", next: "Weiter", signIn: "Mit Mitarbeiterkonto anmelden", source: "Quelle", compare: "Vergleichbare Verkäufe", estimate: "Geschätzter Wert", qualified: "Für Bidders Highway geeignet", no: "Nein", yes: "Ja", confirm: "Dieses geprüfte Ergebnis übernehmen?", saved: "Ergebnis übernommen.", forbidden: "Dieses Konto hat keinen Mitarbeiterzugriff.", stale_record: "Die Quelle wurde geändert. Erstellen Sie einen neuen Entwurf.", ai_not_enabled: "Die KI-Verarbeitung ist noch nicht aktiviert.", noDrafts: "Noch keine Entwürfe." },
};
const taskLabels = {
  sv: { lead_valuation: "Analysera fordon", lot_text: "Skriv auktionstext", lot_summary: "Ingress och kategorier", lot_translate: "Översätt till engelska och tyska", classified_classify: "Kategorisera fordon", classified_text: "Översätt annons", brand_summary: "Skriv märkesintroduktion", model_summary: "Skriv modellintroduktion", blog_translate: "Översätt artikel", page_translate: "Översätt sida" },
  de: { lead_valuation: "Fahrzeug analysieren", lot_text: "Auktionstext schreiben", lot_summary: "Zusammenfassung und Kategorien", lot_translate: "Ins Englische und Deutsche übersetzen", classified_classify: "Fahrzeug kategorisieren", classified_text: "Inserat übersetzen", brand_summary: "Markeneinführung schreiben", model_summary: "Modelleinführung schreiben", blog_translate: "Artikel übersetzen", page_translate: "Seite übersetzen" },
};
export function StaffWorkspace({ locale }) {
  const w = text[locale];
  const [resource, setResource] = useState("leads"), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [records, setRecords] = useState(null), [runs, setRuns] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(null), [status, setStatus] = useState("");
  const pending = useRef(null);
  const refreshRuns = async () => setRuns(await websiteApi("staff_data", { resource: "ai_runs" }));
  useEffect(() => { let alive = true; setRecords(null); setError(null); websiteApi("staff_data", { resource, query, page }).then(r => { if (alive) setRecords(r); }).catch(e => { if (alive) setError(e); }); return () => { alive = false; }; }, [resource, query, page]);
  useEffect(() => { let alive = true; websiteApi("staff_data", { resource: "ai_runs" }).then(r => { if (alive) setRuns(r); }).catch(e => { if (alive) setError(e); }); return () => { alive = false; }; }, []);
  async function run(action, input) {
    if (busy) return;
    setBusy(true); setError(null); setStatus("");
    const key = JSON.stringify([action,input]);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try { await websiteApi(action, input, pending.current.id); pending.current = null; setStatus(action === "ai_apply" ? w.saved : w.queued); await refreshRuns(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  const taskName = kind => taskLabels[locale]?.[kind] || Object.values(tasks).flat().find(([k]) => k === kind)?.[1] || kind;
  return <div className="site-account site-staff"><h1>{w.title}</h1><p>{w.description}</p>
    <nav className="site-account-nav"><Link href={`/${locale}/admin/classifieds`}>{{en:"Classified moderation",sv:"Annonsgranskning",de:"Inserate prüfen"}[locale]}</Link></nav>
    {error && <div role="alert"><p>{w[error.message] || apiError(error, locale)}</p>{error.message === "authentication_required" && <Link href={`/${locale}/sign_ins/new`}>{w.signIn}</Link>}</div>}
    {status && <p role="status">{status}</p>}
    {records && <><nav className="site-account-nav">{Object.keys(tasks).map(key => <button key={key} aria-pressed={resource === key} onClick={() => { setResource(key); setPage(1); }}>{w[key]}</button>)}</nav>
      <form onSubmit={e => { e.preventDefault(); setPage(1); setQuery(new FormData(e.currentTarget).get("query")); }}><label>{w.search}<input name="query" maxLength={200} defaultValue={query} /></label><button>{w.search}</button></form>
      <ul className="site-staff-records">{records.map(record => <li key={record.id}><h2>{record.name || record.id}</h2><div className="site-account-nav">{tasks[resource].map(([kind]) => <button key={kind} disabled={busy} onClick={() => run("ai_request", { kind, id: record.id })}>{taskName(kind)}</button>)}</div></li>)}</ul>
      {!records.length && <p>{w.empty}</p>}<nav className="site-account-nav"><button disabled={page === 1} onClick={() => setPage(page-1)}>{w.previous}</button><span>{page}</span><button disabled={records.length < 50} onClick={() => setPage(page+1)}>{w.next}</button></nav></>}
    {records && <section><h2>{w.recent}</h2><button disabled={busy} onClick={() => refreshRuns().catch(setError)}>{w.refresh}</button>{!runs.length && <p>{w.noDrafts}</p>}{runs.map(r => <article className="site-ai-draft" key={r.id}><h3>{r.source.name || r.source.brand || r.record_id} · {taskName(r.kind)}</h3><p>{r.applied_at ? w.applied : r.stage === "ready" ? w.ready : r.job_status === "failed" ? w.failed : w.processing}</p>
      {r.result && <>{r.kind === "lead_valuation" ? <><p>{w.qualified}: {r.result.qualified ? w.yes : w.no}</p><p>{w.estimate}: {r.result.estimated_value == null ? "—" : new Intl.NumberFormat(locale,{style:"currency",currency:"SEK"}).format(r.result.estimated_value)}</p><p className="site-ai-reasoning">{r.result.reasoning}</p><h4>{w.compare}</h4><ul>{r.result.matches?.map(m => <li key={m.id}>{/^https:\/\//.test(m.url) ? <a href={m.url} target="_blank" rel="noopener noreferrer">{m.name}</a> : m.name} · {new Intl.NumberFormat(locale,{style:"currency",currency:m.highest_bid_amount_currency || "SEK"}).format(m.highest_bid_amount_cents/100)}</li>)}</ul></> : Object.entries(r.result).map(([key,value]) => <details key={key} open><summary>{key.replaceAll("_"," ")}</summary><pre className="site-ai-text">{Array.isArray(value) ? value.join(", ") : String(value)}</pre></details>)}
      {!r.applied_at && <button disabled={busy} className="site-button" onClick={() => { if (window.confirm(w.confirm)) run("ai_apply", { id:r.id }); }}>{w.apply}</button>}</>}
    </article>)}</section>}
  </div>;
}
