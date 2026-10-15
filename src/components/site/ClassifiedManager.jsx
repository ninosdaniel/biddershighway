"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountNavigation } from "./CustomerWorkflows";
import { apiError, websiteApi } from "../../lib/site/api";
import { getSupabase } from "../../lib/supabaseClient";
import { listingImage } from "../../lib/site/listings";

const words = {
  en: ["Your classifieds","Create classified","Manufacturer","Model","Year","Registration number","Location","Asking price (SEK)","Description","Short summary","Save draft","Photos","Upload photos","Submit for review","Awaiting moderation","Published","Draft","Hidden","Sold","Edit","Publish","Hide","Mark as sold","Reopen","Saved","Sign in","Add a description and a photo before submitting.","You can edit drafts before submitting them for review.","Choose JPEG, PNG or WebP images, up to 10 MB each.","Mileage (km)","Transmission","Colour","All classifieds"],
  sv: ["Dina annonser","Skapa annons","Tillverkare","Modell","År","Registreringsnummer","Plats","Begärt pris (SEK)","Beskrivning","Kort ingress","Spara utkast","Bilder","Ladda upp bilder","Skicka för granskning","Inväntar granskning","Publicerad","Utkast","Dold","Såld","Redigera","Publicera","Dölj","Markera som såld","Öppna igen","Sparat","Logga in","Lägg till en beskrivning och en bild innan du skickar in.","Du kan redigera utkast innan du skickar dem för granskning.","Välj JPEG-, PNG- eller WebP-bilder, högst 10 MB per bild.","Mätarställning (km)","Växellåda","Färg","Alla annonser"],
  de: ["Ihre Inserate","Inserat erstellen","Hersteller","Modell","Jahr","Kennzeichen","Standort","Preisvorstellung (SEK)","Beschreibung","Kurze Zusammenfassung","Entwurf speichern","Fotos","Fotos hochladen","Zur Prüfung einreichen","Wartet auf Prüfung","Veröffentlicht","Entwurf","Ausgeblendet","Verkauft","Bearbeiten","Veröffentlichen","Ausblenden","Als verkauft markieren","Wieder öffnen","Gespeichert","Anmelden","Fügen Sie vor dem Einreichen eine Beschreibung und ein Foto hinzu.","Sie können Entwürfe vor dem Einreichen bearbeiten.","Wählen Sie JPEG-, PNG- oder WebP-Bilder mit bis zu 10 MB pro Bild.","Kilometerstand (km)","Getriebe","Farbe","Alle Inserate"],
};
const plain = html => String(html || "").replace(/<\/(?:p|h2|h3|li)>/gi,"\n\n").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').trim();
const htmlText = text => text.split(/\n\s*\n/).map(p=>`<p>${p.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p>`).join("");
export function ClassifiedManager({ locale, slug, staff = false }) {
  const w=words[locale],router=useRouter();
  const [records,setRecords]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[status,setStatus]=useState("");
  const pending=useRef(null),editing=slug==="new" || Boolean(slug);
  const load=()=>websiteApi("classifieds",{slug:slug==="new"?undefined:slug,staff}).then(setRecords);
  useEffect(()=>{ let alive=true; setRecords(null);setError(null);websiteApi("classifieds",{slug:slug==="new"?undefined:slug,staff}).then(r=>{if(alive)setRecords(r);}).catch(e=>{if(alive)setError(e);});return()=>{alive=false;};},[slug,staff]);
  async function command(action,input) {
    const key=JSON.stringify([action,input]);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
    const result=await websiteApi(action,input,pending.current.id);pending.current=null;return result;
  }
  const current=slug==="new"?null:records?.find(r=>r.slug===slug), editable=slug==="new" || current?.editable;
  async function save(event) {
    event.preventDefault();if(busy)return;const form=Object.fromEntries(new FormData(event.currentTarget));setBusy(true);setError(null);setStatus("");
    try{const input={...form,slug:current?.slug,updated_at:current?.updated_at,asking_price_cents:Math.round(Number(form.price)*100),body_sv:form.body_sv===plain(current?.body_sv)?current?.body_sv||"":htmlText(form.body_sv)};const result=await command(current?"classified_update":"classified_create",input);setStatus(w[24]);if(!current)router.push(`/${locale}/account/classifieds/${result.slug}/edit`);else await load();}catch(e){setError(e);}finally{setBusy(false);}
  }
  async function transition(item,action){setBusy(true);setError(null);try{await command(action,{slug:item.slug,updated_at:item.updated_at});await load();setStatus(w[24]);}catch(e){setError(e);}finally{setBusy(false);}}
  async function upload(event){event.preventDefault();const files=new FormData(event.currentTarget).getAll("photos");setBusy(true);setError(null);try{for(const file of files){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>10485760)throw new Error("invalid_input");const ticket=await websiteApi("upload_prepare",{slug:current.slug,filename:file.name,size:file.size,mime:file.type});const {error:uploadError}=await getSupabase().storage.from("website-uploads").uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:file.type});if(uploadError)throw uploadError;await websiteApi("upload_complete",{id:ticket.id});}await load();setStatus(w[24]);}catch(e){setError(e);}finally{setBusy(false);}}
  const state=item=>item.lifecycle_status==="awaiting_moderation"?w[14]:item.lifecycle_status==="sold"?w[18]:item.published_status===0?w[16]:item.lifecycle_status==="hidden"?w[17]:w[15];
  const base=staff?`/${locale}/admin/classifieds`:`/${locale}/account/classifieds`;
  return <div className="site-account"><AccountNavigation locale={locale}/><h1>{staff?w[32]:w[0]}</h1>{error&&<div role="alert"><p>{error.message==="listing_incomplete"?w[26]:apiError(error,locale)}</p>{error.message==="authentication_required"&&<Link href={`/${locale}/sign_ins/new`}>{w[25]}</Link>}</div>}{status&&<p role="status">{status}</p>}
    {records&&(!editing?<><Link className="site-button" href={`/${locale}/account/classifieds/new`}>{w[1]}</Link><ul>{records.map(item=><li key={item.id}><h2>{item.name}</h2><p>{state(item)}</p><Link href={`${base}/${item.slug}/edit`}>{w[19]}</Link>{item.published_status===1&&<Link href={`/${locale}/classifieds/${item.slug}`}>{w[15]}</Link>} {staff&&[["classified_publish",20],["classified_hide",21],["classified_sold",22],["classified_reopen",23]].map(([action,index])=><button key={action} disabled={busy} onClick={()=>transition(item,action)}>{w[index]}</button>)}</li>)}</ul></>:<>
      <Link href={base}>{w[0]}</Link><p>{current?state(current):w[16]} · {w[27]}</p>
      <form key={current?.updated_at||"new"} onSubmit={save}><fieldset disabled={busy||!editable}>{[["manufacturer",2,"data_manufacturer"],["model",3,"data_model"],["year",4,"data_year"],["odometer",29,"data_odometer"],["transmission",30,"data_transmission"],["color",31,"data_exterior_color"]].map(([key,index,field])=><label key={key}>{w[index]}<input name={key} defaultValue={current?.data?.[field]||""} required={["manufacturer","model","year"].includes(key)} maxLength={key==="year"?4:100}/></label>)}
        <label>{w[5]}<input name="registration_number" defaultValue={current?.registration_number||""} required maxLength={30}/></label><label>{w[6]}<input name="location" defaultValue={current?.location||""} required maxLength={200}/></label>
        <label>{w[7]}<input name="price" type="number" min="1" max="21474836" step="1" defaultValue={current?current.asking_price_cents/100:""} required/></label><label>{w[8]}<textarea name="body_sv" rows={12} maxLength={16000} defaultValue={plain(current?.body_sv)}/></label><label>{w[9]}<textarea name="excerpt_sv" rows={2} maxLength={120} defaultValue={current?.excerpt_sv||""}/></label><button className="site-button">{w[10]}</button></fieldset></form>
      {current&&<><h2>{w[11]}</h2><div className="site-upload-previews">{current.images.map(i=><img key={i.id} src={listingImage(i.filename)} alt={current.name}/>)}</div>{editable&&<form onSubmit={upload}><fieldset disabled={busy}><label>{w[28]}<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required/></label><button>{w[12]}</button></fieldset></form>}{current.lifecycle_status!=="awaiting_moderation"&&<button className="site-button" disabled={busy} onClick={()=>transition(current,"classified_submit")}>{w[13]}</button>}</>}
    </>)}
  </div>;
}
