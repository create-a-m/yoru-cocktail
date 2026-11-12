'use strict';
const KEY='yoru-v1-data';
const TAGS=['甘い','さっぱり','酸味あり','ほろ苦い','濃厚','すっきり辛口','フルーティー','柑橘系','トロピカル','ミルク系','コーヒー系','ハーブ系','炭酸あり','弱め','普通','強め','華やか','大人っぽい','かわいい','個性的','リラックス','お祝い'];
const clone=x=>JSON.parse(JSON.stringify(x));
const initial=clone(window.YORU_RECIPES||[]);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const uid=()=>globalThis.crypto?.randomUUID?.()||`custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function validate(d){
 if(!d||!Array.isArray(d.recipes)||!Array.isArray(d.customers))throw Error('recipes と customers の配列が必要です');
 const ids=new Set();
 for(const r of d.recipes){
  if(!r||typeof r!=='object'||!['string','number'].includes(typeof r.id)||!String(r.id)||typeof r.name!=='string'||!r.name.trim()||typeof r.ingredients!=='string'||!Array.isArray(r.tags)||r.tags.some(t=>typeof t!=='string'))throw Error('レシピのID・名前・材料・タグを確認してください');
  if(ids.has(String(r.id)))throw Error('レシピIDが重複しています');ids.add(String(r.id));
  for(const k of ['method','note','source','variant','review','instagram','confidence'])if(r[k]!=null&&typeof r[k]!=='string')throw Error(`レシピの ${k} が文字列ではありません`);
 }
 for(const c of d.customers)if(!c||typeof c.name!=='string'||!c.name.trim()||typeof c.memo!=='string')throw Error('常連さんメモの形式が違います');
 return d;
}
let state={recipes:initial,customers:[]},storageBlocked=false,startMessage='';
try{const raw=localStorage.getItem(KEY);if(raw){state=validate(JSON.parse(raw));const ids=new Set(state.recipes.map(r=>String(r.id)));const missing=initial.filter(r=>!ids.has(String(r.id)));if(missing.length){state={...state,recipes:[...state.recipes,...clone(missing)]};startMessage=`原本レシピ${missing.length}件を補完しました。`;localStorage.setItem(KEY,JSON.stringify(state));}}}
catch(e){storageBlocked=true;startMessage='保存データを読み出せません。元データ保護のため保存を停止しています。管理画面で元データを書き出し、内容を確認して復元してください。';}
let tab='search',query='',chosen=[],flavor=[],vibe=[],strength='',editing=null,customerEditing=null,installPrompt=null;
const view=document.getElementById('view');
let statusTimer;
function notify(message){clearTimeout(statusTimer);document.getElementById('status').textContent=message;statusTimer=setTimeout(()=>document.getElementById('status').textContent='',7000);}
function commit(next){if(storageBlocked){notify('保存は停止中です。管理画面からデータを復元してください。');return false;}try{validate(next);localStorage.setItem(KEY,JSON.stringify(next));state=next;return true;}catch(e){notify('保存できませんでした。空き容量やブラウザ設定を確認し、バックアップしてください。');return false;}}
const btn=(text,action,value='',cls='')=>`<button type="button" class="${cls}" data-action="${action}" data-value="${esc(value)}">${esc(text)}</button>`;
const tagsHtml=tags=>`<div class="tags">${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`;
function tagButtons(items,selected,action){return `<div class="tags">${items.map(t=>`<button type="button" data-action="${action}" data-value="${esc(t)}" aria-pressed="${selected.includes(t)}" class="${selected.includes(t)?'selected':''}">${esc(t)}</button>`).join('')}</div>`;}
const allTags=()=>[...new Set([...TAGS,...state.recipes.flatMap(r=>r.tags)])];
// Derive the displayed base from ingredients; archival source labels remain in backups only.
function mainAlcohol(r){
 const ingredients=String(r.ingredients||'').normalize('NFKC');
 const spirits=[...ingredients.matchAll(/(?:ドライ)?ジン(?!ジャ)|ウォッカ|(?:ホワイト|ダーク|ゴールド)?ラム|テキーラ|(?:アップル)?ブランデー|(?:スコッチ)?ウイスキー|焼酎/g)].map(m=>({name:m[0],amount:Number(ingredients.slice(m.index+m[0].length).match(/^[^\d、,]*(\d+(?:\.\d+)?)/)?.[1]||0)}));
 if(spirits.length){const name=spirits.sort((a,b)=>b.amount-a.amount)[0].name;return name.replace('ドライジン','ジン').replace(/^(ホワイト|ダーク|ゴールド)ラム$/,'ラム').replace('アップルブランデー','ブランデー').replace('スコッチウイスキー','ウイスキー');}
 const wine=ingredients.match(/白ワイン|赤ワイン|スパークリングワイン|シャンパン|ビール|ベルモット/);if(wine)return wine[0];
 const first=ingredients.split(/[、,\n]/)[0].replace(/[\d０-９].*$/,'').trim();
 return ({'マリブ':'ココナッツリキュール','カルーア':'コーヒーリキュール','パッソア':'パッションフルーツリキュール','カカオホワイト':'カカオリキュール'})[first]||first||'未設定';
}
function card(r,reason=''){return `<button type="button" class="card recipe-link" data-action="detail" data-value="${esc(r.id)}"><h3>${esc(r.name)}</h3><div class="muted">${esc(r.ingredients)}</div>${tagsHtml(r.tags)}${reason?`<div class="muted">一致：${esc(reason)}</div>`:''}<div class="muted">${esc(mainAlcohol(r))}</div></button>`;}
function render(focus=false){document.getElementById('nav').innerHTML=[['search','⌕','レシピ'],['recommend','✦','おすすめ'],['customers','♡','常連さん'],['manage','⚙','管理']].map(([id,icon,label])=>`<button type="button" data-action="tab" data-value="${id}" class="${tab===id?'active':''}" ${tab===id?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');({search,recommend,customers,manage})[tab]();if(focus){view.focus();window.scrollTo(0,0);}}
function search(){view.innerHTML=`<div class="row"><h2>レシピを探す</h2><span class="badge">${state.recipes.length} recipes</span></div><div class="searchbox"><label for="q">カクテル名・材料・タグ</label><input id="q" type="search" autocomplete="off" placeholder="例：ジン 柑橘系" value="${esc(query)}"></div><details ${chosen.length?'open':''}><summary>タグで絞り込む${chosen.length?`（${chosen.length}個）`:''}</summary>${tagButtons(allTags(),chosen,'search-tag')}</details><div class="row"><span class="muted">スペース区切り・複数タグはすべて一致</span>${btn('クリア','clear')}</div><div id="results" class="cards" aria-live="polite"></div>`;searchResults();}
function searchResults(){const words=norm(query).trim().split(/\s+/).filter(Boolean);const list=state.recipes.filter(r=>{const hay=norm([r.name,r.ingredients,mainAlcohol(r),r.note,...r.tags].join(' '));return words.every(w=>hay.includes(w))&&chosen.every(t=>r.tags.includes(t));});document.getElementById('results').innerHTML=`<p class="count">${list.length}件見つかりました</p>`+(list.length?list.map(r=>card(r)).join(''):'<p class="empty">該当するレシピがありません。<br>検索語やタグを減らしてください。</p>');}
function detail(id){const r=state.recipes.find(r=>String(r.id)===String(id));if(!r)return;view.innerHTML=`${btn('← 一覧に戻る','back')}<article class="card"><p class="muted">${esc(mainAlcohol(r))}</p><h2>${esc(r.name)}</h2>${tagsHtml(r.tags)}<hr>${[['材料・分量',r.ingredients],['作り方',r.method||'未記載'],['紹介メモ',r.note]].filter(x=>x[1]).map(([label,value])=>`<h3>${label}</h3><p class="pre">${esc(value)}</p>`).join('')}${btn('このレシピを編集','edit-recipe',r.id,'primary')}</article>`;view.focus();window.scrollTo(0,0);}
function recommend(){const selected=[...flavor,...vibe];const list=state.recipes.filter(r=>!strength||r.tags.includes(strength)).map(r=>({r,score:flavor.filter(t=>r.tags.includes(t)).length*3+vibe.filter(t=>r.tags.includes(t)).length*2})).filter(x=>!selected.length||x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);view.innerHTML=`<h2>おすすめバーテンダー</h2><p class="muted">今夜の気分を選んでください。味・雰囲気の一致から最大5件をご提案します。</p><fieldset><legend>味・風味</legend>${tagButtons(TAGS.slice(0,13),flavor,'flavor')}</fieldset><fieldset><legend>今夜の雰囲気</legend>${tagButtons(TAGS.slice(16),vibe,'vibe')}</fieldset><label for="strength">お酒の強さ</label><select id="strength"><option value="">指定しない</option>${TAGS.slice(13,16).map(t=>`<option ${strength===t?'selected':''}>${t}</option>`).join('')}</select><p class="muted">強さを指定すると、強さ未判定のレシピは含まれません。好みは一致数の多い順です。</p>${btn('条件をクリア','rec-clear')}<div class="cards">${!selected.length&&!strength?'<div class="notice">味・雰囲気・強さのいずれかを選ぶと提案します。</div>':list.length?list.map(({r})=>card(r,selected.filter(t=>r.tags.includes(t)).join('・')||strength)).join(''):'<p class="empty">候補がありません。条件を減らしてください。</p>'}</div>`;}
function customers(){const c=customerEditing===null?{name:'',memo:''}:state.customers[customerEditing];view.innerHTML=`<h2>常連さんメモ</h2><div class="notice">このブラウザ内に保存します。外部送信・自動同期はありません。ニックネームで管理してください。</div><form id="customer-form"><label for="cn">ニックネーム（必須）</label><input id="cn" required maxlength="100" value="${esc(c.name)}" placeholder="例：Aさん"><label for="cm">好きなカクテル・好み</label><textarea id="cm" placeholder="例：ジン系、さっぱり。甘さ控えめ。">${esc(c.memo)}</textarea><div class="actions"><button class="primary" type="submit">${customerEditing===null?'メモを追加':'変更を保存'}</button>${customerEditing!==null?btn('キャンセル','customer-cancel'):''}</div></form><hr><p class="count">${state.customers.length}人のメモ</p>${state.customers.map((c,i)=>`<article class="card"><h3>${esc(c.name)}</h3><p class="pre">${esc(c.memo)}</p><div class="actions">${btn('編集','customer-edit',i)}${btn('削除','customer-delete',i,'danger')}</div></article>`).join('')}`;}
function editRecipe(id){editing=id;const r=id===null?{name:'',ingredients:'',method:'',tags:[],note:'',variant:'',review:''}:state.recipes.find(r=>String(r.id)===String(id));if(!r)return;view.innerHTML=`${btn('← キャンセル','back')}<h2>${id===null?'レシピを追加':'レシピを編集'}</h2><p class="muted">同名の別配合はそれぞれ独立して保存します。</p><form id="recipe-form">${[['en','名前（必須）',r.name,false],['ei','材料・分量（必須）',r.ingredients,true],['em','作り方',r.method,true],['enote','メモ',r.note,true]].map(([id,label,value,area])=>`<label for="${id}">${label}</label>${area?`<textarea id="${id}" ${id==='ei'?'required':''}>${esc(value)}</textarea>`:`<input id="${id}" required value="${esc(value)}">`}`).join('')}<fieldset><legend>タグ（複数選択）</legend>${tagButtons([...new Set([...TAGS,...r.tags])],r.tags,'edit-tag')}</fieldset><button class="primary" type="submit">保存する</button></form>`;view.focus();window.scrollTo(0,0);}
function saveRecipe(){const name=document.getElementById('en').value.trim(),ingredients=document.getElementById('ei').value.trim();if(!name||!ingredients)return notify('名前と材料を入力してください。');const next=clone(state);let r=editing===null?{id:uid(),source:'追加登録'}:next.recipes.find(r=>String(r.id)===String(editing));Object.assign(r,{name,ingredients,method:document.getElementById('em').value,note:document.getElementById('enote').value,tags:[...view.querySelectorAll('[data-action="edit-tag"][aria-pressed="true"]')].map(b=>b.dataset.value)});if(editing===null)next.recipes.push(r);if(commit(next)){tab='search';query=name;chosen=[];render(true);notify('レシピを保存しました。');}}
function download(data,name){const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function exportData(){download({...state,format:'yoru-backup',version:2,exportedAt:new Date().toISOString()},`YORU_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`);notify('バックアップを書き出しました。保存先を確認してください。');}
async function importData(file){if(!file)return;try{if(file.size>20*1024*1024)throw Error('20MB以下のJSONを選んでください');const d=validate(JSON.parse(await file.text()));const ids=new Set(d.recipes.map(r=>String(r.id)));const preserved=state.recipes.filter(r=>!ids.has(String(r.id)));const next={recipes:[...clone(d.recipes),...clone(preserved)],customers:clone(d.customers)};if(!confirm(`レシピ${d.recipes.length}件・常連さん${d.customers.length}人を復元します。\n同じIDのレシピと常連さんメモは置き換えます。現在のみ存在するレシピ${preserved.length}件は残します。\n続けると復元前のバックアップも書き出します。ファイルの保存先を確認してください。`))return;
 // Write a recovery copy before replacing the main storage key. Failure aborts restoration.
 const before=localStorage.getItem(KEY);if(before!==null){localStorage.setItem('yoru-before-restore',before);download(before,`YORU_before_restore_${Date.now()}.json`);}else exportData();
 const wasBlocked=storageBlocked;storageBlocked=false;if(commit(next)){customerEditing=null;render();notify('復元しました。復元前のデータも管理画面から書き出せます。');}else storageBlocked=wasBlocked;
 }catch(e){notify(`復元できませんでした：${e.message}`);}}
function manage(){view.innerHTML=`<h2>管理・バックアップ</h2>${storageBlocked?`<div class="notice">保存停止中：元の保存データを保護しています。${btn('元データを書き出す','raw-export')}</div>`:''}<section class="card"><h3>レシピ管理</h3><p class="muted">${state.recipes.length}件を保存中。原本127件・配合違いを保持します。編集はレシピ詳細から行えます。</p>${btn('＋ レシピを追加','new-recipe','','primary')}</section><section class="card"><h3>バックアップと復元</h3><p class="muted">ブラウザのデータ消去・端末故障に備えて、定期的にJSONを書き出してください。バックアップには常連さんメモも含まれます。公開フォルダやGitHubには置かず、安全な場所で保管してください。</p><div class="actions">${btn('JSONを書き出す','export','','primary')}${btn('JSONから復元','restore')}${btn('復元前データを書き出す','previous-export')}</div><input id="restore-file" class="hidden" type="file" accept=".json,application/json"><p class="muted">v1のバックアップも利用できます。同じIDを復元し、現在のみ存在するレシピは残します。常連さんメモはバックアップの内容に置き換えます。</p></section><section class="card"><h3>スマホにインストール</h3><p class="muted">iPhone：Safariの共有 →「ホーム画面に追加」。Android：ブラウザメニュー →「アプリをインストール」または「ホーム画面に追加」。HTTPSで一度開いた後はオフラインでも使えます。</p>${installPrompt?btn('アプリをインストール','install','','primary'):''}<p id="offline-state" class="muted"></p>${btn('アプリの更新を確認','update')}</section><section class="card"><h3>保存とプライバシー</h3><p class="muted">アカウント・API・有料DB・アクセス解析なし。入力内容はこのブラウザのlocalStorageに保存し、サーバーへ送信しません。同じ端末・ブラウザを使える人は閲覧できます。プライベートブラウズは避けてください。複数端末へはバックアップで移行できます。</p>${btn('永続保存をリクエスト','persist')}<p class="muted">許可の有無にかかわらずバックアップを続けてください。</p></section>`;offlineStatus();}
async function offlineStatus(){const target=document.getElementById('offline-state');if(!target)return;target.textContent=!('serviceWorker'in navigator)?'この環境はオフライン保存非対応です。HTTPSまたはlocalhostで開いてください。':navigator.serviceWorker.controller?'オフライン利用の準備ができています。':'オフライン準備中、または未対応環境です。オンラインで再度開いてください。';}
view.addEventListener('input',e=>{if(e.target.id==='q'){query=e.target.value;searchResults();}});
view.addEventListener('change',e=>{if(e.target.id==='strength'){strength=e.target.value;recommend();}if(e.target.id==='restore-file'){importData(e.target.files[0]);e.target.value='';}});
view.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='recipe-form')saveRecipe();if(e.target.id==='customer-form'){const name=document.getElementById('cn').value.trim();if(!name)return notify('ニックネームを入力してください。');const next=clone(state),c={...(customerEditing===null?{}:next.customers[customerEditing]),name,memo:document.getElementById('cm').value.trim()};if(customerEditing===null)next.customers.push(c);else next.customers[customerEditing]=c;if(commit(next)){customerEditing=null;customers();notify('メモを保存しました。');}}});
function toggle(a,v){return a.includes(v)?a.filter(t=>t!==v):[...a,v];}
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-action]');if(!b)return;const v=b.dataset.value;switch(b.dataset.action){
 case'tab':tab=v;customerEditing=null;render(true);break;
 case'back':render(true);break;
 case'detail':detail(v);break;
 case'search-tag':chosen=toggle(chosen,v);search();break;
 case'clear':query='';chosen=[];search();break;
 case'flavor':flavor=toggle(flavor,v);recommend();break;
 case'vibe':vibe=toggle(vibe,v);recommend();break;
 case'rec-clear':flavor=[];vibe=[];strength='';recommend();break;
 case'edit-recipe':editRecipe(v);break;
 case'new-recipe':editRecipe(null);break;
 case'edit-tag':{const selected=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(selected));b.classList.toggle('selected',selected);break;}
 case'customer-edit':customerEditing=Number(v);customers();document.getElementById('cn').focus();break;
 case'customer-cancel':customerEditing=null;customers();break;
 case'customer-delete':if(confirm('この常連さんメモを削除しますか？')){const next=clone(state);next.customers.splice(Number(v),1);if(commit(next)){customerEditing=null;customers();}}break;
 case'export':exportData();break;
 case'restore':document.getElementById('restore-file').click();break;
 case'raw-export':try{const raw=localStorage.getItem(KEY);if(raw!==null)download(raw,'YORU_original_storage.json');else notify('保存データはありません。');}catch{notify('ブラウザが保存領域へのアクセスを拒否しています。');}break;
 case'previous-export':try{const raw=localStorage.getItem('yoru-before-restore');if(raw!==null)download(raw,'YORU_before_restore.json');else notify('復元前データはまだありません。');}catch{notify('保存領域にアクセスできません。');}break;
 case'persist':notify(await navigator.storage?.persist?.()?'永続保存が許可されました。':'永続保存は許可されませんでした。定期的にバックアップしてください。');break;
 case'install':if(installPrompt){await installPrompt.prompt();installPrompt=null;manage();}break;
 case'update':try{const reg=await navigator.serviceWorker?.getRegistration();if(reg){await reg.update();notify('更新を確認しました。新しい版はアプリをすべて閉じ、開き直すと適用されます。');}else notify('HTTPSまたはlocalhostで開いてください。');}catch{notify('更新を確認できません。通信状態を確認してください。');}break;
}});
window.addEventListener('storage',e=>{if(e.key===KEY){storageBlocked=true;notify('別の画面でデータが変更されました。編集内容を控え、再読み込みしてください。');}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;if(tab==='manage')manage();});
function connection(){document.getElementById('connection').textContent=navigator.onLine?'端末内保存':'オフライン';}window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
if('serviceWorker'in navigator&&['https:','http:'].includes(location.protocol)){navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>offlineStatus()).catch(()=>notify('オフライン準備に失敗しました。オンラインで開き直してください。'));navigator.serviceWorker.addEventListener('controllerchange',offlineStatus);}
render();if(startMessage)notify(startMessage);
