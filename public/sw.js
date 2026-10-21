/* Solo el shell público y el catálogo se almacenan en CacheStorage. Nunca /me,
   administración, tokens, respuestas HTTP privadas ni reportes. */
const CACHE='camino-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/icon.svg','/manifest.webmanifest','/campus/map-2d.jpg','/campus/map-3d.jpg'])));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('camino-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 const publicResource=url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/campus/')||['/','/icon.svg','/manifest.webmanifest','/api/catalog'].includes(url.pathname);
 if(!publicResource||event.request.headers.has('RSC')||event.request.headers.has('Next-Router-State-Tree'))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;}).catch(async()=>{const cached=await caches.match(event.request);return cached||new Response('Sin conexión. Abre la aplicación una vez con internet.',{status:503});}));
});
function openQueue(){return new Promise((resolve,reject)=>{const r=indexedDB.open('camino-offline',1);r.onupgradeneeded=()=>r.result.createObjectStore('completions',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function work(mode,operation){const db=await openQueue();return new Promise((resolve,reject)=>{const t=db.transaction('completions',mode);const r=operation(t.objectStore('completions'));let result;r.onsuccess=()=>result=r.result;t.oncomplete=()=>{db.close();resolve(result);};t.onerror=()=>{db.close();reject(t.error);};});}
self.addEventListener('sync',event=>{if(event.tag==='camino-completions')event.waitUntil((async()=>{
 const me=await fetch('/api/me',{cache:'no-store'});if(!me.ok)return;const current=await me.json();
 for(const item of await work('readonly',s=>s.getAll())){
  if(item.participantId!==current.id||item.error)continue;
  const response=await fetch('/api/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.payload)});
  if(response.ok)await work('readwrite',s=>s.delete(item.id));
  else if(response.status===401)return;
  else if(response.status===429||response.status>=500)throw Error('Retry later');
  else{const result=await response.json();await work('readwrite',s=>s.put({...item,error:result.error}));}
 }
 const clients=await self.clients.matchAll();clients.forEach(c=>c.postMessage({type:'SYNC_COMPLETE'}));
})());});
// La entrega push requiere un worker de envío y claves VAPID; ver docs.
self.addEventListener('push',event=>{let data={};try{data=event.data.json();}catch{return;}event.waitUntil(self.registration.showNotification(String(data.title||'ExpoTEC'),{body:String(data.body||'Hay una actividad por comenzar.'),icon:'/icon.svg',data:{url:'/'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.openWindow('/'));});
