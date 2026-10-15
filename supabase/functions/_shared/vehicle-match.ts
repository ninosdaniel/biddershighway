import aliases from "./vehicle-aliases.json" with { type: "json" };

export const normalizeVehicle = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const expand = (words: string[]) => {
  const runs = words.flatMap(w => w.match(/[a-z]+|[0-9]+/g) || []);
  const glued = runs.slice(1).flatMap((right, i) => {
    const left = runs[i];
    return /^[a-z]+$/.test(left) !== /^[a-z]+$/.test(right) && left.length + right.length <= 6 ? [left + right] : [];
  });
  return [...new Set([...runs, ...words.filter(w => (w.match(/[a-z]+|[0-9]+/g) || []).length > 1), ...glued])];
};
export function parseVehicle(text: string) {
  let words = normalizeVehicle(text).split(" ").filter(Boolean), year: number | null = null, make = "";
  if (/^(19|20)\d{2}$/.test(words[0]) && Number(words[0]) <= new Date().getFullYear() + 1) year = Number(words.shift());
  const phrases = Object.entries(aliases.make_phrases).flatMap(([surface, canonical]) => {
    const phrase = surface.split(" ");
    const index = words.findIndex((_, i) => phrase.every((w, n) => words[i+n] === w));
    return index < 0 ? [] : [{ index, phrase, canonical }];
  }).sort((a,b) => a.index-b.index || b.phrase.length-a.phrase.length);
  if (phrases.length) { const p = phrases[0]; make = p.canonical; words.splice(p.index, p.phrase.length); }
  else {
    const model = Object.entries(aliases.model_makes).sort((a,b) => b[0].length-a[0].length).find(([p]) => p.split(" ").every((w,i) => words[i] === w));
    make = model?.[1] || words.shift() || "";
  }
  return { make, year, modelTokens: expand(words), tokens: expand([...make.split(" "), ...words]), makes: [...new Set([make,...aliases.sibling_groups.filter(g => g.includes(make)).flat()])].filter(Boolean) };
}
export function trigramSimilarity(a: string,b: string) {
  if (!a || !b) return 0;
  if (a===b) return 1;
  const grams = (s: string) => { const p = `  ${s} `; return new Set(Array.from({length:p.length-2},(_,i)=>p.slice(i,i+3))); };
  const left=grams(a),right=grams(b);
  return [...left].filter(x=>right.has(x)).length/new Set([...left,...right]).size;
}
export type Comparison = { id: string; name: string; search_tokens: string; body: string; make: string; year: number | null; sold: boolean; closed_at: string; highest_bid_amount_cents: number; highest_bid_amount_currency: string; source: string; url: string; score?: number };
export function vehicleScore(query: ReturnType<typeof parseVehicle>, record: Comparison, now = new Date()) {
  const average = (words: string[], score: (word:string)=>number) => words.length ? words.reduce((n,w)=>n+w.length*score(w),0)/words.reduce((n,w)=>n+w.length,0) : 0;
  const available = (record.search_tokens || "").split(" ");
  const model = query.modelTokens.length ? average(query.modelTokens,w => { const n=Math.max(0,...available.map(x=>trigramSimilarity(w,x))); return n>=.4?n:0; }) : 1;
  const make = record.make === query.make ? 1 : query.makes.includes(record.make) ? .5 : 0;
  const year = query.year == null ? .6 : record.year == null ? .4 : 1/(1+(Math.abs(record.year-query.year)/6)**2);
  const proseWords=(query.modelTokens.length ? query.modelTokens : query.tokens).filter(w=>w.length>=4 && /^[a-z]+$/.test(w));
  const prose = average(proseWords,w=>normalizeVehicle(record.body).split(" ").includes(w)?1:0);
  const closed=new Date(record.closed_at), recency=Number.isFinite(+closed)?1/(1+Math.abs(now.getFullYear()-closed.getFullYear())/8):0;
  return .4*model+.2*make+.18*year+.12*prose+.1*((record.sold?1:.6)*.5+recency*.5);
}
export function rankComparisons(query:string, records:Comparison[]) {
  const parsed=parseVehicle(query);
  if (!parsed.tokens.length) return [];
  return records.map(r=>({...r,score:vehicleScore(parsed,r)})).filter(r=>r.score>=.15).sort((a,b)=>b.score-a.score || Number(b.sold)-Number(a.sold) || +new Date(b.closed_at)-+new Date(a.closed_at)).slice(0,8);
}

// Exact port of SavedSearch's word-prefix and bounded typo rules.
export function savedSearchMatches(term:string, query:string) {
  const words=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
  const left=words(term),right=words(query);
  function distance(a:string,b:string) { let costs=Array.from({length:b.length+1},(_,i)=>i); for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,costs[j+1]+1,costs[j]+Number(a[i]!==b[j])));costs=next;}return costs[b.length]; }
  return left.length>0 && left.every(a=>right.some(b=>a===b || a.length>=2&&b.startsWith(a) || b.length>=3&&a.startsWith(b) || Math.min(a.length,b.length)>=5&&distance(a,b)<=(Math.max(a.length,b.length)>=8?2:1)));
}
