(() => {
"use strict";
const DB_NAME="bookwriters-offline",MEDIA="media",RECORDS="records";
const API="https://ysomxdoicbfmgbveghkr.supabase.co/functions/v1/library-api";
const KEY="sb_publishable_1VtpTU1pGn9yLn6Q_POtsw_Kp5ULXv6";
const token=()=>localStorage.getItem("bw-library-token")||sessionStorage.getItem("bw-library-token")||"";
function dbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(MEDIA))db.createObjectStore(MEDIA,{keyPath:"item_id"});if(!db.objectStoreNames.contains(RECORDS))db.createObjectStore(RECORDS,{keyPath:"key"})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function read(store,key){const db=await dbOpen();return new Promise((resolve,reject)=>{const req=db.transaction(store,"readonly").objectStore(store).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
async function write(store,value){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})}
async function remove(itemId){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(MEDIA,"readwrite");tx.objectStore(MEDIA).delete(itemId);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})}
const objectUrls=new Map();async function coverUrl(id){const row=await read(MEDIA,id);if(!row?.cover_blob)return null;if(objectUrls.has(id))return objectUrls.get(id);const url=URL.createObjectURL(row.cover_blob);objectUrls.set(id,url);return url}
async function downloadLoan(itemId,loanId,coverRemote){if(!navigator.onLine)throw new Error("Connect to the internet to download this title.");const existing=await read(MEDIA,itemId);if(existing?.blob&&existing?.cover_blob)return false;let blob=existing?.blob||null,contentType=existing?.content_type||"";if(!blob){const media=await api("media-url",{item_id:itemId,loan_id:loanId});const response=await fetch(media.url);if(!response.ok)throw new Error("The book file could not be downloaded.");blob=await response.blob();contentType=blob.type;if(!blob.size)throw new Error("The downloaded file is empty.")}let cover_blob=existing?.cover_blob||null;if(!cover_blob&&coverRemote){const response=await fetch(coverRemote);if(response.ok){const image=await response.blob();if(image.size)cover_blob=image}}if(navigator.storage?.estimate){const estimate=await navigator.storage.estimate();const free=(estimate.quota||0)-(estimate.usage||0);if(blob.size+(cover_blob?.size||0)>free)throw new Error("There is not enough device storage for this download.")}await write(MEDIA,{item_id:itemId,blob,content_type:contentType,cover_blob,saved_at:new Date().toISOString()});return true}
let autoDownloadRunning=false;async function autoDownloadLoans(loans){if(autoDownloadRunning||!navigator.onLine||!Array.isArray(loans))return;autoDownloadRunning=true;try{for(const loan of loans){if(!navigator.onLine)break;const item=loan.item||{},id=item.id||loan.item_id;if(!id)continue;const row=await read(MEDIA,id);if(row?.blob&&row?.cover_blob)continue;try{await downloadLoan(id,loan.id,item.cover_url||"")}catch(error){console.warn("Background offline download failed for",item.title,error)}}}finally{autoDownloadRunning=false;syncButtons();syncCovers()}}
async function syncCovers(){for(const img of document.querySelectorAll("[data-offline-cover]")){if(navigator.onLine){img.hidden=false;img.closest(".item")?.classList.remove("cover-unavailable");if(img.dataset.coverSrc)img.src=img.dataset.coverSrc;continue}try{const saved=await coverUrl(img.dataset.offlineCover);if(saved){img.src=saved;img.hidden=false;img.closest(".item")?.classList.remove("cover-unavailable")}else{img.hidden=true;img.closest(".item")?.classList.add("cover-unavailable")}}catch{img.hidden=true}}}
const profileKey=card=>"profile:"+card,loansKey=card=>"loans:"+card;
async function saveProfile(profile){if(profile?.card_number)await write(RECORDS,{key:profileKey(profile.card_number),value:profile,saved_at:Date.now()})}
async function getProfile(card){if(!card)return null;return (await read(RECORDS,profileKey(card)))?.value||null}
async function saveLoans(card,loans){if(card)await write(RECORDS,{key:loansKey(card),value:loans,saved_at:Date.now()})}
async function getLoans(card){if(!card)return null;return (await read(RECORDS,loansKey(card)))?.value||null}
async function getUrl(itemId){const row=await read(MEDIA,itemId);return row?.blob?URL.createObjectURL(row.blob):null}
window.bwOffline={getUrl,has:async id=>!!(await read(MEDIA,id))?.blob,remove,saveProfile,getProfile,saveLoans,getLoans,coverUrl,downloadLoan,autoDownloadLoans};
function notice(message,bad=false){let n=document.querySelector("#bw-feature-toast");if(!n){n=document.createElement("div");n.id="bw-feature-toast";n.className="notice";document.body.appendChild(n)}n.textContent=message;n.classList.toggle("error",bad);clearTimeout(n.timer);n.timer=setTimeout(()=>n.remove(),4500)}
async function api(action,data){const t=token();const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":KEY,...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({action,...data})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||"Request failed.");return body}
async function syncButtons(){for(const button of document.querySelectorAll("[data-offline-save]")){try{const saved=await read(MEDIA,button.dataset.offlineItem);button.textContent=saved?.blob?"Downloaded · Remove offline":"Download offline";button.dataset.saved=saved?.blob?"1":"0"}catch{}}}
document.addEventListener("click",async e=>{
 const button=e.target.closest("[data-offline-save]");if(!button)return;
 e.preventDefault();const loanId=button.dataset.offlineSave,itemId=button.dataset.offlineItem;button.disabled=true;
 try{
  if(button.dataset.saved==="1"){await remove(itemId);button.dataset.saved="0";button.textContent="Save offline";notice("Offline copy removed.");return}
  if(!navigator.onLine)throw new Error("Connect to the internet before saving this title offline.");
  button.textContent="Preparing…";
  const cover=button.closest(".item")?.querySelector("[data-offline-cover]")?.src||"";
  await downloadLoan(itemId,loanId,cover);
  button.dataset.saved="1";button.textContent="Downloaded · Remove offline";notice("Book and cover saved on this device.");syncCovers();
 }catch(err){button.textContent="Save offline";notice(err.message,true)}
 finally{button.disabled=false}
});
document.addEventListener("DOMContentLoaded",()=>{
 if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
 syncButtons();syncCovers();const observer=new MutationObserver(()=>{syncButtons();syncCovers()});const app=document.querySelector("#app-view");if(app)observer.observe(app,{subtree:true,childList:true});window.addEventListener("online",syncCovers);window.addEventListener("offline",syncCovers);
});
})();