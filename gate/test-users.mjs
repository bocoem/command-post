import W from './worker.js';
const store = new Map();
globalThis.caches = { default: { match: async k => store.get(k.url)?.clone(), put: async (k,v)=>{store.set(k.url,v)}, delete: async k=>store.delete(k.url) } };
let rows = [
 {OBJECTID:1,email:'dmurray@botetourtva.gov',full_name:'Daniel',cb_level:'Admin',mci_level:'Admin',active:'Yes'},
 {OBJECTID:2,email:'chief@x.gov',full_name:'Chief',cb_level:'Chief',mci_level:'None',active:'Yes'},
 {OBJECTID:3,email:'capt@x.gov',full_name:'Capt',cb_level:'Command',mci_level:'None',active:'Yes'},
 {OBJECTID:4,email:'ff@x.gov',full_name:'FF',cb_level:'Viewer',mci_level:'None',active:'Yes'}];
let next=10, calls=[];
globalThis.fetch = async (u, o={}) => {
  u = String(u); calls.push(u.split('?')[0]);
  const R = j => new Response(JSON.stringify(j));
  if (u.includes('oauth2/token')) return R({access_token:'T',expires_in:7200});
  const body = o.body ? new URLSearchParams(String(o.body)) : new URL(u).searchParams;
  if (u.includes('/query')) { const w = body.get('where'); let m;
    if (w==='1=1') return R({features: rows.map(a=>({attributes:a}))});
    if ((m=w.match(/OBJECTID = (\d+)/))) return R({features: rows.filter(r=>r.OBJECTID==m[1]).map(a=>({attributes:a}))});
    if ((m=w.match(/LOWER\(email\) = '(.*)'/))) return R({features: rows.filter(r=>r.email.toLowerCase()==m[1]).map(a=>({attributes:a}))});
  }
  if (u.endsWith('/addFeatures')) { const f=JSON.parse(body.get('features'))[0].attributes; f.OBJECTID=next++; rows.push(f); return R({addResults:[{success:true,objectId:f.OBJECTID}]}); }
  if (u.endsWith('/updateFeatures')) { const f=JSON.parse(body.get('features'))[0].attributes; Object.assign(rows.find(r=>r.OBJECTID==f.OBJECTID),f); return R({updateResults:[{success:true,objectId:f.OBJECTID}]}); }
  if (u.endsWith('/deleteFeatures')) { const id=+body.get('objectIds'); rows=rows.filter(r=>r.OBJECTID!=id); return R({deleteResults:[{success:true,objectId:id}]}); }
  return R({error:{message:'unexpected '+u}});
};
const env = { ARC_CLIENT_ID:'x', ARC_CLIENT_SECRET:'secret-secret-secret-123', MAIL_FLOW_URL:'https://mail' };
const ctx = { waitUntil(){} };
const call = async (path, tok, method='GET', body) => { const r = await W.fetch(new Request('https://g'+path,{method, headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'}, body: body?JSON.stringify(body):undefined}), env, ctx); return [r.status, await r.json()]; };
// make tokens by signing: reuse /auth/verify flow is complex; craft via internal sign: import not exported, so mimic by calling verify? use guest path? Simplest: monkey sign via HMAC like worker
const enc=new TextEncoder(); const b64u=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function tok(e){ const raw='beacon-gate.'+env.ARC_CLIENT_SECRET; const k=await crypto.subtle.importKey('raw',enc.encode(raw),{name:'HMAC',hash:'SHA-256'},false,['sign']); const body=b64u(enc.encode(JSON.stringify({e,n:e,a:'cb',exp:Date.now()+1e6}))); return body+'.'+b64u(await crypto.subtle.sign('HMAC',k,enc.encode('tok.'+body))); }
const A=await tok('dmurray@botetourtva.gov'), C=await tok('chief@x.gov'), K=await tok('capt@x.gov');
const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1; };
let r;
r=await call('/admin/users',K); ok(r[0]===403,'Command cannot list users');
r=await call('/admin/users',C); ok(r[0]===200 && r[1].cap==='Command' && r[1].users.find(u=>u.OBJECTID===2).locked && !r[1].users.find(u=>u.OBJECTID===3).locked,'Chief lists; Chief rows locked, Command row editable');
ok(JSON.stringify(r[1].levels)==='["None","Viewer","Officer","Command"]','Chief can grant up to Command');
r=await call('/admin/users',C,'POST',{op:'add',user:{email:'New@X.gov',full_name:'New',cb_level:'Chief'}}); ok(r[0]===400,'Chief cannot grant Chief');
r=await call('/admin/users',C,'POST',{op:'add',user:{email:'New@X.gov',full_name:'New',cb_level:'Officer'}}); ok(r[0]===200 && rows.find(x=>x.email==='new@x.gov'),'Chief adds Officer (email lowercased)');
r=await call('/admin/users',C,'POST',{op:'add',user:{email:'new@x.gov',cb_level:'Viewer'}}); ok(r[0]===409,'Duplicate email refused');
r=await call('/admin/users',C,'POST',{op:'update',id:1,user:{email:'dmurray@botetourtva.gov',cb_level:'None'}}); ok(r[0]===403,'Chief cannot touch Admin');
r=await call('/admin/users',C,'POST',{op:'update',id:2,user:{email:'chief@x.gov',cb_level:'Chief',full_name:'Chief Renamed'}}); ok(r[0]===403,'Chief cannot edit own (Chief) row');
r=await call('/admin/users',A,'POST',{op:'update',id:1,user:{email:'dmurray@botetourtva.gov',cb_level:'Viewer',mci_level:'Admin'}}); ok(r[0]===403,'Admin cannot demote self');
r=await call('/admin/users',A,'POST',{op:'update',id:1,user:{email:'dmurray@botetourtva.gov',full_name:'Daniel Murray',cb_level:'Admin',mci_level:'Admin',active:'Yes'}}); ok(r[0]===200 && rows[0].full_name==='Daniel Murray','Admin can rename self');
r=await call('/admin/users',A,'POST',{op:'remove',id:1}); ok(r[0]===403,'Admin cannot remove self');
r=await call('/admin/users',A,'POST',{op:'update',id:2,user:{email:'chief@x.gov',cb_level:'Admin'}}); ok(r[0]===200 && rows.find(x=>x.OBJECTID===2).cb_level==='Admin','Admin promotes Chief to Admin');
r=await call('/admin/users',C,'POST',{op:'remove',id:4}); ok(r[0]===200,'Promoted Chief (now Admin) can remove a Viewer');
r=await call('/admin/users',K,'POST',{op:'remove',id:4}); ok(r[0]===403,'Command cannot remove');
r=await call('/admin/users',A,'POST',{op:'remove',id:3}); ok(r[0]===200 && !rows.find(x=>x.OBJECTID===3),'Admin removes Command');
r=await call('/admin/users',A,'POST',{op:'add',user:{email:'bad',cb_level:'Viewer'}}); ok(r[0]===400,'Bad email refused');
r=await call('/arc/services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BEACON_App_Access/FeatureServer/0/query',A); ok(r[0]===403,'Users table still not reachable through /arc');
