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
function toast(message,bad=false){let n=$("#bw-feature-toast");if(!n){n=document.createElement("div");n.id="bw-feature-toast";n.className="notice";document.body.appendChild(n)}n.textContent=message;n.classList.toggle("error",bad);clearTimeout(n.timer);n.timer=setTimeout(()=>n.remove(),3500)}
function card(item,extra=""){return '<article class="item"><img class="cover '+(item.media_type==="audiobook"?"audio":"")+'" src="'+esc(item.cover_url||"")+'" alt=""><h3>'+esc(item.title||"Untitled")+'</h3><div class="author">By '+esc(item.author||"Unknown author")+'</div><div class="meta"><span class="tag">'+esc(item.media_type||"Book")+'</span>'+(item.released===false?'<span class="tag">Estimated release: '+(item.release_date?new Date(item.release_date+"T00:00:00").toLocaleDateString():"TBD")+'</span>':'')+'</div>'+extra+'</article>'}
function ensure(){
 const nav=$("#navlinks"),app=$("#app-view");if(!nav||!app||$("#page-my-shelf"))return;
 const shelf=document.createElement("button");shelf.type="button";shelf.dataset.bwFeature="shelf";shelf.textContent="My shelf";nav.insertBefore(shelf,$("#admin-add"));
 const admin=document.createElement("button");admin.type="button";admin.dataset.bwFeature="admin";admin.textContent="Library admin";admin.className="hidden";nav.insertBefore(admin,$("#admin-add"));
 const page=document.createElement("section");page.id="page-my-shelf";page.className="hidden";
 page.innerHTML='<div class="section-head"><div><h2>My shelf</h2><p>Your saved books, reading activity and notes.</p></div><button class="secondary" id="bw-shelf-refresh">Refresh</button></div>'+
  '<div class="section-head"><div><h2>Reading history</h2><p>Books and audiobooks you have returned.</p></div></div><div id="bw-reading-history" class="bw-feature-grid"></div>'+
 '<div class="bw-stat-grid" id="bw-reader-stats"></div>'+
 '<div class="section-head"><div><h2>Due dates</h2><p>Keep an eye on books you are borrowing.</p></div></div><div id="bw-due-alerts" class="bw-feature-grid"></div>'+
 '<div class="section-head"><div><h2>Wishlist</h2><p>Books you want to read later.</p></div></div><div id="bw-wishlist" class="bw-feature-grid"></div>'+
 '<div class="section-head"><div><h2>Waitlists</h2><p>Books you are waiting to borrow.</p></div></div><div id="bw-waitlist" class="bw-feature-grid"></div>'+
 '<div class="section-head"><div><h2>Recently viewed</h2><p>Pick up where you were browsing.</p></div></div><div id="bw-recent" class="bw-feature-grid"></div>'+
 '<div class="section-head"><div><h2>Recommended</h2><p>More titles based on the formats you borrow.</p></div></div><div id="bw-recommendations" class="bw-feature-grid"></div>'+
 '<div class="section-head"><div><h2>Reading tools</h2><p>Save a page or a note for one of your current loans.</p></div></div>'+
 '<section class="panel bw-reading-tools"><label for="bw-tool-loan">Current loan</label><select id="bw-tool-loan"></select><label for="bw-bookmark-location">Bookmark location (page number or EPUB location)</label><input id="bw-bookmark-location" maxlength="500" placeholder="Example: Page 42"><label for="bw-bookmark-label">Bookmark label (optional)</label><input id="bw-bookmark-label" maxlength="120" placeholder="A good part"><button id="bw-bookmark-add">Save bookmark</button><label for="bw-note-content">Reading note</label><textarea id="bw-note-content" rows="3" maxlength="3000" placeholder="Write a note about this book…"></textarea><button id="bw-note-add" class="secondary">Save note</button></section>'+
 '<div class="section-head"><div><h2>My bookmarks</h2></div></div><div id="bw-bookmarks" class="bw-feature-grid"></div>'+
 '<div class="section-head"><div><h2>My notes</h2></div></div><div id="bw-notes" class="bw-feature-grid"></div>';
 app.appendChild(page);
 const adminPage=document.createElement("section");adminPage.id="page-library-admin";adminPage.className="hidden";
 adminPage.innerHTML='<div class="section-head"><div><h2>Library overview</h2><p>Live activity across the library.</p></div><button class="secondary" id="bw-admin-feature-refresh">Refresh</button></div><div id="bw-admin-stats" class="bw-stat-grid"></div><div class="section-head"><div><h2>Catalogue inventory</h2><p>Adjust copy counts and see how many are currently borrowed.</p></div></div><div id="bw-admin-inventory" class="bw-feature-grid"></div><div class="section-head"><div><h2>Active loans</h2><p>Extend a due date when needed.</p></div></div><div id="bw-admin-loans" class="bw-feature-grid"></div><div class="section-head"><div><h2>Recently auto-returned</h2><p>Restore a loan if a member needs more time.</p></div></div><div id="bw-admin-expired" class="bw-feature-grid"></div>';
 app.appendChild(adminPage);
 const style=document.createElement("style");
 style.textContent='.bw-feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:13px;margin:12px 0 28px}.bw-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:12px;margin:14px 0 28px}.bw-stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:17px}.bw-stat strong{display:block;font:700 1.8rem Georgia,serif;color:var(--green)}.bw-stat span{font-size:.84rem;color:var(--muted)}.bw-feature-card{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:15px;min-width:0}.bw-feature-card h3{font:700 1.05rem Georgia,serif;margin:0 0 5px}.bw-feature-card p{margin:5px 0}.bw-feature-card button{margin:7px 5px 0 0}.bw-reading-tools{max-width:680px}.bw-review-box{margin-top:20px;padding:18px;border:1px solid var(--line);border-radius:15px;background:var(--card)}.bw-review-list{display:grid;gap:8px;margin-top:12px}.bw-review{padding:14px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--card) 88%,var(--paper))}.bw-review-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.bw-review-actions button{display:inline-flex;align-items:center;justify-content:center;width:auto;max-width:100%;min-height:40px;margin:0;padding:9px 14px;font-size:.88rem;line-height:1.25;white-space:normal}.bw-detail-actions-extra{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.bw-inline-field{max-width:180px;display:inline-block;margin-right:8px}@media(max-width:600px){.bw-feature-grid{grid-template-columns:1fr 1fr}.bw-feature-card{padding:12px}.bw-feature-card button{width:100%;margin:7px 0 0}.bw-stat{padding:13px}}';
 document.head.appendChild(style);
}
function hidePages(){["page-discover","page-loans","page-settings","page-book-detail","page-requests","page-admin-requests","page-my-shelf","page-library-admin"].forEach(id=>$("#"+id)?.classList.add("hidden"));document.querySelectorAll("[data-page],[data-bw-route],[data-bw-feature]").forEach(x=>x.classList.remove("active"))}
async function openFeature(name){
 hidePages();
 const page=name==="admin"?"page-library-admin":"page-my-shelf";
 $("#"+page)?.classList.remove("hidden");
 document.querySelector('[data-bw-feature="'+name+'"]')?.classList.add("active");
 if(name==="admin")await loadAdmin();else await loadShelf();
 window.scrollTo({top:0,behavior:"smooth"});
}
function empty(text){return '<div class="empty">'+esc(text)+'</div>'}
async function loadShelf(){
 const targets=["#bw-reader-stats","#bw-due-alerts","#bw-wishlist","#bw-waitlist","#bw-recent","#bw-recommendations","#bw-bookmarks","#bw-notes","#bw-reading-history"];
 targets.forEach(s=>{if($(s))$(s).innerHTML=empty("Loading…")});
 try{
  const [stats,loans,wish,wait,recent,recs,bookmarks,notes,history]=await Promise.all([
   api("reader-stats"),api("loans"),api("wishlist"),api("waitlist"),api("recent-views"),api("recommendations"),api("reader-bookmarks"),api("reader-notes"),api("reading-history")
  ]);
  $("#bw-reader-stats").innerHTML=[["Books borrowed",stats.total_loans],["Currently borrowing",stats.active_loans],["Pages read",stats.pages_read],["Listening minutes",stats.listening_minutes],["Wishlist",stats.wishlist]].map(x=>'<div class="bw-stat"><strong>'+Number(x[1]||0).toLocaleString()+'</strong><span>'+x[0]+'</span></div>').join("");
  const active=loans.loans||[];
  $("#bw-tool-loan").innerHTML=active.length?active.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.item.title)+'</option>').join(""):'<option value="">No active loans</option>';
  const due=active.map(x=>{const days=Math.ceil((new Date(x.due_at)-Date.now())/86400000);return {...x,days}}).sort((a,b)=>a.days-b.days);
  $("#bw-due-alerts").innerHTML=due.length?due.map(x=>'<div class="bw-feature-card"><h3>'+esc(x.item.title)+'</h3><p class="small">'+(x.days<0?"Past due":x.days===0?"Due today": "Due in "+x.days+" day"+(x.days===1?"":"s"))+' · '+new Date(x.due_at).toLocaleDateString()+'</p></div>').join(""):empty("No active loans right now.");
  $("#bw-wishlist").innerHTML=(wish.items||[]).length?wish.items.map(x=>card(x,'<button class="secondary" data-wish-remove="'+esc(x.id)+'">Remove</button>')).join(""):empty("Your wishlist is empty. Open a book's details to save it here.");
  $("#bw-waitlist").innerHTML=(wait.items||[]).length?wait.items.map(x=>'<div class="bw-feature-card"><h3>'+esc(x.item?.title||"Book")+'</h3><p class="small">'+(x.status==="ready"?"A copy is ready for you. Borrow it from Discover.":"Waiting for a copy")+'</p><button class="secondary" data-wait-cancel="'+esc(x.id)+'">Leave waitlist</button></div>').join(""):empty("You are not on any waitlists.");
  $("#bw-recent").innerHTML=(recent.items||[]).length?recent.items.map(x=>card(x,'<span class="small">Viewed '+new Date(x.viewed_at).toLocaleDateString()+'</span>')).join(""):empty("Books you open will appear here.");
  $("#bw-recommendations").innerHTML=(recs.items||[]).length?recs.items.map(x=>card(x,'<span class="small">'+Number(x.total_copies||0)+' copies in catalogue</span>')).join(""):empty("Borrow a few books to get recommendations.");
  $("#bw-bookmarks").innerHTML=(bookmarks.entries||[]).length?(bookmarks.entries||[]).map(x=>'<div class="bw-feature-card"><h3>'+esc(x.label||"Bookmark")+'</h3><p>'+esc(x.location)+'</p><button class="secondary" data-bookmark-delete="'+esc(x.id)+'">Delete</button></div>').join(""):empty("No bookmarks saved yet.");
  $("#bw-notes").innerHTML=(notes.entries||[]).length?(notes.entries||[]).map(x=>'<div class="bw-feature-card"><p style="white-space:pre-wrap">'+esc(x.content)+'</p><span class="small">'+new Date(x.created_at).toLocaleDateString()+'</span><button class="secondary" data-note-delete="'+esc(x.id)+'">Delete</button></div>').join(""):empty("No reading notes yet.");
   $("#bw-reading-history").innerHTML=(history.history||[]).length?history.history.map(x=>'<div class="bw-feature-card"><h3>'+esc(x.item?.title||"Removed title")+'</h3><p class="small">'+esc(x.item?.author||"")+' · Returned '+new Date(x.returned_at).toLocaleDateString()+'</p><span class="small">Borrowed '+new Date(x.borrowed_at).toLocaleDateString()+'</span></div>').join(""):empty("Returned books will appear here.");
 }catch(e){$("#bw-reader-stats").innerHTML=empty(e.message)}
}
async function loadAdmin(){
 $("#bw-admin-stats").innerHTML=empty("Loading overview…");$("#bw-admin-loans").innerHTML=empty("Loading loans…");$("#bw-admin-expired").innerHTML=empty("Loading history…");
 try{
  const [stats,loans,expired,inventory]=await Promise.all([api("admin-analytics"),api("admin-loans"),api("admin-overdue-history"),api("admin-inventory")]);
  $("#bw-admin-stats").innerHTML=[["Active cards",stats.active_cards],["Catalogue titles",stats.catalogue_items],["Active loans",stats.active_loans],["Overdue",stats.overdue_loans],["Pending requests",stats.pending_requests],["Waitlist",stats.waitlist_entries]].map(x=>'<div class="bw-stat"><strong>'+Number(x[1]||0).toLocaleString()+'</strong><span>'+x[0]+'</span></div>').join("");
  $("#bw-admin-loans").innerHTML=(loans.loans||[]).length?loans.loans.map(x=>'<div class="bw-feature-card"><h3>'+esc(x.item?.title||"Book")+'</h3><p class="small">'+esc(x.member?.display_name||"Reader")+' · card ending '+esc(x.member?.card_suffix||"----")+'</p><p class="small">Due '+new Date(x.due_at).toLocaleDateString()+(new Date(x.due_at)<new Date()?" · OVERDUE":"")+'</p><label>Extend due date</label><select class="bw-inline-field" data-extend-days="'+esc(x.id)+'"><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select><button data-extend-loan="'+esc(x.id)+'">Extend</button></div>').join(""):empty("No active loans.");
  $("#bw-admin-inventory").innerHTML=(inventory.items||[]).length?inventory.items.map(x=>'<div class="bw-feature-card"><h3>'+esc(x.title)+'</h3><p class="small">'+esc(x.media_type==="graphic_novel"?"Graphic novel":x.media_type==="audiobook"?"Audiobook":"Book")+' · '+x.active_loans+' borrowed · '+x.available_copies+' available</p><label>Total copies</label><input type="number" min="1" max="10000" value="'+x.total_copies+'" data-inventory-copies="'+esc(x.id)+'"><button data-inventory-save="'+esc(x.id)+'">Save copies</button></div>').join(""):empty("No catalogue titles.");
   $("#bw-admin-expired").innerHTML=(expired.loans||[]).length?expired.loans.map(x=>'<div class="bw-feature-card"><h3>'+esc(x.item?.title||"Book")+'</h3><p class="small">'+esc(x.member?.display_name||"Reader")+' · card ending '+esc(x.member?.card_suffix||"----")+'</p><p class="small">Auto-returned '+new Date(x.returned_at).toLocaleDateString()+'</p><label>Restore for</label><select class="bw-inline-field" data-restore-days="'+esc(x.id)+'"><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select><button data-restore-expired="'+esc(x.id)+'">Restore loan</button></div>').join(""):empty("No recently auto-returned loans.");
 }catch(e){$("#bw-admin-stats").innerHTML=empty(e.message)}
}
document.addEventListener("click",async e=>{
 const feature=e.target.closest("[data-bw-feature]")?.dataset.bwFeature;
 if(feature){e.preventDefault();try{const me=await api("me");if(feature==="admin"&&me.role!=="admin")throw new Error("Administrator access required.");await openFeature(feature)}catch(err){toast(err.message,true)}return}
 const wish=e.target.closest("[data-wish-remove]");if(wish){try{await api("wishlist-remove",{item_id:wish.dataset.wishRemove});await loadShelf()}catch(err){toast(err.message,true)}return}
 const wait=e.target.closest("[data-wait-cancel]");if(wait){try{await api("waitlist-cancel",{waitlist_id:wait.dataset.waitCancel});await loadShelf()}catch(err){toast(err.message,true)}return}
 const bookmark=e.target.closest("[data-bookmark-delete]");if(bookmark){try{await api("bookmark-delete",{id:bookmark.dataset.bookmarkDelete});await loadShelf()}catch(err){toast(err.message,true)}return}
 const note=e.target.closest("[data-note-delete]");if(note){try{await api("note-delete",{id:note.dataset.noteDelete});await loadShelf()}catch(err){toast(err.message,true)}return}
 const reviewDelete=e.target.closest("[data-review-delete]");if(reviewDelete){if(!confirm("Delete your review for this title?"))return;try{await api("review-delete",{item_id:reviewDelete.dataset.reviewDelete});toast("Review deleted.");const current=window.bwCurrentDetailId;if(current)await loadReviews(current)}catch(err){toast(err.message,true)}return}
 const adminReviewDelete=e.target.closest("[data-admin-review-delete]");if(adminReviewDelete){if(!confirm("Permanently delete this review?"))return;try{await api("admin-review-delete",{review_id:adminReviewDelete.dataset.adminReviewDelete});toast("Review deleted.");const current=window.bwCurrentDetailId;if(current)await loadReviews(current)}catch(err){toast(err.message,true)}return}
  const inventorySave=e.target.closest("[data-inventory-save]");if(inventorySave){const id=inventorySave.dataset.inventorySave,value=Number(document.querySelector('[data-inventory-copies="'+id+'"]').value);inventorySave.disabled=true;try{await api("admin-update-copies",{item_id:id,total_copies:value});toast("Copy count updated.");await loadAdmin()}catch(err){toast(err.message,true);inventorySave.disabled=false}return}
  const restore=e.target.closest("[data-restore-expired]");if(restore){const id=restore.dataset.restoreExpired,days=$('[data-restore-days="'+id+'"]').value;restore.disabled=true;try{await api("admin-restore-loan",{loan_id:id,days:Number(days)});toast("Loan restored with a new due date.");await loadAdmin()}catch(err){toast(err.message,true);restore.disabled=false}return}
 const extend=e.target.closest("[data-extend-loan]");if(extend){const id=extend.dataset.extendLoan,days=$('[data-extend-days="'+id+'"]').value;extend.disabled=true;try{await api("admin-extend-loan",{loan_id:id,days:Number(days)});toast("Due date extended.");await loadAdmin()}catch(err){toast(err.message,true);extend.disabled=false}return}
});
document.addEventListener("click",e=>{
 const nav=e.target.closest("[data-page]");if(nav){$("#page-my-shelf")?.classList.add("hidden");$("#page-library-admin")?.classList.add("hidden")}
},true);
document.addEventListener("click",async e=>{
 const b=e.target.closest("[data-public-profile]");if(!b)return;
 try{const data=await api("public-reader-profile",{profile_id:b.dataset.publicProfile});const p=data.profile;let modal=document.getElementById("bw-public-profile-modal");if(!modal){modal=document.createElement("div");modal.id="bw-public-profile-modal";modal.className="modal";modal.innerHTML='<div class="modal-box"><button class="ghost" id="bw-public-profile-close">Close</button><div id="bw-public-profile-content"></div></div>';document.body.appendChild(modal);modal.addEventListener("click",ev=>{if(ev.target===modal||ev.target.closest("#bw-public-profile-close"))modal.remove()})}modal.querySelector("#bw-public-profile-content").innerHTML=(p.avatar_url?'<img src="'+esc(p.avatar_url)+'" alt="Profile picture" style="width:88px;height:88px;object-fit:cover;border-radius:50%">':'')+'<h2>'+esc(p.display_name)+'</h2><p>'+esc(p.bio||"")+'</p><p class="small">'+esc(p.favorite_genre||"")+'</p><p class="small">Member since '+new Date(p.member_since).toLocaleDateString()+'</p>'}catch(err){toast(err.message,true)}
});
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-book-detail]");if(!b)return;
 const itemId=b.dataset.bookDetail;
 window.bwCurrentDetailId=itemId;
 api("recent-view",{item_id:itemId}).catch(()=>{});
});
function enhanceDetails(){
 const host=$("#book-detail-content");if(!host||!host.innerHTML)return;
 const title=host.querySelector("h1");if(!title)return;
 const id=window.bwCurrentDetailId;if(!id||(host.dataset.bwEnhancedFor===id&&host.querySelector(".bw-review-box")))return;
 host.dataset.bwEnhancedFor=id;
 const actions=document.createElement("div");actions.className="bw-detail-actions-extra";
 actions.innerHTML='<button class="secondary" id="bw-detail-wishlist">Add to wishlist</button><button class="ghost" id="bw-detail-waitlist">Join waitlist</button>';
 const review=document.createElement("section");review.className="bw-review-box";
 review.innerHTML='<h3>Reader reviews</h3><div id="bw-review-summary" class="small">Loading reviews…</div><label>Your rating</label><select id="bw-review-rating"><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select><label>Your review (optional)</label><textarea id="bw-review-text" rows="3" maxlength="1000" placeholder="What did you think?"></textarea><button id="bw-review-save">Save review</button><div id="bw-review-list" class="bw-review-list"></div>';
 host.querySelector(".detail-actions")?.append(actions);host.appendChild(review);
 $("#bw-detail-wishlist").onclick=async()=>{try{await api("wishlist-add",{item_id:id});toast("Added to your wishlist.")}catch(e){toast(e.message,true)}};
 $("#bw-detail-waitlist").onclick=async()=>{try{await api("waitlist-join",{item_id:id});toast("You joined the waitlist.");}catch(e){toast(e.message,true)}};
 $("#bw-review-save").onclick=async()=>{const btn=$("#bw-review-save");btn.disabled=true;try{await api("review-save",{item_id:id,rating:Number($("#bw-review-rating").value),review:$("#bw-review-text").value});toast("Review saved.");await loadReviews(id)}catch(e){toast(e.message,true)}btn.disabled=false};
 loadReviews(id);
}
async function loadReviews(id){
 try{
  const data=await api("reviews",{item_id:id});
  $("#bw-review-summary").textContent=data.count?data.average.toFixed(1)+" / 5 · "+data.count+" review"+(data.count===1?"":"s"):"No reviews yet.";
  const isAdmin=data.can_delete_reviews===true;
  $("#bw-review-list").innerHTML=(data.reviews||[]).map(x=>'<div class="bw-review"><strong>'+x.rating+'/5</strong> '+(x.is_mine?'<span class="tag">Your review</span>':'')+'<p style="white-space:pre-wrap">'+esc(x.review||"No written review.")+'</p>'+(x.profile_id?'<button class="ghost" data-public-profile="'+esc(x.profile_id)+'">View reader profile</button>':'<span class="small">'+esc(x.author_name||"Reader")+'</span>')+((x.is_mine||isAdmin)?'<div class="bw-review-actions">'+(x.is_mine?'<button class="danger" data-review-delete="'+esc(id)+'">Delete my review</button>':'')+(isAdmin?'<button class="danger" data-admin-review-delete="'+esc(x.id)+'">Delete review (admin)</button>':'')+'</div>':'')+'</div>').join("");
  const mine=(data.reviews||[]).find(x=>x.is_mine);if(mine){$("#bw-review-rating").value=mine.rating;$("#bw-review-text").value=mine.review||""}
 }catch(e){$("#bw-review-summary").textContent=e.message}
}
function init(){
 ensure();
 const nav=$("#navlinks");if(nav)nav.addEventListener("click",e=>{const target=e.target.closest("button");if(target){document.querySelectorAll("#navlinks button").forEach(x=>x.classList.remove("active"));target.classList.add("active");requestAnimationFrame(()=>target.blur())}if(e.target.closest("[data-page]")){$("#page-my-shelf")?.classList.add("hidden");$("#page-library-admin")?.classList.add("hidden")}});
 $("#bw-shelf-refresh")?.addEventListener("click",loadShelf);
 $("#bw-admin-feature-refresh")?.addEventListener("click",loadAdmin);
 $("#bw-bookmark-add")?.addEventListener("click",async()=>{try{const loanId=$("#bw-tool-loan").value;if(!loanId)throw new Error("Choose an active loan.");await api("bookmark-add",{loan_id:loanId,location:$("#bw-bookmark-location").value,label:$("#bw-bookmark-label").value});$("#bw-bookmark-location").value="";$("#bw-bookmark-label").value="";toast("Bookmark saved.");await loadShelf()}catch(e){toast(e.message,true)}});
 $("#bw-note-add")?.addEventListener("click",async()=>{try{const loanId=$("#bw-tool-loan").value;if(!loanId)throw new Error("Choose an active loan.");await api("note-add",{loan_id:loanId,content:$("#bw-note-content").value});$("#bw-note-content").value="";toast("Note saved.");await loadShelf()}catch(e){toast(e.message,true)}});
 const observer=new MutationObserver(()=>{if(!$("#app-view")?.classList.contains("hidden")){api("me").then(me=>$("#navlinks [data-bw-feature='admin']")?.classList.toggle("hidden",me.role!=="admin")).catch(()=>{});}});
 if($("#app-view"))observer.observe($("#app-view"),{attributes:true,attributeFilter:["class"]});
 const detailObserver=new MutationObserver(()=>enhanceDetails());if($("#app-view"))detailObserver.observe($("#app-view"),{subtree:true,childList:true});
 nav?.addEventListener("click",e=>{const route=e.target.closest("[data-bw-route]");if(route){$("#page-my-shelf")?.classList.add("hidden");$("#page-library-admin")?.classList.add("hidden")}});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
window.addEventListener("bw-detail-open",e=>{window.bwCurrentDetailId=e.detail?.id;});
})();
