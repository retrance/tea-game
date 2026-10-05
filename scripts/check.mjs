import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);new vm.Script(script);
const prefix=script.slice(0,script.indexOf('let state=loadState();'));
assert.ok(prefix.includes('function loadState()'));
const routing=script.slice(script.indexOf('const getCase='),script.indexOf('function save()'))+script.slice(script.indexOf('function parseRoute('),script.indexOf('const routeHash='));
function context(saved=null,blocked=false){
  const sandbox={localStorage:{getItem:()=>{if(blocked)throw new Error('blocked');return saved;}}};
  vm.createContext(sandbox);vm.runInContext(prefix+'\nlet state=loadState();\n'+routing,sandbox);return sandbox;
}
const evaluate=(expression,ctx=context())=>JSON.parse(vm.runInContext(`JSON.stringify(${expression})`,ctx));
const cases=evaluate('SCENARIOS'),verdicts=evaluate('VERDICTS'),avatars=Object.keys(JSON.parse(script.match(/const AVATARS=(\{.*?\});/)[1]));
function validate(list){
  assert.equal(list.length,6,'六案不可缺少');
  assert.equal(new Set(list.map(c=>c.id)).size,6,'案件 id 重複');
  for(const c of list){
    for(const key of ['title','context','from','time','finding','angle','todo'])assert.ok(c[key]?.trim(),`${c.id} 缺 ${key}`);
    assert.ok(/^\S+群組 \(\d+\)$/.test(c.context)||c.context===c.from,`${c.id} 的 context 是群組名加人數，私訊寫對方名字`);
    assert.match(c.time,/^([01]\d|2[0-3]):[0-5]\d$/,`${c.id} 的時間要是 HH:MM`);
    assert.ok(avatars.includes(c.from),`${c.id} 的傳訊人要有名字和頭像`);
    assert.ok(Number.isInteger(c.answer)&&c.answer>=0&&c.answer<verdicts.length,`${c.id} 缺調查局看法`);
    const clues=c.segments.filter(s=>s.id);
    assert.ok(clues.length>=2&&clues.length<=4,'每案維持短流程');
    assert.equal(new Set(clues.map(s=>s.id)).size,clues.length);
    assert.equal(c.feedback.length,verdicts.length,`${c.id} 缺對應回饋`);
    assert.equal(new Set(c.feedback).size,verdicts.length,`${c.id} 不可只換選項標籤`);
    for(const f of c.feedback)assert.ok(f.trim().length>15);
    for(const s of c.segments){
      assert.ok(s.text?.trim());if(!s.id)continue;
      assert.ok(s.hint?.trim(),`${c.id} 缺提示`);
      assert.ok(['message','attachment','check'].includes(s.basis),'提示必須說明依據');
      if(s.basis!=='message')assert.ok(c.references.some(r=>r.id===s.ref),'查證或附文必須指到來源');
      if(s.basis==='attachment')assert.equal(c.attachment?.ref,s.ref,'附文提示不可使用判斷前沒有的來源');
    }
    for(const r of c.references){assert.ok(r.label?.trim());assert.equal(new URL(r.url).protocol,'https:');}
    if(c.attachment){assert.ok(c.references.some(r=>r.id===c.attachment.ref));assert.ok(c.attachment.lines.length>0);assert.ok(clues.some(s=>s.ref===c.attachment.ref),`${c.id} 解析不重貼附件，附件來源要掛在線索上`);}
  }
}
validate(cases);
assert.equal(new Set(cases.map(c=>c.angle)).size,6,'六個判斷角度不可重複');
assert.equal(new Set(cases.map(c=>c.answer)).size,verdicts.length,'三種看法都要有案件，不能全是假消息');
const noAnswer=structuredClone(cases);delete noAnswer[2].answer;
assert.throws(()=>validate(noAnswer),/缺調查局看法/);
const faulty=structuredClone(cases);faulty[3].attachment=null;
assert.throws(()=>validate(faulty),/附文提示/,'必須抓到第四案依賴隱藏研究');
const noFeedback=structuredClone(cases);noFeedback[0].feedback.fill('同一段不回應原選擇的泛用文案');
assert.throws(()=>validate(noFeedback),/不可只換/);
const noHint=structuredClone(cases);noHint[0].segments.find(s=>s.id).hint='';
assert.throws(()=>validate(noHint),/缺提示/);
assert.deepEqual(verdicts,['假的','半真半假','真的']);
const initial=evaluate('state');
for(const saved of ['{bad',JSON.stringify({v:3,cases:{}})])assert.deepEqual(evaluate('state',context(saved)),initial);
assert.deepEqual(evaluate('state',context(null,true)),initial,'儲存不可用仍可玩');
const id=cases[0].id,second=cases[1].id;
const firstClue=cases[0].segments.find(s=>s.id).id;
const saved={v:4,cases:{[id]:{selected:2,submitted:0,active:firstClue,seen:[firstClue,'bogus']},[second]:{selected:2,submitted:null,active:'invalid',seen:['hour']},[cases[2].id]:{submitted:1}}};
const ctx=context(JSON.stringify(saved)),restored=evaluate('state',ctx);
assert.equal(restored.cases[id].selected,0,'原選擇不能被草稿覆蓋');assert.equal(restored.cases[id].submitted,0);
assert.deepEqual(restored.cases[id].seen,[firstClue],'只恢復存在的線索');assert.deepEqual(restored.cases[second].seen,[],'未提交的案件不能有已看線索');
assert.equal(restored.cases[second].selected,2);assert.equal(restored.cases[second].active,null);
assert.equal(restored.cases[cases[2].id].submitted,null,'存檔不得跳過未完成案');
function route(hash,ctx=context()){ctx.hash=hash;return evaluate('normalizeRoute(parseRoute(hash))',ctx);}
assert.deepEqual(route(`#case/${cases[5].id}`),{view:'case',id});
assert.deepEqual(route(`#review/${id}`),{view:'case',id});
assert.deepEqual(route('#finish'),{view:'case',id});
assert.deepEqual(route(`#case/${cases[5].id}`,ctx),{view:'case',id:second});
assert.deepEqual(route(`#review/${id}`,ctx),{view:'review',id});
const all=structuredClone(initial);for(const p of Object.values(all.cases)){p.submitted=2;p.selected=2;}
assert.deepEqual(route('#finish',context(JSON.stringify(all))),{view:'finish'});
// 每個判斷角度都要有自己的通關稱號，海報才不會人人一樣。
const personas=evaluate('PERSONAS'),topPersona=evaluate('TOP_PERSONA');
function checkPersonas(map){for(const c of cases)assert.ok(map[c.angle]?.length===2&&map[c.angle].every(x=>x.trim()),`${c.angle} 缺通關稱號`);assert.equal(new Set(Object.values(map).map(p=>p[0]).concat(topPersona[0])).size,cases.length+1,'通關稱號不可重複');}
checkPersonas(personas);
const noPersona=structuredClone(personas);delete noPersona[cases[4].angle];assert.throws(()=>checkPersonas(noPersona),/缺通關稱號/);
// 通關卡的 QR 指向公開入口；能不能掃由瀏覽器檢查實際解碼。
const gameUrl=evaluate('GAME_URL'),qr=evaluate('qrMatrix(GAME_URL)');
assert.equal(new URL(gameUrl).protocol,'https:');assert.ok(!/localhost|127\.0\.0\.1/.test(gameUrl),'QR 不可指向本機');
assert.ok(qr&&qr.length>=21&&qr.every(line=>line.length===qr.length),'入口網址要放得進 QR');
assert.equal(evaluate('qrMatrix("x".repeat(200))'),null,'放不下的內容不產生 QR');
// 線索是行內文字，不能撐高行距；觸控高度靠不上色的上下內距補足。
function checkTarget(source){const rule=source.match(/\.clue\s*\{([^}]*)\}/)?.[1]||'';for(const part of ['padding:13px 0','background-clip:content-box'])assert.ok(rule.includes(part),`點擊區缺 ${part}`);assert.ok(!rule.includes('inline-block'),'點擊區不可撐高行距');}
checkTarget(html);assert.throws(()=>checkTarget(html.replace('padding:13px 0','padding:0')),/點擊區/);
for(const forbidden of ['#cases','#compare','選擇案件','先跳過','重新調查','看本案重點','scoreDelta','type: \'range\'','sessionStorage','還無法判斷','收起提示','靠不住','靠得住','FINISH_LINES','finishLine','茶訊拆招員'])assert.ok(!script.includes(forbidden),`殘留舊流程 ${forbidden}`);
function checkMusic(source){
  const tag=source.match(/<audio\b[^>]*id="bgm"[^>]*>/)?.[0]||'';
  assert.ok(tag.includes('preload="none"')&&/\sloop(?:\s|>)/.test(tag),'音樂必須延遲載入並循環');
  assert.ok(!/\s(?:src|autoplay)\b/.test(tag),'音樂不可預先下載或自動播放');
  assert.ok(source.includes('id="music-toggle"')&&source.includes('aria-label="播放背景音樂"'),'音樂控制必須有鍵盤可用的按鈕與名稱');
}
checkMusic(html);
assert.throws(()=>checkMusic(html.replace('preload="none"','preload="auto"')),/延遲載入/);
assert.throws(()=>checkMusic(html.replace('<audio id="bgm"','<audio src="assets/audio/happy-adventure.mp3" id="bgm"')),/不可預先下載/);
const musicBytes=readFileSync(new URL('../assets/audio/happy-adventure.mp3',import.meta.url));
assert.ok(musicBytes.length>0&&musicBytes.length<1_000_000,'背景音樂檔案須存在且小於 1 MB');
function checkSeal(source){
  assert.ok(source.includes("src:'assets/images/tea-bureau-seal.webp'"),'通關章必須使用指定徽章圖');
  assert.ok(source.includes('if(seal)drawSeal(ctx)'),'通關章必須畫進分享與下載的 PNG');
}
function checkIdentity(source){
  assert.ok(source.includes("class:'brand-seal',src:'assets/images/tea-bureau-avatar.webp'"),'首頁須有簡化盾牌');
  assert.ok(source.includes("src:'assets/images/tea-bureau-avatar.webp'"),'調查局须用中央盾牌頭像');
  assert.ok(!source.includes("'調查局覺得'")&&!source.includes("'調查局也覺得'"),'判斷結果不可加不確定前綴');
}
checkIdentity(html);
assert.throws(()=>checkIdentity(html.replace("class:'brand-seal'","class:'missing'")),/首頁須/);
assert.throws(()=>checkIdentity(html+"'調查局覺得'"),/不確定前綴/);
const avatarBytes=readFileSync(new URL('../assets/images/tea-bureau-avatar.webp',import.meta.url));
assert.ok(avatarBytes.length>0&&avatarBytes.length<20_000,'簡化頭像須小於 20 KB');
checkSeal(html);assert.throws(()=>checkSeal(html.replace('if(seal)drawSeal(ctx)','')),/畫進/,'拿掉蓋章繪製必須被抓到');
const sealBytes=readFileSync(new URL('../assets/images/tea-bureau-seal.webp',import.meta.url));
assert.ok(sealBytes.length>0&&sealBytes.length<100_000,'通關章須存在且小於 100 KB');
console.log('PASS：六案來源分流、18 組回饋與調查局看法、六個通關稱號、QR 入口、順序入口、原答案不可覆蓋、存檔恢復／損壞／不可用；音樂預設關閉、延遲載入與檔案大小；通關章資源與 PNG 繪製；已知錯誤對照會失敗。');
