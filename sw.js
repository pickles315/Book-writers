const CACHE_NAME="bookwriters-shell-v37";
const LOCAL_FILES=["./","./index.html","./jszip.min.js","./library.js?v=library-32","./book-details.js?v=book-details-5","./requests.js?v=2","./features.js?v=3","./offline.js?v=5","./extras.js?v=3"];
const CDN_FILES=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0","https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"];

self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.all([...LOCAL_FILES,...CDN_FILES].map(async url=>{
   try{
    const request=new Request(new URL(url,self.registration.scope).href,{cache:"no-store"});
    const response=await fetch(request,{cache:"no-store"});
    if(response.ok)await cache.put(request,response);
   }catch{}
  }));
  await self.skipWaiting();
 })());
});

self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith("bookwriters-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});

self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 const local=url.origin===self.location.origin;
 const cdn=url.hostname==="cdn.jsdelivr.net"||url.hostname==="unpkg.com";
 if(!local&&!cdn)return;

 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  try{
   // Always check the live site first so website updates reach installed apps.
   const response=await fetch(request,{cache:"no-store"});
   if(response.ok)await cache.put(request,response.clone());
   return response;
  }catch(error){
   const cached=await cache.match(request);
   if(cached)return cached;
   throw error;
  }
 })());
});
