// Scope is only /punch-station/. Never cache API responses, photos or HRIS pages.
const CACHE='punch-shell-v1';
self.addEventListener('message',event=>{if(event.data?.type!=='PREPARE')return;event.waitUntil((async()=>{try{const urls=event.data.urls.filter(u=>{const p=new URL(u);return p.origin===location.origin&&/^\/assets\/.*\.(js|css)$/.test(p.pathname);});const cache=await caches.open(CACHE);await Promise.all(urls.map(async url=>{if(!(await cache.match(url)))await cache.add(url);}));event.ports[0]?.postMessage(true);}catch{event.ports[0]?.postMessage(false);}})());});
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);const page=await fetch('/punch-station/',{cache:'reload'});if(!page.ok)throw new Error('Offline shell unavailable');await cache.put('/punch-station/',page.clone());const html=await page.text();const urls=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(x=>x[1]);await cache.addAll(urls);})());});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin)return;
 if(event.request.mode==='navigate'&&u.pathname==='/punch-station/')event.respondWith(fetch(event.request).catch(()=>caches.match('/punch-station/')));
 else if(/^\/assets\/.*\.(js|css)$/.test(u.pathname))event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}catch{const saved=await cache.match(event.request);if(!saved)throw new Error('Prepare Punch Station online first');return saved;}})());
});
