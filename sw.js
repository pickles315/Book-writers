const CACHE_NAME="bookwriters-shell-v2";
const LOCAL_FILES=["./","./index.html","./library.js?v=library-2","./book-details.js?v=book-details-2","./requests.js?v=1","./features.js?v=2","./offline.js?v=1","./extras.js?v=1"];
const CDN_FILES=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0","https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"];
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.all([...LOCAL_FILES,...CDN_FILES].map(async url=>{try{const request=new Request(new URL(url,self.registration.scope).href);const response=await fetch(request,{mode:"cors"});if(response.ok)await cache.put(request,response)}catch{}}));
  self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("bookwriters-shell-")&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim()})());
});
self.addEventListener("fetch",event=>{
 const request=event.request;if(request.method!=="GET")return;
 const url=new URL(request.url);
 const local=url.origin===self.location.origin;
 const cdn=url.hostname==="cdn.jsdelivr.net";
 if(!local&&!cdn)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request);
  if(cached)return cached;
  try{const response=await fetch(request);if(response.ok)cache.put(request,response.clone());return response}
  catch(error){if(cached)return cached;throw error}
 })());
});
