(() => {
"use strict";
const URL="https://ysomxdoicbfmgbveghkr.supabase.co";
const KEY="sb_publishable_1VtpTU1pGn9yLn6Q_POtsw_Kp5ULXv6";
const API=URL+"/functions/v1/library-api";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const token=()=>localStorage.getItem("bw-library-token")||sessionStorage.getItem("bw-library-token")||"";
async function api(action,data={}){const res=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":KEY,...(token()?{Authorization:"Bearer "+token()}:{})},body:JSON.stringify({action,...data})});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||"Request failed.");return body}
function formatType(v){return v==="graphic_novel"?"Graphic novel":v==="audiobook"?"Audiobook":"Book"}
function duration(s){if(!s)return"Not provided";const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+" hr "+m+" min":m+" min"}
function readingTime(p){if(!p)return"Not provided";const h=Math.floor(p/60),m=p%60;return h?h+" hr "+m+" min":m+" min"}
function ensurePage(){let page=$("#page-book-detail");if(!page){page=document.createElement("section");page.id="page-book-detail";page.className="hidden";page.innerHTML='<div class="section-head"><div><h2>Book details</h2><p>Everything to know about this title.</p></div></div><div id="book-detail-content"></div>';$("#app-view").appendChild(page)}return page}
function showPage(){["page-discover","page-loans","page-settings"].forEach(id=>$("#"+id)?.classList.add("hidden"));ensurePage().classList.remove("hidden")}
let returnPage="discover",currentAdmin=false;
function render(item){
 const page=ensurePage(),content=$("#book-detail-content"),isAudio=item.media_type==="audiobook";
 const length=isAudio?'<div><span class="small">Audiobook length</span><strong>'+esc(duration(item.audio_duration_seconds))+'</strong></div>':'<div><span class="small">Estimated reading time</span><strong>'+esc(readingTime(item.page_count))+'</strong><span class="small">Approx. 1 minute per page</span></div>';
 const availability=item.released===false?"Not released yet":Number(item.available_copies||0)+" of "+Number(item.total_copies||0)+" available";
 content.innerHTML='<div class="detail-layout"><img class="detail-cover '+(isAudio?"audio":"")+'" src="'+esc(item.cover_url||"")+'" alt="Cover for '+esc(item.title)+'"><div class="detail-info"><div class="detail-tags"><span class="tag">'+formatType(item.media_type)+'</span><span class="tag">'+esc(item.age_classification)+'</span><span class="tag">'+esc(item.genre||"Uncategorized")+'</span>'+(item.series_name?'<span class="tag">'+esc(item.series_name)+(item.series_number?' · Book '+item.series_number:'')+'</span>':'<span class="tag">Standalone</span>')+'</div><h1>'+esc(item.title)+'</h1><p class="detail-author">By '+esc(item.author)+'</p>'+(item.narrator?'<p class="small">Narrated by '+esc(item.narrator)+'</p>':'')+'<p class="detail-description">'+(item.description?esc(item.description):'<span class="small">No description has been added yet.</span>')+'</p><div class="detail-facts"><div><span class="small">Availability</span><strong>'+availability+'</strong></div>'+length+'</div><div class="detail-actions"><button class="secondary" id="detail-back">← Back</button>'+(item.preview_file_path?'<button class="secondary" id="detail-sample">Read sample</button>':'')+(currentAdmin?'<button id="detail-edit">Edit book</button>':'')+'</div></div></div>';
 $("#detail-back").onclick=()=>{page.classList.add("hidden");const nav=document.querySelector('[data-page="'+returnPage+'"]');if(nav)nav.click();else $("#page-"+returnPage).classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"})};
 if(currentAdmin)$("#detail-edit").onclick=()=>editForm(item);
 if(item.preview_file_path)$("#detail-sample").onclick=()=>window.bwOpenSample?.(item.id,item.title);
 page.classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});
}
async function openDetails(itemId,from){
 if(!token()){alert("Please sign in to view book details.");return}
 returnPage=from;ensurePage();showPage();$("#book-detail-content").innerHTML='<div class="empty">Loading book details…</div>';
 try{const [result,me]=await Promise.all([api("item-detail",{item_id:itemId}),api("me")]);currentAdmin=me.role==="admin";render(result.item)}
 catch(e){$("#book-detail-content").innerHTML='<div class="empty">'+esc(e.message)+'</div><button class="secondary" id="detail-back-error">Back</button>';$("#detail-back-error").onclick=()=>{ensurePage().classList.add("hidden");$("#page-"+returnPage).classList.remove("hidden")}}
}
function editForm(item){
 const root=$("#modal-root");
 root.innerHTML='<div class="modal"><section class="modal-box"><h2>Edit book details</h2><p class="small">Changes apply to the shared catalogue and keep existing loans intact.</p><label>Title</label><input id="edit-title" maxlength="180" value="'+esc(item.title)+'"><div class="form-grid"><div><label>Author</label><input id="edit-author" maxlength="120" value="'+esc(item.author)+'"></div><div><label>Narrator</label><input id="edit-narrator" maxlength="120" value="'+esc(item.narrator||"")+'"></div></div><label>Description</label><textarea id="edit-description" rows="5" maxlength="4000">'+esc(item.description||"")+'</textarea><label>Genre</label><input id="edit-genre" maxlength="60" value="'+esc(item.genre||"Uncategorized")+'"><label>Book type</label><select id="edit-series-mode"><option value="standalone">Standalone book</option><option value="series">Part of a series</option></select><div id="edit-series-fields" class="form-grid"><div><label>Series name</label><input id="edit-series-name" maxlength="120" value="'+esc(item.series_name||"")+'"></div><div><label>Book number (optional)</label><input id="edit-series-number" type="number" min="1" max="999" value="'+(item.series_number||"")+'"></div></div><div class="form-grid"><div><label>Format</label><select id="edit-type" disabled><option value="book">Book</option><option value="graphic_novel">Graphic novel</option><option value="audiobook">Audiobook</option></select></div><div><label>Age classification</label><select id="edit-age"><option>All Ages</option><option>Juvenile</option><option>Adult</option></select></div></div><div class="form-grid"><div id="edit-pages-wrap"><label>Page count</label><input id="edit-pages" type="number" min="1" max="100000" value="'+(item.page_count||"")+'"></div><div id="edit-duration-wrap"><label>Audiobook length (minutes)</label><input id="edit-duration" type="number" min="1" max="14400" value="'+(item.audio_duration_seconds?Math.round(item.audio_duration_seconds/60):"")+'"></div></div><label>Total copies</label><input id="edit-copies" type="number" min="1" max="10000" value="'+Number(item.total_copies||1)+'"><label>Replace cover (optional)</label><input id="edit-cover" type="file" accept="image/png,image/jpeg,image/webp"><label>Upload full EPUB (this releases the title)</label><input id="edit-release-file" type="file" accept=".epub,application/epub+zip">'+(item.released?'<button type="button" class="secondary" id="edit-remove-epub">Remove full EPUB and mark unreleased</button>':'')+'<label>Upload or replace sample EPUB</label><input id="edit-preview-file" type="file" accept=".epub,application/epub+zip">'+(item.preview_file_path?'<button type="button" class="secondary" id="edit-remove-preview">Remove sample</button>':'')+'<p id="edit-error" class="small"></p><div class="actions"><button class="ghost" id="edit-cancel">Cancel</button><button id="edit-save">Save changes</button></div></section></div>';
 const box=root.querySelector(".modal-box");
 $("#edit-type",box).value=item.media_type;$("#edit-age",box).value=item.age_classification;
 $("#edit-series-mode",box).value=item.series_name?"series":"standalone";const syncSeries=()=>$("#edit-series-fields",box).classList.toggle("hidden",$("#edit-series-mode",box).value!=="series");$("#edit-series-mode",box).onchange=syncSeries;syncSeries();
 const sync=()=>{const a=$("#edit-type",box).value==="audiobook";$("#edit-pages-wrap",box).classList.toggle("hidden",a);$("#edit-duration-wrap",box).classList.toggle("hidden",!a);$("#edit-narrator",box).disabled=!a};
 $("#edit-type",box).onchange=sync;sync();
 $("#edit-cancel",box).onclick=()=>root.innerHTML="";
 if($("#edit-remove-epub",box))$("#edit-remove-epub",box).onclick=async()=>{if(!confirm("Remove the full EPUB and mark this title unreleased?"))return;try{await api("admin-remove-epub",{item_id:item.id});const result=await api("item-detail",{item_id:item.id});root.innerHTML="";render(result.item);toast("EPUB removed. The title is now unreleased.")}catch(e){$("#edit-error",box).textContent=e.message}};
 if($("#edit-remove-preview",box))$("#edit-remove-preview",box).onclick=async()=>{try{await api("admin-preview-set",{item_id:item.id,file_path:null});const result=await api("item-detail",{item_id:item.id});root.innerHTML="";render(result.item);toast("Sample removed.")}catch(e){$("#edit-error",box).textContent=e.message}};

 root.querySelector(".modal").addEventListener("click",e=>{if(e.target.classList.contains("modal"))root.innerHTML=""});
 $("#edit-save",box).onclick=async()=>{
  const btn=$("#edit-save",box),err=$("#edit-error",box);btn.disabled=true;err.textContent="";
  try{
   const type=$("#edit-type",box).value,cover=$("#edit-cover",box).files[0];let coverPath=null;
   if($("#edit-series-mode",box).value==="series"&&!$("#edit-series-name",box).value.trim())throw new Error("Enter the series name, or choose Standalone book.");
   if($("#edit-series-number",box).value&&(!Number.isInteger(Number($("#edit-series-number",box).value))||Number($("#edit-series-number",box).value)<1||Number($("#edit-series-number",box).value)>999))throw new Error("Series book number must be between 1 and 999.");
   if(cover){
    if(!/^image\/(png|jpeg|webp)$/.test(cover.type))throw new Error("Use a PNG, JPG, or WebP cover.");
    const ext=cover.type==="image/png"?"png":cover.type==="image/webp"?"webp":"jpg";
    const start=await api("admin-cover-start",{item_id:item.id,cover_ext:ext});
    const client=window.supabase.createClient(URL,KEY);
    const uploaded=await client.storage.from("library-media").uploadToSignedUrl(start.cover_path,start.cover_upload.token,cover,{contentType:cover.type});
    if(uploaded.error)throw uploaded.error;coverPath=start.cover_path;
   }
   await api("admin-update-item",{item_id:item.id,title:$("#edit-title",box).value,author:$("#edit-author",box).value,narrator:$("#edit-narrator",box).value,description:$("#edit-description",box).value,media_type:type,age_classification:$("#edit-age",box).value,total_copies:$("#edit-copies",box).value,page_count:$("#edit-pages",box).value,audio_duration_seconds:$("#edit-duration",box).value?Number($("#edit-duration",box).value)*60:null,genre:$("#edit-genre",box).value.trim()||"Uncategorized",series_name:$("#edit-series-mode",box).value==="series"?$("#edit-series-name",box).value.trim():null,series_number:$("#edit-series-mode",box).value==="series"&&$("#edit-series-number",box).value?Number($("#edit-series-number",box).value):null,cover_path:coverPath});
   const releaseFile=$("#edit-release-file",box).files[0];
   if(releaseFile){
    if(!/\.epub$/i.test(releaseFile.name))throw new Error("Choose an EPUB file to release this title.");
    const start=await api("admin-release-start",{item_id:item.id});
    const client=window.supabase.createClient(URL,KEY);
    const upload=await client.storage.from("library-media").uploadToSignedUrl(start.file_path,start.upload.token,releaseFile,{contentType:"application/epub+zip"});
    if(upload.error)throw upload.error;
    await api("admin-release-item",{item_id:item.id,file_path:start.file_path});
   }
   const previewFile=$("#edit-preview-file",box).files[0];
   if(previewFile){
    if(!/\.epub$/i.test(previewFile.name))throw new Error("Choose an EPUB file for the sample.");
    const start=await api("admin-preview-start",{item_id:item.id,ext:"epub"});
    const client=window.supabase.createClient(URL,KEY);
    const upload=await client.storage.from("library-media").uploadToSignedUrl(start.file_path,start.upload.token,previewFile,{contentType:"application/epub+zip"});
    if(upload.error)throw upload.error;
    await api("admin-preview-set",{item_id:item.id,file_path:start.file_path});
   }

   root.innerHTML="";const result=await api("item-detail",{item_id:item.id});render(result.item);toast("Book details updated.");
  }catch(e){err.textContent=e.message;btn.disabled=false}
 };
}
function toast(message){let node=$("#book-detail-toast");if(!node){node=document.createElement("div");node.id="book-detail-toast";node.className="notice";document.body.appendChild(node)}node.textContent=message;clearTimeout(node.timer);node.timer=setTimeout(()=>node.remove(),3500)}
const style=document.createElement("style");
style.textContent='.book-title{padding:0;background:transparent;color:var(--ink);font:inherit;font-weight:700;text-align:left;line-height:1.2;border:0;border-radius:0}.book-title:hover{text-decoration:underline;filter:none}.detail-layout{display:grid;grid-template-columns:minmax(160px,280px) minmax(0,1fr);gap:clamp(20px,4vw,42px);background:var(--card);border:1px solid var(--line);border-radius:20px;padding:clamp(16px,4vw,30px);box-shadow:var(--shadow)}.detail-cover{width:100%;max-height:430px;aspect-ratio:2/3;object-fit:cover;border-radius:12px;background:var(--green-soft)}.detail-cover.audio{aspect-ratio:1}.detail-info h1{font:700 clamp(2rem,5vw,3rem)/1.08 Georgia,serif;margin:12px 0 6px}.detail-author{color:var(--muted);font-size:1.05rem;margin:0}.detail-description{white-space:pre-wrap;line-height:1.7;margin:22px 0}.detail-tags,.detail-actions{display:flex;gap:9px;flex-wrap:wrap}.detail-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;border-top:1px solid var(--line);padding-top:17px}.detail-facts div{display:flex;flex-direction:column;gap:3px}.detail-actions{margin-top:24px}@media(max-width:600px){.detail-layout{grid-template-columns:1fr}.detail-cover{width:min(210px,65%);margin:0 auto}.detail-facts{grid-template-columns:1fr 1fr}.detail-info h1{text-align:left}}';
document.head.appendChild(style);
document.addEventListener("click",e=>{const button=e.target.closest("[data-book-detail]");if(!button)return;const card=button.closest(".item");const from=card?.querySelector("[data-open-loan]")?"loans":"discover";openDetails(button.dataset.bookDetail,from)});
})();