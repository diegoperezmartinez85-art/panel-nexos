// NEXOS · mapa del barrio (offline)
const C='nx-mapa-demo-v1';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('nx-mapa-demo-')&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin||u.searchParams.has('chk'))return;
 e.respondWith(fetch(r).then(x=>{if(x.ok&&r.mode==='navigate'){const cp=x.clone();caches.open(C).then(c=>c.put(u.pathname,cp))}return x}).catch(()=>caches.match(u.pathname).then(m=>m||Response.error())))});
