const CACHE="hz09-anatomy-v4";
const ANATOMY_PREFIX="https://raw.githubusercontent.com/Nurkan1/Anatria-3D/949ac80cc9763539afc48e60b5246132f00468db/public/anatomy/";

self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith("hz09-anatomy-")&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request){
  const cache=await caches.open(CACHE);
  const hit=await cache.match(request);
  if(hit)return hit;
  const response=await fetch(request);
  if(response.ok||response.type==="opaque")cache.put(request,response.clone()).catch(()=>{});
  return response;
}

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request);
    if(response.ok)cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch(error){
    const hit=await cache.match(request);
    if(hit)return hit;
    throw error;
  }
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);

  if(request.url.startsWith(ANATOMY_PREFIX)){
    event.respondWith(cacheFirst(request));
    return;
  }

  if(url.origin===self.location.origin){
    if(request.mode==="navigate"){
      event.respondWith(networkFirst(request));
      return;
    }
    if(["script","style","font","image"].includes(request.destination)){
      event.respondWith(cacheFirst(request));
    }
  }
});
