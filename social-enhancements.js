/* BookWriters social/discovery enhancements. Requires feature-migration.sql to be applied in Supabase. */
(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const db=window.supabase?.createClient('https://ysomxdoicbfmgbveghkr.supabase.co','sb_publishable_1VtpTU1pGn9yLn6Q_POtsw_Kp5ULXv6');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let activeId=null, busy=false;
  const toast=(m,bad=false)=>{let n=$('#bw-toast');if(!n){n=document.createElement('div');n.id='bw-toast';n.className='notice';n.style.cssText='position:fixed;right:16px;bottom:16px;z-index:200;max-width:min(440px,calc(100vw - 32px));box-shadow:0 8px 30px #0003';document.body.appendChild(n)}n.className='notice'+(bad?' error':'');n.textContent=m;clearTimeout(n._t);n._t=setTimeout(()=>n.remove(),4500)};
  async function user(){const {data}=await db.auth.getUser();return data.user}
  async function currentBook(){
    const title=$('#book-detail .page-title')?.textContent?.trim();if(!title)return null;
    const {data,error}=await db.from('books').select('id,title,owner_id,cover_url').eq('title',title).limit(1).maybeSingle();
    if(error||!data)return null;activeId=data.id;$('#book-detail').dataset.bookId=data.id;return data;
  }
  async function toggle(table,where,insert){
    const u=await user();if(!u){toast('Sign in to use this feature.');return}
    const {data,error}=await db.from(table).select('*').match(where).maybeSingle();
    if(error){toast('Run feature-migration.sql in Supabase first. '+error.message,true);return}
    const result=data?await db.from(table).delete().match(where):await db.from(table).insert(insert);
    if(result.error){toast(result.error.message,true);return}
    return !data;
  }
  async function installBookActions(){
    const detail=$('#book-detail'),title=$('.page-title',detail)?.textContent?.trim();if(!title)return;
    const book=await currentBook();if(!book)return;
    const bar=$('.bw-tools',detail);if(!bar)return;
    if(bar.dataset.socialReady===book.id)return;
    bar.dataset.socialReady=book.id;
    const extra=document.createElement('span');extra.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    extra.innerHTML='<button class="ghost" data-bw-like>Like</button><button class="ghost" data-bw-bookmark>Bookmark</button><button class="ghost" data-bw-follow>Follow author</button><button class="ghost" data-bw-cover>Set cover image</button>';
    bar.appendChild(extra);
    const u=await user();
    if(u){
      const [like,mark,follow]=await Promise.all([
        db.from('book_likes').select('book_id').eq('book_id',book.id).eq('user_id',u.id).maybeSingle(),
        db.from('bookmarks').select('book_id').eq('book_id',book.id).eq('user_id',u.id).maybeSingle(),
        db.from('writer_follows').select('followed_id').eq('follower_id',u.id).eq('followed_id',book.owner_id).maybeSingle()
      ]);
      extra.querySelector('[data-bw-like]').textContent=like.data?'Unlike':'Like';
      extra.querySelector('[data-bw-bookmark]').textContent=mark.data?'Remove bookmark':'Bookmark';
      extra.querySelector('[data-bw-follow]').textContent=follow.data?'Unfollow author':'Follow author';
    }
    extra.querySelector('[data-bw-like]').onclick=async()=>{const u=await user();if(!u){toast('Sign in to like books.');return}const v=await toggle('book_likes',{book_id:book.id,user_id:u.id},{book_id:book.id,user_id:u.id});if(v!==undefined)extra.querySelector('[data-bw-like]').textContent=v?'Unlike':'Like'};
    extra.querySelector('[data-bw-bookmark]').onclick=async()=>{const u=await user();if(!u){toast('Sign in to bookmark books.');return}const v=await toggle('bookmarks',{book_id:book.id,user_id:u.id},{book_id:book.id,user_id:u.id});if(v!==undefined)extra.querySelector('[data-bw-bookmark]').textContent=v?'Remove bookmark':'Bookmark'};
    extra.querySelector('[data-bw-follow]').onclick=async()=>{const u=await user();if(!u){toast('Sign in to follow writers.');return}if(u.id===book.owner_id){toast('You cannot follow yourself.');return}const v=await toggle('writer_follows',{follower_id:u.id,followed_id:book.owner_id},{follower_id:u.id,followed_id:book.owner_id});if(v!==undefined)extra.querySelector('[data-bw-follow]').textContent=v?'Unfollow author':'Follow author'};
    extra.querySelector('[data-bw-cover]').onclick=async()=>{const u=await user();if(!u){toast('Sign in to manage your book cover.');return}const {data:owned}=await db.from('books').select('owner_id').eq('id',book.id).single();if(owned?.owner_id!==u.id){toast('Only the book owner can change the cover.');return}const url=prompt('Paste a public image URL for this book cover (leave blank to remove it):',book.cover_url||'');if(url===null)return;if(url.trim()&&!/^https:\/\//i.test(url.trim())){toast('Please use an https:// image URL.',true);return}const {error}=await db.from('books').update({cover_url:url.trim()||null}).eq('id',book.id).eq('owner_id',u.id);if(error)toast(error.message,true);else{toast('Cover image saved.');location.reload()}};
  }
  function installWriterSearch(){
    const discover=$('#page-discover');if(!discover||$('#bw-writer-search'))return;
    const panel=document.createElement('section');panel.className='panel';panel.style.marginTop='28px';panel.innerHTML='<div class="section-head" style="margin-top:0"><div><h2 style="font:700 1.8rem Georgia,serif;margin:0">Find writers</h2><p>Search pen names and bios to find your next collaborator.</p></div></div><div class="toolbar"><input id="bw-writer-search" placeholder="Search usernames, names, and bios…" aria-label="Search writers"><button id="bw-search-writers">Search writers</button></div><div id="bw-writer-results" class="grid"></div>';
    discover.appendChild(panel);
    const search=async()=>{const q=$('#bw-writer-search').value.trim();const out=$('#bw-writer-results');if(q.length<2){out.innerHTML='<div class="empty">Enter at least 2 characters to search.</div>';return}out.innerHTML='<div class="loading">Searching writers…</div>';const {data,error}=await db.from('profiles').select('id,username,display_name,bio').or('username.ilike.%'+q+'%,display_name.ilike.%'+q+'%,bio.ilike.%'+q+'%').limit(20);if(error){out.innerHTML='<div class="empty">'+esc(error.message)+'</div>';return}out.innerHTML=(data||[]).map(p=>'<article class="book"><div class="bw-cover-placeholder">'+esc((p.display_name||p.username||'W').slice(0,1).toUpperCase())+'</div><h3>'+esc(p.display_name||p.username||'Writer')+'</h3><p>@'+esc(p.username||'writer')+'<br>'+esc(p.bio||'No bio yet.')+'</p><div class="book-foot"><span class="author">BookWriters author</span><button class="secondary" data-follow-writer="'+esc(p.id)+'">Follow</button></div></article>').join('')||'<div class="empty">No writers found.</div>';$$('[data-follow-writer]',out).forEach(b=>b.onclick=async()=>{const u=await user();if(!u){toast('Sign in to follow writers.');return}if(u.id===b.dataset.followWriter){toast('You cannot follow yourself.');return}const v=await toggle('writer_follows',{follower_id:u.id,followed_id:b.dataset.followWriter},{follower_id:u.id,followed_id:b.dataset.followWriter});if(v!==undefined)b.textContent=v?'Following':'Follow'});};
    $('#bw-search-writers').onclick=search;$('#bw-writer-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search()}});
  }
  function decorateCovers(){
    $$('.book').forEach(async card=>{if(card.dataset.bwCoverDone)return;const title=$('h3',card)?.textContent?.trim();if(!title)return;card.dataset.bwCoverDone='1';const {data}=await db.from('books').select('cover_url').eq('title',title).limit(1).maybeSingle();if(data?.cover_url){const im=document.createElement('img');im.className='bw-cover';im.src=data.cover_url;im.alt='Cover for '+title;im.loading='lazy';im.onerror=()=>im.remove();const placeholder=$('.bw-cover-placeholder',card);if(placeholder)placeholder.replaceWith(im);else card.insertBefore(im,card.firstChild)}});
  }
  function start(){
    if(!db)return;
    installWriterSearch();
    const obs=new MutationObserver(()=>{installWriterSearch();decorateCovers();if($('.bw-tools'))installBookActions().catch(()=>{})});
    obs.observe(document.body,{childList:true,subtree:true});
    setInterval(()=>{installWriterSearch();decorateCovers();if($('.bw-tools'))installBookActions().catch(()=>{})},1600);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();