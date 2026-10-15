import { parseModelResponse, sanitizeGeneratedHtml, validateResult } from "../_shared/ai.ts";
import { parseVehicle, rankComparisons, savedSearchMatches, type Comparison } from "../_shared/vehicle-match.ts";
function assert(value:unknown): asserts value { if(!value) throw new Error("Assertion failed"); }
function rejects(fn:()=>unknown) { let rejected=false;try { fn(); } catch { rejected=true; } assert(rejected); }
Deno.test("Claude refusals and truncated or malformed output cannot become saved results",()=>{
  for(const reason of ["max_tokens","refusal","tool_use"]) rejects(()=>parseModelResponse({stop_reason:reason,content:[{type:"text",text:'{"estimated_value":500}'}]}));
  rejects(()=>parseModelResponse({stop_reason:"end_turn",content:[{type:"text",text:"[]"}]}));
  rejects(()=>validateResult("value",{estimated_value:-1,reasoning:"test"}));
  rejects(()=>validateResult("value",{estimated_value:450000000,reasoning:"cents passed as SEK"}));
  rejects(()=>validateResult("value",{estimated_value:450000,reasoning:"test",qualified:true}));
  assert(validateResult("value",{estimated_value:450000,reasoning:"test"}).estimated_value===450000);
});
Deno.test("Generated content strips executable markup, caps excerpts and preserves category vocabulary",()=>{
  const result=validateResult("lot_summary",{excerpt_sv:"x".repeat(200),categories:["INVENTED","Sportbilar","Sportbilar","Coupé"]});
  assert(String(result.excerpt_sv).length===120);
  assert(JSON.stringify(result.categories)==='["Sportbilar","Coupé"]');
  const clean=sanitizeGeneratedHtml('<p onclick="alert(1)">Test<script>steal()</script><a href="javascript:bad()">link</a><img src="https://example.test/car.jpg" onerror="bad()"></p>');
  assert(!/script|onclick|onerror|javascript|steal/.test(clean));
  assert(clean.includes("https://example.test/car.jpg"));
  assert(validateResult("qualify",{qualified:false,confidence:1.5,notable:false,reasoning:"Noise"}).reasoning==="");
});
Deno.test("Vehicle matching ports Highway marque aliases, model token expansion and scoring",()=>{
  assert(parseVehicle("1976 Corvette C3").make==="chevrolet");
  assert(parseVehicle("Mercedes Benz 300SL").tokens.includes("300sl"));
  assert(parseVehicle("Mercedes 300 SL").tokens.includes("300sl"));
  assert(parseVehicle("BMW E 36").tokens.includes("e36"));
  const base={id:"1",name:"BMW E36",make:"bmw",year:1997,sold:true,closed_at:"2025-01-01",body:"",search_tokens:"bmw e36 e 36",highest_bid_amount_cents:10000000,highest_bid_amount_currency:"SEK",source:"biddershighway",url:"https://example.test"} satisfies Comparison;
  const match=rankComparisons("1997 BMW E36",[{...base,id:"2",make:"ford",search_tokens:"ford fiesta"},base]);
  assert(match[0].id==="1");
  assert(rankComparisons("",[base]).length===0);
});
Deno.test("Saved search matching retains all-word, prefix and bounded typo rules",()=>{
  assert(savedSearchMatches("Porsche 911","1990 Porsche 911 Carrera"));
  assert(savedSearchMatches("Porshe","Porsche 911"));
  assert(!savedSearchMatches("Porsche 911","Porsche 944"));
  assert(!savedSearchMatches("","Porsche 911"));
  assert(!savedSearchMatches("BMW M3","BMW M5"));
});
