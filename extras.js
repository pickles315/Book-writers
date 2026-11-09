(() => {
"use strict";
const API="https://ysomxdoicbfmgbveghkr.supabase.co/functions/v1/library-api";
const KEY="sb_publishable_1VtpTU1pGn9yLn6Q_POtsw_Kp5ULXv6";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const token=()=>localStorage.getItem("bw-library-token")||sessionStorage.getItem("bw-library-token")||"";
async function api(action,data={}) {
 const t=token(),r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","apikey":KEY,...(t?{Authorization:"Bearer "+t}:{})},body:JSON.stringify({action,...data})});
 const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||"Request failed.");return b;
}
function toast(m,bad=false){let n=$("#bw-extras-toast");if(!n){n=document.createElement("div");n.id="bw-extras-toast";n.className="notice";document.body.appendChild(n)}n.textContent=m;n.classList.toggle("error",bad);clearTimeout(n._timer);n._timer=setTimeout(()=>n.remove(),4000)}
function card(html){return '<article class="bw-feature-card">'+html+'</article>'}
function addUI(){
 const shelf=$("#page-my-shelf"),admin=$("#page-library-admin");
 if(shelf&&!$("#bw-goal-status")){
  const extra=document.createElement("div");extra.id="bw-extras-reader";
  extra.innerHTML=
   '<div class="section-head"><div><h2>Reading goal</h2><p>Set a yearly target and track books you return.</p></div></div><section class="panel"><div id="bw-goal-status" class="small">Loading goal…</div><label for="bw-goal-target">Books to finish this year</label><input id="bw-goal-target" type="number" min="1" max="500" value="12"><button id="bw-goal-save">Save goal</button></section>'+
   '<div class="section-head"><div><h2>Achievements</h2><p>Milestones from your reading activity.</p></div></div><div id="bw-achievements" class="bw-feature-grid"></div>'+
   '<div class="section-head"><div><h2>My collections</h2><p>Your own shelves for books you want to group together.</p></div></div><section class="panel"><label for="bw-collection-name">New collection</label><input id="bw-collection-name" maxlength="60" placeholder="Favorites, To read, Finished…"><button id="bw-collection-create">Create collection</button></section><div id="bw-collections" class="bw-feature-grid"></div>'+
   '<div class="section-head"><div><h2>Library updates</h2><p>Announcements from the library.</p></div></div><div id="bw-announcements" class="bw-feature-grid"></div>'+
   '<div class="section-head"><div><h2>Notifications</h2><p>Updates about requests, waitlists, and announcements.</p></div></div><div id="bw-notifications" class="bw-feature-grid"></div>'+
   '<div class="section-head"><div><h2>What’s new</h2><p>New features and improvements to BookWriters.</p></div></div><div id="bw-whats-new" class="bw-feature-grid"></div>'+
   '<div class="section-head"><div><h2>Reader profile</h2><p>Private details for your library card.</p></div></div><section class="panel"><label for="bw-profile-name">Display name</label><input id="bw-profile-name" maxlength="60"><label for="bw-profile-bio">About me</label><textarea id="bw-profile-bio" rows="3" maxlength="240" placeholder="A little about your reading interests…"></textarea><label for="bw-profile-genre">Favorite genre</label><input id="bw-profile-genre" maxlength="60" placeholder="Fantasy, mystery, history…"><div id="bw-profile-since" class="small"></div><button id="bw-profile-save">Save profile</button></section>';
  shelf.appendChild(extra);
 }
 if(admin&&!$("#bw-announcement-title")){
  const extra=document.createElement("div");extra.id="bw-extras-admin";
  extra.innerHTML='<div class="section-head"><div><h2>What’s new</h2><p>Publish app updates and feature announcements.</p></div></div><section class="panel"><label for="bw-changelog-title">Update title</label><input id="bw-changelog-title" maxlength="120" placeholder="Reading history added"><label for="bw-changelog-message">What changed?</label><textarea id="bw-changelog-message" rows="3" maxlength="2000" placeholder="Describe the update…"></textarea><button id="bw-changelog-publish">Publish update</button></section><div id="bw-admin-changelog" class="bw-feature-grid"></div>'+
   '<div class="section-head"><div><h2>Library announcements</h2><p>Post updates that readers will see in their app.</p></div></div><section class="panel"><label for="bw-announcement-title">Announcement title</label><input id="bw-announcement-title" maxlength="120" placeholder="New books added"><label for="bw-announcement-message">Message</label><textarea id="bw-announcement-message" rows="3" maxlength="1500" placeholder="Write an update for readers…"></textarea><button id="bw-announcement-publish">Publish announcement</button></section><div id="bw-admin-announcements" class="bw-feature-grid"></div>';
  admin.appendChild(extra);
 }
 if(!$("#bw-extras-style")){
  const s=document.createElement("style");s.id="bw-extras-style";s.textContent='.bw-achievement{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--card)}.bw-achievement.unlocked{border-color:var(--green);background:var(--green-soft)}.bw-achievement strong{display:block}.bw-notice-unread{border-left:4px solid var(--green)}.bw-collection-books{font-size:.85rem;color:var(--muted);margin-top:8px}#bw-extras-reader,#bw-extras-admin{margin-top:28px}#bw-detail-collection{max-width:220px}';document.head.appendChild(s);
 }
}
async function loadExtras(){
 addUI();
 try{
  const [goal,collections,announcements,notifications,profile,stats,whatsNew]=await Promise.all([
   api("reading-goal"),api("collections"),api("announcements"),api("notifications"),api("reader-profile"),api("reader-stats"),api("whats-new")
  ]);
  const pct=Math.min(100,Math.round(goal.finished_books/Math.max(1,goal.target_books)*100));
  $("#bw-goal-target").value=goal.target_books;
  $("#bw-goal-status").innerHTML='<strong>'+goal.finished_books+' of '+goal.target_books+' books finished</strong><div style="height:10px;background:var(--line);border-radius:99px;overflow:hidden;margin:9px 0"><div style="height:100%;width:'+pct+'%;background:var(--green);border-radius:99px"></div></div><span>'+pct+'% of your '+goal.year+' goal</span>';
  const achievements=[
   ["First checkout","Borrow your first book",stats.total_loans>=1],
   ["Regular reader","Borrow 5 books",stats.total_loans>=5],
   ["Library regular","Borrow 20 books",stats.total_loans>=20],
   ["Page turner","Read 100 pages",stats.pages_read>=100],
   ["Reading marathon","Read 1,000 pages",stats.pages_read>=1000],
   ["Audio explorer","Listen for 60 minutes",stats.listening_minutes>=60],
   ["Wishful thinker","Save 5 books to your wishlist",stats.wishlist>=5]
  ];
  $("#bw-achievements").innerHTML=achievements.map(x=>'<div class="bw-achievement '+(x[2]?"unlocked":"")+'"><strong>'+(x[2]?"✓ ":"🔒 ")+esc(x[0])+'</strong><span class="small">'+esc(x[1])+'</span></div>').join("");
  $("#bw-collections").innerHTML=(collections.collections||[]).length?collections.collections.map(c=>card('<h3>'+esc(c.name)+'</h3><div class="bw-collection-books">'+(c.items||[]).map(x=>esc(x.item.title)).join(" · ")+'</div><button class="danger" data-extra-collection-delete="'+esc(c.id)+'">Delete collection</button>'+(c.items||[]).map(x=>'<button class="ghost" data-extra-collection-remove="'+esc(c.id)+'" data-extra-item="'+esc(x.item_id)+'">Remove '+esc(x.item.title)+'</button>').join(""))).join(""):'<div class="empty">You have not made any collections yet.</div>';
  $("#bw-announcements").innerHTML=(announcements.announcements||[]).length?announcements.announcements.map(a=>card('<h3>'+esc(a.title)+'</h3><p style="white-space:pre-wrap">'+esc(a.message)+'</p><span class="small">'+new Date(a.created_at).toLocaleString()+'</span>')).join(""):'<div class="empty">No library announcements yet.</div>';
  $("#bw-notifications").innerHTML=(notifications.notifications||[]).length?notifications.notifications.map(n=>card('<h3>'+esc(n.title)+'</h3><p>'+esc(n.message)+'</p><span class="small">'+new Date(n.created_at).toLocaleString()+'</span>'+(!n.read_at?'<button class="secondary" data-extra-notice-read="'+esc(n.id)+'">Mark as read</button>':'<span class="tag">Read</span>')).replace('bw-feature-card','bw-feature-card '+(!n.read_at?'bw-notice-unread':''))).join(""):'<div class="empty">You are all caught up.</div>';
  $("#bw-whats-new").innerHTML=(whatsNew.entries||[]).length?whatsNew.entries.map(x=>card('<h3>'+esc(x.title)+'</h3><p style="white-space:pre-wrap">'+esc(x.message)+'</p><span class="small">'+new Date(x.created_at).toLocaleDateString()+'</span>')).join(""):'<div class="empty">No updates have been posted yet.</div>';
  $("#bw-profile-name").value=profile.profile.display_name||"";
  $("#bw-profile-bio").value=profile.profile.bio||"";
  $("#bw-profile-genre").value=profile.profile.favorite_genre||"";
  $("#bw-profile-since").textContent=profile.profile.member_since?"Member since "+new Date(profile.profile.member_since).toLocaleDateString()+" · card ending "+profile.profile.card_suffix:"";
 }catch(e){toast(e.message,true)}
}
async function loadAdminAnnouncements(){
 addUI();
 try{
  const [{announcements=[]},{entries=[]}]=await Promise.all([api("announcements"),api("whats-new")]);
  $("#bw-admin-announcements").innerHTML=announcements.length?announcements.map(a=>card('<h3>'+esc(a.title)+'</h3><p>'+esc(a.message)+'</p><button class="danger" data-extra-announcement-delete="'+esc(a.id)+'">Delete</button>')).join(""):'<div class="empty">No announcements have been posted.</div>';
  $("#bw-admin-changelog").innerHTML=entries.length?entries.map(x=>card('<h3>'+esc(x.title)+'</h3><p>'+esc(x.message)+'</p><span class="small">'+new Date(x.created_at).toLocaleDateString()+'</span><button class="danger" data-changelog-delete="'+esc(x.id)+'">Delete update</button>')).join(""):'<div class="empty">No updates have been published.</div>';
 }catch(e){$("#bw-admin-announcements").innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function attachCollectionTools(){
 const host=$("#book-detail-content"),actions=host?.querySelector(".detail-actions");
 if(!host||!actions||!host.querySelector("h1")||host.querySelector("#bw-extra-collection"))return;
 const wrap=document.createElement("div");wrap.className="bw-detail-actions-extra";wrap.innerHTML='<select id="bw-detail-collection"><option value="">Choose a collection</option></select><button type="button" class="ghost" id="bw-extra-collection">Add to collection</button>';
 actions.insertAdjacentElement("afterend",wrap);
 api("collections").then(data=>{$("#bw-detail-collection").innerHTML='<option value="">Choose a collection</option>'+(data.collections||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join("")}).catch(()=>{});
 $("#bw-extra-collection").onclick=async()=>{try{const collectionId=$("#bw-detail-collection").value,itemId=window.bwCurrentDetailId;if(!collectionId)throw new Error("Create or choose a collection first.");if(!itemId)throw new Error("Open a book first.");await api("collection-add",{collection_id:collectionId,item_id:itemId});toast("Added to collection.")}catch(e){toast(e.message,true)}};
}
function init(){
 addUI();
 document.addEventListener("click",async e=>{
  if(e.target.closest('[data-bw-feature="shelf"]')){setTimeout(loadExtras,0);return}
  if(e.target.closest('[data-bw-feature="admin"]')){setTimeout(loadAdminAnnouncements,0);return}
  const goal=e.target.closest("#bw-goal-save");if(goal){goal.disabled=true;try{await api("reading-goal",{target_books:Number($("#bw-goal-target").value)});toast("Reading goal saved.");await loadExtras()}catch(err){toast(err.message,true)}goal.disabled=false;return}
  const create=e.target.closest("#bw-collection-create");if(create){try{await api("collection-create",{name:$("#bw-collection-name").value});$("#bw-collection-name").value="";toast("Collection created.");await loadExtras()}catch(err){toast(err.message,true)}return}
  const del=e.target.closest("[data-extra-collection-delete]");if(del){try{await api("collection-delete",{collection_id:del.dataset.extraCollectionDelete});await loadExtras()}catch(err){toast(err.message,true)}return}
  const rem=e.target.closest("[data-extra-collection-remove]");if(rem){try{await api("collection-remove",{collection_id:rem.dataset.extraCollectionRemove,item_id:rem.dataset.extraItem});await loadExtras()}catch(err){toast(err.message,true)}return}
  const read=e.target.closest("[data-extra-notice-read]");if(read){try{await api("notification-read",{notification_id:read.dataset.extraNoticeRead});await loadExtras()}catch(err){toast(err.message,true)}return}
  const save=e.target.closest("#bw-profile-save");if(save){save.disabled=true;try{await api("reader-profile",{display_name:$("#bw-profile-name").value,bio:$("#bw-profile-bio").value,favorite_genre:$("#bw-profile-genre").value});toast("Profile saved.");await loadExtras()}catch(err){toast(err.message,true)}save.disabled=false;return}
  const changelog=e.target.closest("#bw-changelog-publish");if(changelog){changelog.disabled=true;try{await api("admin-whats-new-create",{title:$("#bw-changelog-title").value,message:$("#bw-changelog-message").value});$("#bw-changelog-title").value="";$("#bw-changelog-message").value="";toast("What’s new update published.");await loadAdminAnnouncements()}catch(err){toast(err.message,true)}changelog.disabled=false;return}
  const changelogDelete=e.target.closest("[data-changelog-delete]");if(changelogDelete){if(!confirm("Delete this update from What’s new?"))return;try{await api("admin-whats-new-delete",{entry_id:changelogDelete.dataset.changelogDelete});await loadAdminAnnouncements()}catch(err){toast(err.message,true)}return}
  const publish=e.target.closest("#bw-announcement-publish");if(publish){publish.disabled=true;try{await api("admin-announcement-create",{title:$("#bw-announcement-title").value,message:$("#bw-announcement-message").value});$("#bw-announcement-title").value="";$("#bw-announcement-message").value="";toast("Announcement published.");await loadAdminAnnouncements()}catch(err){toast(err.message,true)}publish.disabled=false;return}
  const remove=e.target.closest("[data-extra-announcement-delete]");if(remove){try{await api("admin-announcement-delete",{announcement_id:remove.dataset.extraAnnouncementDelete});await loadAdminAnnouncements()}catch(err){toast(err.message,true)}return}
 });
 const observer=new MutationObserver(attachCollectionTools);
 const app=$("#app-view");if(app)observer.observe(app,{subtree:true,childList:true});
 attachCollectionTools();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();