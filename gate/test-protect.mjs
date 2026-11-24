import W from './worker.js';
const store = new Map();
globalThis.caches = { default: { match: async k => store.get(k.url)?.clone(), put: async (k,v)=>{store.set(k.url,v)}, delete: async k=>store.delete(k.url) } };
let mails=0, last=null;
globalThis.fetch = async (u, o={}) => { u=String(u); const R=j=>new Response(JSON.stringify(j));
  if (u.includes('oauth2/token')) return R({access_token:'T',expires_in:7200});
  if (u==='https://mail') { mails++; return new Response('ok'); }
  if (u.includes('BEACON_App_Access')) return R({features:[{attributes:{email:'ff@x.gov',full_name:'FF',cb_level:'Officer',mci_level:'None',active:'Yes'}}]});
  last=u; return R({features:[{attributes:{id:1,caller_name:'Jane',CallerPhone:'555',addr:'1 Main'}, properties:{caller_name:'Jane'}}], fields:[{name:'caller_name'},{name:'addr'}]}); };
const env={ARC_CLIENT_ID:'x',ARC_CLIENT_SECRET:'secret-secret-secret-123',MAIL_FLOW_URL:'https://mail'}, ctx={waitUntil(){}};
const enc=new TextEncoder(), b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function tok(e){ const k=await crypto.subtle.importKey('raw',enc.encode('beacon-gate.'+env.ARC_CLIENT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']); const body=b64u(enc.encode(JSON.stringify({e,n:e,a:'cb',exp:Date.now()+1e6}))); return body+'.'+b64u(await crypto.subtle.sign('HMAC',k,enc.encode('tok.'+body))); }
const T=await tok('ff@x.gov'); const C='services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/CAD_Calls_Active_Fire_EMS/FeatureServer/0/query';
const call=async(q)=>{const r=await W.fetch(new Request('https://g/arc/'+C+'?'+q,{headers:{Authorization:'Bearer '+T}}),{...env,SERVICES:JSON.stringify({cadCalls:'services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/CAD_Calls_Active_Fire_EMS/FeatureServer'})},ctx);return [r.status,await r.text()];};
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
let r=await call('where=1%3D1&outFields=*'); ok(r[0]===200 && !/Jane|555/.test(r[1]) && /1 Main/.test(r[1]),'Officer: caller fields removed, rest kept');
r=await call('where=1%3D1&f=geojson'); ok(r[0]===200 && !/Jane/.test(r[1]) && /f=json/.test(last),'Officer: GeoJSON request forced to JSON, no caller');
r=await call("where=caller_name%20LIKE%20'J%25'"); ok(r[0]===403,'Officer: filter on caller field refused');
r=await call('where=1%3D1&orderByFields=CallerPhone'); ok(r[0]===403,'Officer: sort on caller field refused');
r=await call('where=1%3D1&outStatistics=%5B%7B%22onStatisticField%22%3A%22caller_name%22%7D%5D'); ok(r[0]===403,'Officer: statistics on caller field refused');
for (let i=0;i<5;i++) await W.fetch(new Request('https://g/auth/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ff@x.gov',app:'cb'})}),env,ctx);
ok(mails===3,'Sign-in emails capped at 3 per 10 minutes (sent '+mails+')');
