/* BookWriters enhancements: progressive UI features and export tools. */
(() => {
  'use strict';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const supaUrl = 'https://ysomxdoicbfmgbveghkr.supabase.co';
  const supaKey = 'sb_publishable_1VtpTU1pGn9yLn6Q_POtsw_Kp5ULXv6';
  const db = window.supabase?.createClient(supaUrl, supaKey);
  let lastBookId = null;

  const css = document.createElement('style');
  css.textContent = `
    :root[data-theme="dark"]{color-scheme:dark;--ink:#edf0e9;--muted:#a8b1a7;--paper:#171b18;--card:#222923;--line:#39443b;--green:#8fc5a0;--green2:#283d30;--gold:#e7b86b;--red:#ffaaa0}
    :root[data-theme="dark"] input,:root[data-theme="dark"] textarea,:root[data-theme="dark"] select{background:#1b211c;color:var(--ink)}
    :root[data-theme="dark"] .hero-side{background:#242c25}:root[data-theme="dark"] .chat-box{background:#1b211c}
    :root[data-theme="dark"] .message{background:#252d27;color:var(--ink)}
    .bw-tools{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}
    .bw-tools button{font-size:.9rem}
    .bw-counter{font-size:.82rem;color:var(--muted);margin:5px 0 12px}
    .bw-cover{width:100%;height:118px;object-fit:cover;border-radius:10px;margin-bottom:12px;background:linear-gradient(135deg,var(--green2),var(--paper))}
    .bw-cover-placeholder{height:72px;display:grid;place-items:center;font:700 2rem Georgia,serif;color:var(--green);background:var(--green2);border-radius:10px;margin-bottom:12px}
    .bw-editor-fullscreen{position:fixed!important;inset:12px!important;z-index:100!important;background:var(--paper);padding:16px!important;overflow:auto;box-shadow:0 0 0 9999px #0009}
    .bw-editor-fullscreen textarea{min-height:65vh!important}
    @media print{.top,.footer,.bw-tools,button,aside{display:none!important}.wrap{max-width:none;padding:0}.reader{font-size:12pt}}
  `;
  document.head.appendChild(css);

  function toast(msg, bad=false) {
    let n=$('#bw-toast');
    if(!n){n=document.createElement('div');n.id='bw-toast';n.className='notice';n.style.cssText='position:fixed;right:16px;bottom:16px;z-index:200;max-width:min(440px,calc(100vw - 32px));box-shadow:0 8px 30px #0003';document.body.appendChild(n);}
    n.className='notice'+(bad?' error':'');n.textContent=msg;
    clearTimeout(n._timer);n._timer=setTimeout(()=>n.remove(),5000);
  }
  function download(name, blob) {
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }
  function slug(s){return String(s||'book').normalize('NFKD').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'book';}
  function xml(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
  function htmlToText(s){const d=document.createElement('div');d.innerHTML=String(s||'').replace(/\n/g,'<br>');return d.textContent||d.innerText||'';}

  async function getBookData(bookId) {
    if(!db)throw new Error('Database client is unavailable.');
    const {data:book,error}=await db.from('books').select('id,title,description,genre,owner_id,is_published,cover_url').eq('id',bookId).single();
    if(error)throw error;
    const {data:chapters,error:ce}=await db.from('chapters').select('id,title,content,chapter_order').eq('book_id',bookId).order('chapter_order',{ascending:true});
    if(ce)throw ce;
    const {data:author}=await db.from('profiles').select('display_name,username').eq('id',book.owner_id).maybeSingle();
    return {book,chapters:chapters||[],author:author?.display_name||author?.username||'BookWriters author'};
  }
  async function exportTxt(id) {
    const {book,chapters,author}=await getBookData(id);
    const body=[book.title, 'By '+author, '', book.description||'', '', ...chapters.flatMap((c,i)=>['CHAPTER '+(i+1)+': '+c.title,'',htmlToText(c.content),''])].join('\n');
    download(slug(book.title)+'.txt',new Blob([body],{type:'text/plain;charset=utf-8'}));
    toast('TXT export is ready.');
  }
  async function exportEpub(id) {
    if(!window.JSZip)throw new Error('EPUB exporter did not load. Refresh and try again.');
    const {book,chapters,author}=await getBookData(id);
    const zip=new JSZip();
    zip.file('mimetype','application/epub+zip',{compression:'STORE'});
    zip.folder('META-INF').file('container.xml','<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const o=zip.folder('OEBPS');
    const ids=[];
    const xhtml=(title,content)=>'<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+xml(title)+'</title><style>body{font-family:serif;line-height:1.6;margin:5%}h1{text-align:center;margin-top:20%}p{white-space:pre-wrap}</style></head><body>'+content+'</body></html>';
    o.file('title.xhtml',xhtml(book.title,'<h1>'+xml(book.title)+'</h1><p style="text-align:center">By '+xml(author)+'</p><p>'+xml(book.description||'')+'</p>'));
    ids.push('<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>');
    const spine=['<itemref idref="title"/>'];
    chapters.forEach((c,i)=>{
      const fn='chapter-'+(i+1)+'.xhtml',id='ch'+(i+1);
      const paragraphs=xml(c.content||'').split(/\r?\n/).map(line=>'<p>'+line+'</p>').join('');
      o.file(fn,xhtml(c.title,'<h1>'+xml(c.title)+'</h1>'+paragraphs));
      ids.push('<item id="'+id+'" href="'+fn+'" media-type="application/xhtml+xml"/>');spine.push('<itemref idref="'+id+'"/>');
    });
    const uid='urn:uuid:'+crypto.randomUUID();
    o.file('content.opf','<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:identifier id="bookid">'+uid+'</dc:identifier><dc:title>'+xml(book.title)+'</dc:title><dc:creator>'+xml(author)+'</dc:creator><dc:language>en</dc:language><dc:description>'+xml(book.description||'')+'</dc:description><meta property="dcterms:modified">'+new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+'</meta></metadata><manifest>'+ids.join('')+'</manifest><spine>'+spine.join('')+'</spine></package>');
    const blob=await zip.generateAsync({type:'blob',mimeType:'application/epub+zip'});
    download(slug(book.title)+'.epub',blob);toast('EPUB export is ready.');
  }
  function addBookTools() {
    const detail=$('#book-detail');
    if(!detail||detail.classList.contains('loading'))return;
    const openButton=$('[data-open-book]',detail);
    const title=$('.page-title',detail)?.textContent?.trim();
    if(!title)return;
    const inferredId=detail.dataset.bookId||null;
    if(inferredId)activeId=inferredId;
    if(!detail.querySelector('.bw-tools')){
      const tools=document.createElement('div');tools.className='bw-tools';
      tools.innerHTML='<button type="button" class="secondary" data-bw-export="txt">Export TXT</button><button type="button" class="secondary" data-bw-export="epub">Export EPUB</button><button type="button" class="ghost" data-bw-print>Print / Save PDF</button>';
      const head=$('.section-head',detail);if(head)head.insertAdjacentElement('afterend',tools);else detail.prepend(tools);
      tools.querySelector('[data-bw-export="txt"]').onclick=()=>runExport('txt');
      tools.querySelector('[data-bw-export="epub"]').onclick=()=>runExport('epub');
      tools.querySelector('[data-bw-print]').onclick=()=>runPrint();
    }
    // Add lightweight word count and fullscreen writing tools to the existing chapter editor modal.
    const textarea=$('#modal-form textarea[name="content"]');
    if(textarea&&!textarea.dataset.bwEnhanced){
      textarea.dataset.bwEnhanced='1';
      const counter=document.createElement('div');counter.className='bw-counter';textarea.insertAdjacentElement('afterend',counter);
      const update=()=>{const text=textarea.value.trim();const words=text?text.split(/\s+/).length:0;counter.textContent=words+' words · '+textarea.value.length+' characters';};
      textarea.addEventListener('input',update);update();
      const full=document.createElement('button');full.type='button';full.className='ghost';full.textContent='Fullscreen editor';full.style.margin='8px 0';
      full.onclick=()=>{const box=textarea.closest('.modal');if(!box)return;box.classList.toggle('bw-editor-fullscreen');full.textContent=box.classList.contains('bw-editor-fullscreen')?'Exit fullscreen':'Fullscreen editor';};
      counter.insertAdjacentElement('afterend',full);
      textarea.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();$('#modal-form button[type="submit"]')?.click();}});
    }
  }
  let activeId=null;
  async function runPrint(){
    if(!activeId){toast('Open a book first, then try printing.',true);return;}
    try{
      const {book,chapters,author}=await getBookData(activeId);
      $('#bw-print-root')?.remove();$('#bw-print-style')?.remove();
      const root=document.createElement('main');root.id='bw-print-root';
      root.innerHTML='<h1>'+esc(book.title)+'</h1><p class="bw-print-by">By '+esc(author)+'</p><p>'+esc(book.description||'')+'</p>'+chapters.map((c,i)=>'<section class="bw-print-chapter"><h2>Chapter '+(i+1)+': '+esc(c.title)+'</h2>'+String(c.content||'').split(/\r?\n/).map(line=>'<p>'+esc(line)+'</p>').join('')+'</section>').join('');
      const style=document.createElement('style');style.id='bw-print-style';style.textContent='@media screen{#bw-print-root{display:none}}@media print{body>*:not(#bw-print-root){display:none!important}#bw-print-root{display:block!important;max-width:760px;margin:0 auto;padding:0;color:#111;background:#fff;font:12pt/1.6 Georgia,serif}#bw-print-root h1{text-align:center;margin:20vh 0 1em}#bw-print-root .bw-print-by{text-align:center;margin-bottom:3em}#bw-print-root .bw-print-chapter{break-before:page;page-break-before:always}#bw-print-root h2{break-after:avoid-page}#bw-print-root p{white-space:pre-wrap}}';
      document.head.appendChild(style);document.body.appendChild(root);
      const cleanup=()=>{root.remove();style.remove();window.removeEventListener('afterprint',cleanup)};
      window.addEventListener('afterprint',cleanup,{once:true});
      window.print();setTimeout(cleanup,60000);
    }catch(e){console.error(e);toast('Print preparation failed: '+(e.message||'unknown error'),true);}
  }
  async function runExport(type){
    if(!activeId){toast('Open a book first, then try exporting.',true);return;}
    try{toast('Preparing your export…');if(type==='epub')await exportEpub(activeId);else await exportTxt(activeId);}
    catch(e){console.error(e);toast('Export failed: '+(e.message||'unknown error'),true);}
  }
  function installTheme(){
    const saved=localStorage.getItem('bw-theme')||'light';document.documentElement.dataset.theme=saved;
    const nav=$('.navright');if(!nav||$('#bw-theme-toggle'))return;
    const b=document.createElement('button');b.id='bw-theme-toggle';b.className='ghost';b.type='button';b.textContent=saved==='dark'?'Light mode':'Dark mode';b.setAttribute('aria-label','Toggle dark mode');
    b.onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('bw-theme',next);b.textContent=next==='dark'?'Light mode':'Dark mode';};
    nav.insertBefore(b,nav.firstChild);
  }
  function installBookObserver(){
    const detail=$('#book-detail');if(!detail)return;
    const observer=new MutationObserver(()=>{
      const title=$('.page-title',detail)?.textContent?.trim();
      if(!title)return;
      const id=detail.dataset.bookId;
      if(id)activeId=id;
      addBookTools();
    });
    observer.observe(detail,{childList:true,subtree:true});
    // Hook the original app's openBook rendering without changing its code by detecting its book-detail query.
    const original=window.fetch;
    installBookObserver._observer=observer;
  }
  function watchOpenBook(){
    const detail=$('#book-detail');if(!detail)return;
    new MutationObserver(()=>{if(detail.dataset.bookId)activeId=detail.dataset.bookId;addBookTools();installVersionHistory();}).observe(detail,{childList:true,subtree:true});
  }
  function installVersionHistory(){
    const reader=$('#chapter-reader'),chapterId=reader?.dataset.chapterId;
    if(!reader||reader.classList.contains('hidden')||!chapterId||reader.querySelector('[data-bw-history]'))return;
    const edit=$('#edit-chapter',reader);if(!edit)return;
    const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.bwHistory='1';button.textContent='Version history';button.style.marginLeft='8px';edit.insertAdjacentElement('afterend',button);
    const panel=document.createElement('div');panel.className='panel';panel.hidden=true;panel.style.marginTop='14px';button.insertAdjacentElement('afterend',panel);
    button.onclick=async()=>{
      panel.hidden=!panel.hidden;if(panel.hidden)return;
      panel.innerHTML='<p class="small">Loading saved versions…</p>';
      const {data,error}=await db.from('chapter_versions').select('id,title,content,saved_at,editor_id').eq('chapter_id',chapterId).order('saved_at',{ascending:false}).limit(20);
      if(error){panel.innerHTML='<p class="small">Version history unavailable. Run the Supabase migration and check editor permissions.</p>';return;}
      if(!data?.length){panel.innerHTML='<p class="small">No saved versions yet. Previous text is saved whenever you edit and save this chapter.</p>';return;}
      panel.innerHTML='<h3>Previous versions</h3>'+data.map(v=>'<div style="padding:10px 0;border-bottom:1px solid var(--line)"><strong>'+esc(v.title)+'</strong><p class="small">'+new Date(v.saved_at).toLocaleString()+' · '+(v.content||'').length+' characters</p><button type="button" class="ghost" data-bw-restore="'+esc(v.id)+'">Restore this version</button></div>').join('');
      $('[data-bw-restore]',panel).forEach(b=>b.onclick=async()=>{
        const version=data.find(v=>String(v.id)===b.dataset.bwRestore);if(!version||!confirm('Restore this saved version? The current chapter will first be saved as another version.'))return;
        const {data:current,error:readErr}=await db.from('chapters').select('id,title,content').eq('id',chapterId).single();
        if(readErr){toast('Could not load the current chapter: '+readErr.message,true);return;}
        const {data:userData}=await db.auth.getUser(),uid=userData.user?.id;
        if(uid){const snap=await db.from('chapter_versions').insert({chapter_id:chapterId,editor_id:uid,title:current.title,content:current.content||''});if(snap.error){toast('Could not preserve the current version: '+snap.error.message,true);return;}}
        const {error:updateErr}=await db.from('chapters').update({title:version.title,content:version.content,updated_at:new Date().toISOString()}).eq('id',chapterId);
        if(updateErr){toast('Restore failed: '+updateErr.message,true);return;}
        const heading=$('h3',reader),body=$('.reader',reader);if(heading)heading.textContent=version.title;if(body)body.textContent=version.content||'This chapter is still blank.';toast('Chapter version restored.');panel.hidden=true;
      });
    };
  }
  function installVersionSnapshots(){
    document.addEventListener('submit',async e=>{
      const form=e.target;
      if(!(form instanceof HTMLFormElement)||form.id!=='modal-form'||!form.elements.chapter_id?.value||form.dataset.bwVersionPass)return;
      e.preventDefault();e.stopImmediatePropagation();
      const chapterId=form.elements.chapter_id.value;
      try{
        const {data:userData}=await db.auth.getUser(),uid=userData.user?.id;
        if(uid){
          const {data:old,error:readErr}=await db.from('chapters').select('title,content').eq('id',chapterId).single();
          if(!readErr&&old){const {error}=await db.from('chapter_versions').insert({chapter_id:chapterId,editor_id:uid,title:old.title,content:old.content||''});if(error)toast('Chapter will save, but version history failed: '+error.message,true);}
        }
      }catch(err){console.warn('Could not save chapter version',err);}
      form.dataset.bwVersionPass='1';form.requestSubmit(form.querySelector('button[type="submit"]'));
    },true);
  }
  function installDraftRecovery(){
    const form=$('#modal-form'),textarea=form?.querySelector('textarea[name="content"]');
    if(!form||!textarea||textarea.dataset.bwDraftReady)return;
    const id=form.elements.chapter_id?.value;
    if(!id)return;
    textarea.dataset.bwDraftReady='1';
    const key='bw-draft:'+id,stored=localStorage.getItem(key);
    if(stored!==null&&stored!==textarea.value){
      const restore=document.createElement('button');restore.type='button';restore.className='secondary';restore.textContent='Restore unsaved local draft';
      restore.onclick=()=>{textarea.value=stored;textarea.dispatchEvent(new Event('input',{bubbles:true}));restore.remove();toast('Local draft restored.');};
      textarea.insertAdjacentElement('beforebegin',restore);
    }
    textarea.addEventListener('input',()=>{try{localStorage.setItem(key,textarea.value)}catch{}});
  }
  function enhanceCards(){
    $$('.book').forEach(card=>{
      const heading=$('h3',card);if(!heading||card.querySelector('.bw-cover-placeholder'))return;
      const cover=document.createElement('div');cover.className='bw-cover-placeholder';cover.textContent=(heading.textContent.trim()[0]||'B').toUpperCase();card.insertBefore(cover,card.firstChild);
    });
  }
  function start(){
    installTheme();installBookObserver();watchOpenBook();installVersionSnapshots();
    new MutationObserver(enhanceCards).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('input',e=>{if(e.target.matches('#modal-form textarea[name="content"]'))addBookTools();});
    setInterval(()=>{installTheme();addBookTools();installDraftRecovery();installVersionHistory();},1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();