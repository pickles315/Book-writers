(() => {
"use strict";
const API="https://ysomxdoicbfmgbveghkr.supabase.co/functions/v1/library-api";
const KEY="sb_publishable_1VtpTU1pGn9yLn6Q_POtsw_Kp5ULXv6";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const token=()=>localStorage.getItem("bw-library-token")||sessionStorage.getItem("bw-library-token")||"";
async function api(action,data={}) {
 const t=token();
 const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":KEY,...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({action,...data})});
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(body.error||"Request failed.");
 return body;
}
function ensurePages(){
 const nav=$("#navlinks"),app=$("#app-view");
 if(!nav||!app||$("#page-requests"))return;
 const reqButton=document.createElement("button");
 reqButton.type="button";reqButton.dataset.bwRoute="requests";reqButton.textContent="Book requests";
 nav.insertBefore(reqButton,$("#admin-add"));
 const adminButton=document.createElement("button");
 adminButton.type="button";adminButton.dataset.bwRoute="admin-requests";adminButton.textContent="Manage requests";adminButton.className="hidden";
 nav.insertBefore(adminButton,$("#admin-add"));
 const page=document.createElement("section");
 page.id="page-requests";page.className="hidden";
 page.innerHTML='<div class="section-head"><div><h2>Request a book</h2><p>Can’t find something? Send a request to the library.</p></div></div><section class="panel" style="max-width:720px"><label for="bw-request-title">Book title</label><input id="bw-request-title" maxlength="180" placeholder="Title of the book" required><label for="bw-request-author">Author</label><input id="bw-request-author" maxlength="120" placeholder="Author (if known)"><label for="bw-request-reason">Anything else? (optional)</label><textarea id="bw-request-reason" rows="3" maxlength="1000" placeholder="Why you’d like the library to add it"></textarea><p id="bw-request-error" class="small" aria-live="polite"></p><button id="bw-request-submit">Send request</button></section><div class="section-head"><div><h2>Your requests</h2><p>Check the status of books you’ve requested.</p></div><button class="secondary" id="bw-request-refresh">Refresh</button></div><div id="bw-request-list" class="grid"><div class="empty">Loading requests…</div></div>';
 app.appendChild(page);
 const admin=document.createElement("section");
 admin.id="page-admin-requests";admin.className="hidden";
 admin.innerHTML='<div class="section-head"><div><h2>Book requests</h2><p>Review requests from library members.</p></div><button class="secondary" id="bw-admin-refresh">Refresh</button></div><div id="bw-admin-request-list" class="grid"><div class="empty">Loading requests…</div></div>';
 app.appendChild(admin);
}
function hideLibraryPages(){
 ["page-discover","page-loans","page-settings","page-book-detail","page-requests","page-admin-requests"].forEach(id=>$("#"+id)?.classList.add("hidden"));
 document.querySelectorAll("[data-page],[data-bw-route]").forEach(b=>b.classList.remove("active"));
 window.scrollTo({top:0,behavior:"smooth"});
}
function statusTag(status){
 const label=status==="approved"?"Approved":status==="declined"?"Declined":"Pending";
 return '<span class="tag">'+label+'</span>';
}
function dateLabel(value){return value?new Date(value).toLocaleDateString():"";}
async function loadMine(){
 const host=$("#bw-request-list");if(!host)return;
 host.innerHTML='<div class="empty">Loading your requests…</div>';
 try{
  const {requests=[]}=await api("book-requests");
  host.innerHTML=requests.length?requests.map(r=>'<article class="item"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'+statusTag(r.status)+'<span class="small">'+esc(dateLabel(r.created_at))+'</span></div><h3>'+esc(r.title)+'</h3><div class="author">'+(r.author?'By '+esc(r.author):'Author not specified')+'</div>'+(r.reason?'<p class="small">'+esc(r.reason)+'</p>':'')+(r.admin_note?'<div class="small"><strong>Library response:</strong> '+esc(r.admin_note)+'</div>':'')+'</article>').join(""):'<div class="empty">You haven’t requested any books yet.</div>';
 }catch(e){host.innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
}
async function loadAdmin(){
 const host=$("#bw-admin-request-list");if(!host)return;
 host.innerHTML='<div class="empty">Loading requests…</div>';
 try{
  const {requests=[]}=await api("admin-book-requests");
  host.innerHTML=requests.length?requests.map(r=>'<article class="item" data-request-card="'+esc(r.id)+'"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center">'+statusTag(r.status)+'<span class="small">'+esc(dateLabel(r.created_at))+'</span></div><h3>'+esc(r.title)+'</h3><div class="author">'+(r.author?'By '+esc(r.author):'Author not specified')+'</div><p class="small">'+esc(r.reason||"No reason provided")+'</p><div class="small">Submitted by card '+esc(String(r.card_id).slice(0,8))+'…</div><label>Status</label><select class="bw-request-status"><option value="pending" '+(r.status==="pending"?"selected":"")+'>Pending</option><option value="approved" '+(r.status==="approved"?"selected":"")+'>Approved</option><option value="declined" '+(r.status==="declined"?"selected":"")+'>Declined</option></select><label>Response to member (optional)</label><textarea class="bw-request-note" rows="2" maxlength="1000" placeholder="Add a short note">'+esc(r.admin_note||"")+'</textarea><button class="bw-request-save" style="margin-top:12px">Save decision</button></article>').join(""):'<div class="empty">No book requests yet.</div>';
  host.querySelectorAll(".bw-request-save").forEach(btn=>btn.onclick=async()=>{
   const card=btn.closest("[data-request-card]");btn.disabled=true;
   try{
    await api("admin-update-book-request",{request_id:card.dataset.requestCard,status:card.querySelector(".bw-request-status").value,admin_note:card.querySelector(".bw-request-note").value});
    btn.textContent="Saved";await loadAdmin();
   }catch(e){btn.disabled=false;alert(e.message);}
  });
 }catch(e){host.innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
}
async function openRoute(route){
 hideLibraryPages();
 const page=$("#page-"+(route==="admin-requests"?"admin-requests":"requests"));
 page?.classList.remove("hidden");
 document.querySelector('[data-bw-route="'+route+'"]')?.classList.add("active");
 if(route==="requests")await loadMine();else await loadAdmin();
}
function init(){
 ensurePages();
 const nav=$("#navlinks");
 if(!nav)return;
 nav.addEventListener("click",e=>{
  const route=e.target.closest("[data-bw-route]")?.dataset.bwRoute;
  if(route){e.preventDefault();openRoute(route);return;}
  if(e.target.closest("[data-page]")){$("#page-requests")?.classList.add("hidden");$("#page-admin-requests")?.classList.add("hidden");}
 });
 $("#bw-request-submit").onclick=async()=>{
  const btn=$("#bw-request-submit"),error=$("#bw-request-error");
  btn.disabled=true;error.textContent="";
  try{
   const title=$("#bw-request-title").value.trim();
   if(!title)throw new Error("Enter a book title.");
   await api("book-request-create",{title,author:$("#bw-request-author").value.trim(),reason:$("#bw-request-reason").value.trim()});
   $("#bw-request-title").value="";$("#bw-request-author").value="";$("#bw-request-reason").value="";
   error.textContent="Your request was sent.";
   await loadMine();
  }catch(e){error.textContent=e.message;}
  btn.disabled=false;
 };
 $("#bw-request-refresh").onclick=loadMine;
 $("#bw-admin-refresh").onclick=loadAdmin;
 const syncAdmin=async()=>{
  try{const me=await api("me");$("#navlinks [data-bw-route='admin-requests']")?.classList.toggle("hidden",me.role!=="admin");}
  catch{$("#navlinks [data-bw-route='admin-requests']")?.classList.add("hidden");}
 };
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncAdmin()});
 const observer=new MutationObserver(()=>{if(!$("#app-view")?.classList.contains("hidden"))syncAdmin();});
 const app=$("#app-view");if(app)observer.observe(app,{attributes:true,attributeFilter:["class"]});
 syncAdmin();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();