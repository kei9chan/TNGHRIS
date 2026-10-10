/* Only cache the generic offline page. Never cache authenticated HRIS pages, API responses or evidence. */
const OFFLINE_CACHE='tng-hris-offline-v1';
function ownerStore(operation){return new Promise((resolve,reject)=>{const open=indexedDB.open('tng-hris-phone-v1',1);open.onupgradeneeded=()=>open.result.createObjectStore('settings');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('settings',operation?'readwrite':'readonly');const store=tx.objectStore('settings');const request=operation?store.put(operation,'owner'):store.get('owner');let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>{db.close();resolve(operation||result);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(OFFLINE_CACHE);await cache.add('/hris-offline.html');await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'&&new URL(event.request.url).origin===self.location.origin)event.respondWith(fetch(event.request).catch(()=>caches.match('/hris-offline.html')));});
self.addEventListener('message',event=>{if(event.data?.type!=='HRIS_PHONE_OWNER')return;event.waitUntil((async()=>{try{const source=new URL(event.source?.url||'');if(source.origin!==self.location.origin)throw new Error('Invalid source');await ownerStore({owner:event.data.owner||null,backend:event.data.backend});const notifications=await self.registration.getNotifications();notifications.filter(n=>n.data?.owner!==event.data.owner).forEach(n=>n.close());event.ports[0]?.postMessage({ok:true});}catch{event.ports[0]?.postMessage({ok:false});}})());});
function safePath(value){try{const url=new URL(value,self.location.origin);return url.origin===self.location.origin&&(/^\/operations(?:\?|$)/.test(url.pathname+url.search)||url.pathname==='/notifications')?url.pathname+url.search:'/notifications';}catch{return '/notifications';}}
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let payload;try{payload=event.data?.json();}catch{return;}
 const saved=await ownerStore();if(!saved?.owner||saved.owner!==payload?.owner)return;
 await self.registration.showNotification(payload.title||'TNG HRIS',{body:payload.body||'Open HRIS to view your update.',icon:'/hris-icons/icon-192.png',badge:'/hris-icons/badge-96.png',tag:payload.tag,data:{url:safePath(payload.url),owner:payload.owner,job:payload.job,receipt:payload.receipt}});
 const backend=saved.backend;
 if(backend?.url&&backend?.key&&payload.job&&payload.receipt){try{await fetch(backend.url+'/rest/v1/rpc/phone_push_receipt',{method:'POST',headers:{'Content-Type':'application/json',apikey:backend.key},body:JSON.stringify({p_job:payload.job,p_token:payload.receipt})});}catch{/* Push display does not depend on reporting receipt. */}}
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const saved=await ownerStore();if(saved?.owner!==event.notification.data?.owner)return;
 const target=new URL(safePath(event.notification.data?.url),self.location.origin).href;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
 if(existing){await existing.navigate(target);await existing.focus();}else await self.clients.openWindow(target);
})());});
