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
const profileKey=card=>"profile:"+card,loansKey=card=>"loans:"+card;
async function saveProfile(profile){if(profile?.card_number)await write(RECORDS,{key:profileKey(profile.card_number),value:profile,saved_at:Date.now()})}
async function getProfile(card){if(!card)return null;return (await read(RECORDS,profileKey(card)))?.value||null}
async function saveLoans(card,loans){if(card)await write(RECORDS,{key:loansKey(card),value:loans,saved_at:Date.now()})}
async function getLoans(card){if(!card)return null;return (await read(RECORDS,loansKey(card)))?.value||null}
async function getUrl(itemId){const row=await read(MEDIA,itemId);return row?.blob?URL.createObjectURL(row.blob):null}
window.bwOffline={getUrl,has:async id=>!!(await read(MEDIA,id)),remove,saveProfile,getProfile,saveLoans,getLoans};
function notice(message,bad=false){let n=document.querySelector("#bw-feature-toast");if(!n){n=document.createElement("div");n.id="bw-feature-toast";n.className="notice";document.body.appendChild(n)}n.textContent=message;n.classList.toggle("error",bad);clearTimeout(n.timer);n.timer=setTimeout(()=>n.remove(),4500)}
async function api(action,data){const t=token();const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":KEY,...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({action,...data})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||"Request failed.");return body}
async function syncButtons(){for(const button of document.querySelectorAll("[data-offline-save]")){try{const saved=await read(MEDIA,button.dataset.offlineItem);button.textContent=saved?"Remove offline":"Save offline";button.dataset.saved=saved?"1":"0"}catch{}}}
document.addEventListener("click",async e=>{
 const button=e.target.closest("[data-offline-save]");if(!button)return;
 e.preventDefault();const loanId=button.dataset.offlineSave,itemId=button.dataset.offlineItem;button.disabled=true;
 try{
  if(button.dataset.saved==="1"){await remove(itemId);button.dataset.saved="0";button.textContent="Save offline";notice("Offline copy removed.");return}
  if(!navigator.onLine)throw new Error("Connect to the internet before saving this title offline.");
  button.textContent="Preparing…";
  const media=await api("media-url",{item_id:itemId,loan_id:loanId});
  const response=await fetch(media.url);if(!response.ok)throw new Error("The book file could not be downloaded.");
  const blob=await response.blob();if(!blob.size)throw new Error("The downloaded file is empty.");
  if(navigator.storage?.estimate){const estimate=await navigator.storage.estimate();const free=(estimate.quota||0)-(estimate.usage||0);if(blob.size>free)throw new Error("There is not enough device storage for this file.")}
  await write(MEDIA,{item_id:itemId,blob,content_type:blob.type,saved_at:new Date().toISOString()});
  button.dataset.saved="1";button.textContent="Remove offline";notice("Saved on this device. Open it from Loans without Wi-Fi.");
 }catch(err){button.textContent="Save offline";notice(err.message,true)}
 finally{button.disabled=false}
});
document.addEventListener("DOMContentLoaded",()=>{
 if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
 syncButtons();const observer=new MutationObserver(()=>syncButtons());const app=document.querySelector("#app-view");if(app)observer.observe(app,{subtree:true,childList:true});
});
})();