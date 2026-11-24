// A small stand-in for ArcGIS Online used by the gate tests: the users table (layer 0) and the change log (layer 1).
export function fakeArc(rows, opts = {}) {
  const state = { rows, log: [], next: 100, mails: [], noKind: !!opts.noKind, noLog: !!opts.noLog };
  const store = new Map();
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); }, delete: async (k) => store.delete(k.url) } };
  const R = (j) => new Response(JSON.stringify(j));
  const match = (r, w) => {
    if (w === '1=1') return true;
    let m;
    if (state.noKind && /kind/.test(w)) throw new Error('Invalid field kind');
    if ((m = w.match(/^OBJECTID = (\d+)$/))) return r.OBJECTID == m[1];
    if ((m = w.match(/^uid = '(.*)'$/))) return r.uid === m[1];
    if ((m = w.match(/^setup_hash = '(.*)'$/))) return r.setup_hash === m[1];
    if ((m = w.match(/^LOWER\(email\) = '([^']*)'( AND \(kind IS NULL OR kind <> 'Device'\))?$/))) return String(r.email || '').toLowerCase() === m[1] && (!m[2] || r.kind !== 'Device');
    throw new Error('unexpected where ' + w);
  };
  globalThis.fetch = async (u, o = {}) => {
    u = String(u);
    if (u.includes('oauth2/token')) return R({ access_token: 'T', expires_in: 7200 });
    if (u === 'https://mail') { state.mails.push(JSON.parse(o.body)); return new Response('ok'); }
    const body = o.body ? new URLSearchParams(String(o.body)) : new URL(u).searchParams;
    const isLog = /\/FeatureServer\/1\//.test(u);
    if (isLog) {
      if (state.noLog) return R({ error: { message: 'Invalid URL' } });
      if (u.includes('/addFeatures')) { state.log.push(JSON.parse(body.get('features'))[0].attributes); return R({ addResults: [{ success: true, objectId: state.log.length }] }); }
      if (u.includes('/query')) return R({ features: state.log.slice().reverse().map((a) => ({ attributes: a })) });
    }
    if (u.includes('/query')) { try { return R({ features: state.rows.filter((r) => match(r, body.get('where'))).map((a) => ({ attributes: { ...a } })) }); } catch (e) { return R({ error: { message: e.message } }); } }
    if (u.endsWith('/addFeatures')) { const f = JSON.parse(body.get('features'))[0].attributes; f.OBJECTID = state.next++; state.rows.push(f); return R({ addResults: [{ success: true, objectId: f.OBJECTID }] }); }
    if (u.endsWith('/updateFeatures')) { const f = JSON.parse(body.get('features'))[0].attributes; Object.assign(state.rows.find((r) => r.OBJECTID == f.OBJECTID), f); return R({ updateResults: [{ success: true, objectId: f.OBJECTID }] }); }
    if (u.endsWith('/deleteFeatures')) { const id = +body.get('objectIds'); state.rows = state.rows.filter((r) => r.OBJECTID != id); return R({ deleteResults: [{ success: true, objectId: id }] }); }
    return R({ error: { message: 'unexpected ' + u } });
  };
  return state;
}
export const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); } };
export function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; }
