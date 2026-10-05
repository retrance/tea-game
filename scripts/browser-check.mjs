import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const base=process.env.GAME_URL||'http://127.0.0.1:8765';
const artifactDir=process.env.GAME_ARTIFACTS||'/private/tmp/tea-game-verification';
mkdirSync(artifactDir,{recursive:true});
const failures=[];const reports=[];
async function newPage(options={}){
  const context=await browser.newContext({viewport:{width:375,height:812},...options});
  const page=await context.newPage();
  page.on('pageerror',e=>failures.push(e.message));
  return {page,context};
}
async function loaded(page,hash='#home'){
  await page.goto(base+'/'+hash);await page.locator('#page-title').waitFor();
  // A remote font failure must not stop gameplay. Layout checks use available rendering.
  await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]));
}
async function hashIs(page,hash){await page.waitForFunction(expected=>location.hash===expected&&routeHash(route)===expected&&document.body.dataset.view===route.view,hash);}
async function noOverflow(page){
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.width,`橫向溢出 ${JSON.stringify(size)} ${page.url()}`);
}
async function original(page,c){
  assert.equal(await page.locator('.clue,.clue-note,.feedback').count(),0,'初始 DOM 不可有解析');
  assert.equal(await page.locator('.message-text').innerText(),c.segments.map(s=>s.text).join(''));
  if(c.attachment){
    const received=await page.locator('.attachment').innerText();
    for(const line of c.attachment.lines)assert.ok(received.includes(line),'必要附文不可隱藏');
    assert.equal(await page.locator('.attachment a').getAttribute('href'),c.references.find(r=>r.id===c.attachment.ref).url);
  }else assert.equal(await page.locator('.attachment').count(),0);
  await noOverflow(page);
}
function assertUnhinted(count){assert.equal(count,0,'判斷前線索洩漏');}
assert.throws(()=>assertUnhinted(1),/判斷前線索洩漏/,'瀏覽器檢查也須有已知錯誤對照');
async function musicClearOfContent(page){
  const overlap=await page.evaluate(()=>{
    const button=document.getElementById('music-toggle').getBoundingClientRect();
    return [...document.querySelectorAll('.brand,.chat-name,.case-title,.finish-title,#storage-notice,.choice,.btn')].filter(e=>{
      if(!e.getClientRects().length)return false;
      let box=e.getBoundingClientRect();
      if(e.matches('.brand,.chat-name,.case-title,.finish-title,#storage-notice')){
        const range=document.createRange();range.selectNodeContents(e);box=range.getBoundingClientRect();
      }
      return box.width&&box.height&&box.left<button.right&&box.right>button.left&&box.top<button.bottom&&box.bottom>button.top;
    }).map(e=>e.id||e.className);
  });
  assert.deepEqual(overlap,[],'音符不可遮住標題、提示或操作');
}
try{
  // Actual MP3 playback: no request before consent, one persistent player across routes.
  {
    const {page,context}=await newPage();let audioRequests=0;
    page.on('request',r=>{if(r.url().endsWith('/assets/audio/happy-adventure.mp3'))audioRequests++;});
    await loaded(page);
    const button=page.locator('#music-toggle');
    async function assertQuiet(){
      assert.equal(audioRequests,0,'玩家點擊前不可下載音樂');
      assert.ok(await page.evaluate(()=>{const a=document.getElementById('bgm');return a.paused&&!a.getAttribute('src');}),'玩家點擊前必須靜音且無來源');
    }
    await assertQuiet();
    await page.evaluate(()=>document.getElementById('bgm').src='bad.mp3');
    await assert.rejects(assertQuiet,/不可下載|必須靜音/,'已知錯誤：提早指定來源必須被抓到');
    await page.reload();await page.locator('#page-title').waitFor();audioRequests=0;await assertQuiet();
    for(const width of [320,375,430,960]){
      await page.setViewportSize({width,height:812});
      const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=width,'音符必須留在畫面且有 44px 觸控區');
      const brand=await page.locator('.brand').boundingBox();assert.ok(box.x>=brand.x+brand.width-52,'刊頭應為音符預留空間');
      await noOverflow(page);await musicClearOfContent(page);
    }
    await page.evaluate(()=>{const e=document.querySelector('.music-control'),b=document.querySelector('.brand').getBoundingClientRect();e.style.left=b.left+'px';e.style.top=b.top+'px';e.style.right='auto';});
    await assert.rejects(()=>musicClearOfContent(page),/不可遮住/,'已知錯誤：音符蓋住刊頭必須被抓到');
    await page.evaluate(()=>{const e=document.querySelector('.music-control');for(const p of ['left','top','right'])e.style.removeProperty(p);});
    await page.setViewportSize({width:375,height:812});
    await button.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getElementById('music-toggle').dataset.state==='playing');
    assert.ok(audioRequests>0);assert.equal(await button.getAttribute('aria-pressed'),'true');
    assert.ok(await page.evaluate(()=>{const a=document.getElementById('bgm');return a.loop&&!a.paused&&a.duration>0;}),'實際 MP3 要能解碼播放並循環');
    await page.evaluate(()=>window.testMusic=document.getElementById('bgm'));
    await page.getByRole('link',{name:'開始調查',exact:true}).click();
    await musicClearOfContent(page);
    await page.locator('#verdict-1').check();await page.locator('#submit-case').click();
    for(const view of ['review','finish','home']){
      if(view==='finish')await page.evaluate(()=>{for(const p of Object.values(state.cases)){p.selected=2;p.submitted=2;}go('#finish');});
      if(view==='home')await page.evaluate(()=>go('#home'));
      await page.waitForFunction(v=>document.body.dataset.view===v,view);
      assert.ok(await page.evaluate(()=>document.getElementById('bgm')===window.testMusic&&!window.testMusic.paused),'切頁不可重建或暫停音樂');
      assert.ok(await button.isVisible());
      for(const width of [320,375,430]){await page.setViewportSize({width,height:812});await noOverflow(page);await musicClearOfContent(page);}
    }
    await button.click();await page.waitForFunction(()=>document.getElementById('bgm').paused);
    const pausedAt=await page.evaluate(()=>document.getElementById('bgm').currentTime);
    assert.equal(await button.getAttribute('data-state'),'off');assert.equal(await button.getAttribute('aria-pressed'),'false');
    await button.focus();await page.keyboard.press('Space');
    await page.waitForFunction(t=>!document.getElementById('bgm').paused&&document.getElementById('bgm').currentTime>t,pausedAt);
    await page.evaluate(()=>{const a=document.getElementById('bgm');a.currentTime=a.duration-.15;});
    await page.waitForFunction(()=>{const a=document.getElementById('bgm');return !a.paused&&a.currentTime<1;});
    await page.screenshot({path:`${artifactDir}/music-playing-mobile.png`});
    await page.reload();await page.locator('#page-title').waitFor();
    assert.ok(await page.evaluate(()=>document.getElementById('bgm').paused&&!document.getElementById('bgm').getAttribute('src')),'刷新後不可恢復發聲');
    await context.close();
  }
  // Slow network: cancellation and rapid clicks must never revive a canceled play.
  {
    const {page,context}=await newPage({reducedMotion:'reduce'});
    let release;const held=new Promise(resolve=>{release=resolve;});let requested=false;
    await page.route('**/assets/audio/happy-adventure.mp3',async route=>{requested=true;await held;await route.continue();});
    await loaded(page);const button=page.locator('#music-toggle');await button.click();
    await page.waitForFunction(()=>document.getElementById('music-toggle').dataset.state==='loading');
    assert.equal(await page.locator('#music-status').innerText(),'音樂載入中…');
    assert.equal(await button.evaluate(e=>getComputedStyle(e,':after').animationName),'none','減少動態效果時停用轉圈');
    await button.click();await button.click();await button.click();
    assert.equal(await button.getAttribute('data-state'),'off');
    release();
    assert.ok(requested&&await page.evaluate(()=>{const a=document.getElementById('bgm');return a.paused&&!a.getAttribute('src')&&a.readyState===0;}),'首次載入取消後移除來源並停止下載、播放');
    await button.click();await page.waitForFunction(()=>document.getElementById('music-toggle').dataset.state==='playing');
    await context.close();
  }
  // Failed file and blocked play promise both offer a retry without blocking the game.
  for(const mode of ['network','blocked']){
    const {page,context}=await newPage();
    if(mode==='network')await page.route('**/assets/audio/happy-adventure.mp3',route=>route.fulfill({status:404,body:'missing'}));
    else await page.addInitScript(()=>{window.realPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('blocked','NotAllowedError'));};});
    await loaded(page);const button=page.locator('#music-toggle');await button.click();
    await page.waitForFunction(()=>document.getElementById('music-toggle').dataset.state==='error');
    assert.equal(await button.getAttribute('aria-pressed'),'false');assert.ok((await page.locator('#music-status').innerText()).includes('重試'));
    await page.getByRole('link',{name:'開始調查',exact:true}).click();await page.locator('#verdict-0').check();
    if(mode==='network')await page.unroute('**/assets/audio/happy-adventure.mp3');
    else await page.evaluate(()=>{HTMLMediaElement.prototype.play=window.realPlay;});
    await button.click();await page.waitForFunction(()=>document.getElementById('music-toggle').dataset.state==='playing');
    await context.close();
  }
  reports.push('音樂預設不下載／實際 MP3 播放／跨頁持續／暫停恢復／循環／載入取消與連點／失敗重試／鍵盤與減少動態效果');
  const {page,context}=await newPage();await loaded(page);
  const cases=await page.evaluate(()=>SCENARIOS),verdicts=await page.evaluate(()=>VERDICTS);
  assert.equal(verdicts.length,3);
  assert.equal(await page.getByRole('link',{name:'開始調查',exact:true}).count(),1);
  const start=await page.getByRole('link',{name:'開始調查',exact:true}).boundingBox();assert.ok(start.y+start.height<812,'首頁開始不在首屏');
  assert.equal(await page.locator('.notif').count(),3);await page.waitForFunction(()=>[...document.querySelectorAll('.notif')].every(b=>getComputedStyle(b).opacity==='1'),null,{timeout:5000});await noOverflow(page);
  for(const width of [320,375]){await page.setViewportSize({width,height:812});const t=await page.evaluate(()=>{const e=document.querySelector('.hero-title');return e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).lineHeight);});assert.ok(Math.round(t)===2,`首頁標題應為兩行 ${width}: ${t}`);}
  await page.screenshot({path:`${artifactDir}/home-mobile.png`});
  // Known bad DOM: verify the same original-screen inspection actually turns red.
  await page.goto(base+`/#case/${cases[0].id}`);await hashIs(page,`#case/${cases[0].id}`);
  await page.evaluate(()=>{const b=document.createElement('button');b.className='clue';b.id='test-leaked-clue';document.getElementById('screen').append(b);});
  await assert.rejects(()=>original(page,cases[0]),/初始 DOM/);
  await page.evaluate(()=>document.getElementById('test-leaked-clue').remove());
  // Gate direct links, including obsolete review URL and premature finish.
  for(const hash of [`#case/${cases[5].id}`,`#review/${cases[0].id}`,'#finish']){
    await page.goto(base+'/'+hash);await hashIs(page,`#case/${cases[0].id}`);await original(page,cases[0]);
  }
  await page.locator('#submit-case').click();await page.locator('#form-error').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'verdict-0');
  assert.equal(await page.locator('.clue').count(),0);
  for(const [i,c] of cases.entries()){
    await hashIs(page,`#case/${c.id}`);await original(page,c);
    if(i===3){assert.ok((await page.locator('.attachment').innerText()).includes('11 名健康男性'));await page.screenshot({path:`${artifactDir}/fourth-original-mobile.png`,fullPage:true});}
    const choice=i%3;
    // 選之前：回覆框是提示語、送出不是綠色；選了之後：回覆框寫好要送的話、送出才變綠，選中的選項不是綠底。
    assert.equal(await page.locator('#reply-draft').innerText(),'先選上面一個看法');
    assert.ok(!(await page.locator('#submit-case').getAttribute('class')).includes('primary'),'未選看法，送出不可是主要按鈕');
    await page.locator(`#verdict-${choice}`).check();
    if(i===0){await page.reload();await page.locator(`#verdict-${choice}`).waitFor();assert.ok(await page.locator(`#verdict-${choice}`).isChecked());}
    assert.equal(await page.locator('#reply-draft').innerText(),`我覺得是「${verdicts[choice]}」`);
    assert.ok((await page.locator('#submit-case').getAttribute('class')).includes('primary'),'選了看法，送出要變主要按鈕');
    const fills=await page.evaluate(()=>[getComputedStyle(document.querySelector('.choice.checked')).backgroundImage,getComputedStyle(document.getElementById('submit-case')).backgroundImage]);assert.notEqual(fills[0],fills[1],'選中的選項和送出不可同一個顏色');
    const choices=await page.locator('.choices').boundingBox();assert.ok(choices.height<=70,`選項應只佔一列 ${choices.height}`);
    await page.locator('#submit-case').click();await hashIs(page,`#review/${c.id}`);
    assert.equal(await page.locator('#choice-feedback').innerText(),c.feedback[choice]);
    const stamp=await page.locator('#verdict-compare').innerText();assert.ok(stamp.includes(verdicts[c.answer])&&stamp.includes(choice===c.answer?'調查局也覺得':'調查局覺得'),`印章要對照玩家與調查局 ${stamp}`);
    assert.ok((await page.locator('.row.me .saved-choice').innerText()).includes(verdicts[choice]),'解析開頭是玩家自己的回覆');
    assert.equal(await page.locator('.feedback').count(),2,'解析只有看法和做法兩個區塊');
    assert.equal(await page.locator('.attachment').count(),0,'解析不重貼訊息附的資料');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelector('.feedback').children].map(e=>e.tagName+(e.id?'#'+e.id:''))),['DIV#verdict-compare','H2','P#choice-feedback'],'第一塊只有印章、結論、回饋');
    if(i===0){const first=page.locator(`#clue-${c.segments.find(s=>s.id).id}`);const line=await page.evaluate(()=>{const t=document.querySelector('.message-text');return {h:t.offsetHeight,lh:parseFloat(getComputedStyle(t).lineHeight)};});assert.ok(Math.abs(line.h/line.lh-Math.round(line.h/line.lh))<.05,`線索不可撐高行距 ${JSON.stringify(line)}`);await first.focus();await page.keyboard.press('Enter');assert.equal(await first.getAttribute('aria-expanded'),'true');await page.keyboard.press('Space');assert.equal(await first.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.clue.seen').count(),1);await page.evaluate(id=>{state.cases[id].seen=[];save();},c.id);await page.reload();await hashIs(page,`#review/${c.id}`);}
    assert.equal(await page.locator('.clue.seen').count(),0,'線索一開始都是未看');
    assert.ok(!(await page.locator('#next-action').getAttribute('class')).includes('primary'),'線索未看完，下一案不是主要按鈕');
    assert.equal(await page.locator('input[type=radio]').count(),0,'解析不再答題');
    assert.equal(await page.locator('.clue').count(),c.segments.filter(s=>s.id).length);
    const feedbackBox=await page.locator('.feedback').first().boundingBox();assert.ok(feedbackBox.y<812,'原選擇回饋應立即可見');
    // Every clue, for all phone sizes: real DOM dimensions and visible trigger / explanation.
    for(const width of [320,375,430]){
      await page.setViewportSize({width,height:width===320?568:812});
      for(const s of c.segments.filter(s=>s.id)){
        const button=page.locator(`#clue-${s.id}`);await button.scrollIntoViewIfNeeded();
        const before=await button.getAttribute('aria-expanded');if(before!=='true')await button.click();
        assert.equal(await page.locator('.clue-note:visible').count(),1);
        assert.ok((await button.getAttribute('class')).includes('seen'),'點過的線索要標成已看');
        const geometry=await page.evaluate(id=>{
          const b=document.getElementById(`clue-${id}`).getBoundingClientRect(),n=document.getElementById(`hint-${id}`).getBoundingClientRect(),a=document.querySelector('.actionbar').getBoundingClientRect(),head=document.querySelector('.chat-head').getBoundingClientRect();
          return {button:{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom},note:{y:n.y,bottom:n.bottom,height:n.height},limit:a.top,head:head.bottom,bar:a.bottom,view:innerHeight};
        },s.id);
        assert.ok(geometry.button.width>=44&&geometry.button.height>=44,`線索觸控區 ${c.id}/${s.id}`);
        assert.ok(geometry.button.y>=geometry.head-11&&geometry.note.bottom<=geometry.limit+1,`線索與提示要留在標題列和操作列之間 ${c.id}/${s.id} ${width}: ${JSON.stringify(geometry)}`);
        assert.ok(Math.abs(geometry.bar-geometry.view)<=1,`操作列要貼在畫面底部 ${JSON.stringify(geometry)}`);
        if(s.ref)assert.equal(await page.locator(`#hint-${s.id} a`).getAttribute('href'),c.references.find(r=>r.id===s.ref).url);
        await noOverflow(page);
        if(i===3&&s.id==='fat'&&width===375)await page.screenshot({path:`${artifactDir}/fourth-reveal-mobile.png`});
        await button.click();
        assert.equal(await page.locator('.clue-note:visible').count(),0);
        assert.equal(await page.evaluate(()=>document.activeElement.id),`clue-${s.id}`);
      }
    }
    await page.setViewportSize({width:375,height:812});
    assert.ok((await page.locator('#clue-count').innerText()).includes('都看完了'));
    assert.ok((await page.locator('#next-action').getAttribute('class')).includes('primary'));
    // Browser back and explicit relook preserve the first submission and original content.
    await page.goBack();await hashIs(page,`#case/${c.id}`);await original(page,c);
    assert.equal(await page.locator('input[type=radio]').count(),0);
    assert.ok((await page.locator('.saved-choice').innerText()).includes(verdicts[choice]));
    await page.getByRole('link',{name:'回到解析',exact:true}).click();await hashIs(page,`#review/${c.id}`);
    assert.equal(await page.locator('.footer:visible').count(),0,'案件頁不顯示關於');
    await page.reload();await hashIs(page,`#review/${c.id}`);
    assert.equal(await page.locator('#choice-feedback').innerText(),c.feedback[choice]);
    assert.equal(await page.locator('.chat-head a,.chat-head button').count(),0,'聊天室標題列不放返回或回首頁');
    if(i===5)assert.equal(await page.locator('#next-action').innerText(),'領取通關卡 →');
    if(i===1){const ids=c.segments.filter(s=>s.id).map(s=>s.id);await page.locator(`#clue-${ids[0]}`).click();await page.locator(`#clue-${ids[1]}`).click();assert.equal(await page.locator('.clue-note:visible').count(),1,'點別條線索，前一條要收起');assert.equal(await page.locator(`#clue-${ids[0]}`).getAttribute('aria-expanded'),'false');await page.locator(`#clue-${ids[1]}`).click();}
    await page.locator('.actionbar a').click();
  }
  await hashIs(page,'#finish');assert.equal(await page.locator('table,.message,.feedback').count(),0);
  const personaTitle=await page.evaluate(()=>persona()[0]);
  const finishText=await page.locator('#finish-card').getAttribute('alt');assert.ok(finishText.includes(personaTitle));
  // 稱號用和程式不同的寫法重算：同分時用總分取餘數決定哪一軸，六軸全滿另有稱號。
  const expectedPersona=()=>page.evaluate(()=>{const scores=SCENARIOS.map(scoreOf),sum=scores.reduce((a,b)=>a+b,0);if(scores.every(x=>x===100))return TOP_PERSONA[0];const top=Math.max(...scores),tied=SCENARIOS.filter((c,i)=>scores[i]===top);return PERSONAS[tied[sum%tied.length].angle][0];});
  assert.equal(personaTitle,await expectedPersona());
  await page.evaluate(()=>{window.keep=JSON.stringify(state);for(const c of SCENARIOS){state.cases[c.id].submitted=c.answer;state.cases[c.id].seen=c.segments.filter(s=>s.id).map(s=>s.id);}});assert.equal(await page.evaluate(()=>persona()[0]),await page.evaluate(()=>TOP_PERSONA[0]),'六軸全滿是局長');await page.evaluate(()=>{state=JSON.parse(window.keep);});
  assert.equal((await page.locator('#share-status').innerText()).trim(),'','沒操作前通關頁沒有多餘的說明文字');assert.equal(await page.locator('.footer:visible').count(),1);
  await page.waitForFunction(()=>{const img=document.getElementById('finish-card');return img.complete&&img.naturalWidth>0;});
  const poster=await page.evaluate(()=>{const img=document.getElementById('finish-card');const r=img.getBoundingClientRect(),b=document.getElementById('share-card').getBoundingClientRect();return {w:img.naturalWidth,h:img.naturalHeight,same:img.src===cardData,buttonBottom:b.bottom,width:r.width};});
  assert.deepEqual([poster.w,poster.h,poster.same],[1080,1640,true],'畫面上是不帶 QR 的通關卡');assert.ok(poster.buttonBottom<812,'分享按鈕要在第一屏');
  // 實際解碼海報上的 QR：必須回到公開入口的首頁。沒有 BarcodeDetector 的環境要明講沒驗到。
  const decoded=await page.evaluate(async()=>{if(!('BarcodeDetector'in window))return null;const read=async el=>(await new BarcodeDetector({formats:['qr_code']}).detect(el)).map(x=>x.rawValue);const blank=document.createElement('canvas');blank.width=blank.height=300;blank.getContext('2d').fillRect(0,0,300,300);return {card:await read(await createImageBitmap(shareFile)),shown:await read(document.getElementById('finish-card')),blank:await read(blank)};});
  assert.ok(decoded,'此環境沒有 BarcodeDetector，無法驗證海報 QR；請換用 macOS 的 Chrome 執行');
  assert.deepEqual(decoded.blank,[],'空白圖不該解出 QR');assert.deepEqual(decoded.shown,[],'畫面上的通關卡不帶 QR');assert.deepEqual(decoded.card,[await page.evaluate(()=>GAME_URL)],'海報 QR 要解出遊戲入口');reports.push('海報 QR 實際解碼');
  const expectedFull=cases.reduce((sum,c,i)=>sum+[50,30,10][Math.abs(i%3-c.answer)]+50,0);
  assert.equal(await page.evaluate(()=>totalScore()),expectedFull,'線索全看完的總分');assert.ok(finishText.includes(`${expectedFull}／600`));
  await page.reload();await page.locator('#finish-card').waitFor();assert.equal(await page.locator('#finish-card').getAttribute('alt'),finishText);
  await page.screenshot({path:`${artifactDir}/finish-mobile.png`,fullPage:true});
  // Select the non-native branch explicitly; still use the real browser clipboard.
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('#share-card').click();await page.waitForFunction(()=>document.getElementById('share-status').textContent.includes('已複製'));
  const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(copied.includes(personaTitle));assert.ok(copied.includes('／600'));assert.ok(!copied.includes('127.0.0.1'));assert.ok(copied.endsWith(await page.evaluate(()=>GAME_URL)),'分享文字帶公開入口');assert.equal(copied.split('\n').length,3,'分享文字只有三行');
  const downloadPromise=page.waitForEvent('download');await page.locator('#save-card').click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),`茶訊調查局-${personaTitle}.png`);await download.saveAs(`${artifactDir}/通關卡.png`);
  for(const viewport of [{width:320,height:568},{width:560,height:720},{width:1280,height:900}]){await page.setViewportSize(viewport);await noOverflow(page);}
  await page.locator('#restart-game').click();await hashIs(page,'#home');assert.equal(await page.getByRole('link',{name:'開始調查',exact:true}).count(),1,'重玩回到首頁');
  assert.ok((await page.evaluate(()=>Object.values(state.cases))).every(p=>p.selected===null&&p.submitted===null));
  await page.goBack();assert.ok(!page.url().endsWith('#finish'),'重玩後不能用返回領取舊通關卡');
  await context.close();reports.push('六案依序／來源／原答案／各線索／返回／重載／通關海報／真實剪貼簿／PNG');
  // Every case x all three choices, including zero opened clues and repeated submit.
  for(let choice=0;choice<3;choice++){
    const {page,context}=await newPage();await loaded(page,`#case/${cases[0].id}`);
    for(const c of cases){
      await page.locator(`#verdict-${choice}`).check();
      await page.evaluate(()=>{document.getElementById('case-form').requestSubmit();document.getElementById('case-form')?.requestSubmit();});
      await hashIs(page,`#review/${c.id}`);assert.equal(await page.locator('#choice-feedback').innerText(),c.feedback[choice]);
      assert.equal(await page.locator('.clue-note:visible').count(),0);
      await page.locator('.actionbar a').click();
    }
    await hashIs(page,'#finish');
    assert.equal(await page.evaluate(()=>totalScore()),cases.reduce((sum,c)=>sum+[50,30,10][Math.abs(choice-c.answer)],0),'沒看線索的總分只算判斷');
    // Returning from the finish card to collect clues raises that angle's score.
    if(choice===0){await page.goto(base+`/#review/${cases[0].id}`);await hashIs(page,`#review/${cases[0].id}`);for(const s of cases[0].segments.filter(s=>s.id))await page.locator(`#clue-${s.id}`).click();assert.equal(await page.locator('#next-action').innerText(),'回通關卡 →');await page.locator('#next-action').click();await hashIs(page,'#finish');assert.equal(await page.evaluate(()=>scoreOf(SCENARIOS[0])),100);}
    await context.close();
  }
  reports.push('18 組實際提交回饋／零提示門檻／連續提交／補看線索加分');
  // Native share success, cancellation and failure; no automatic send.
  for(const mode of ['success','cancel','fail']){
    const {page,context}=await newPage();
    await page.addInitScript(mode=>{
      window.shareCalls=[];
      Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shareCalls.push({text:data.text,fileCount:data.files?.length||0});if(mode==='cancel')throw new DOMException('cancel','AbortError');if(mode==='fail')throw new Error('failed');}});
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      if(mode==='fail')Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied');}}});
    },mode);
    // Seed only already-complete session for this branch; primary story above completes through UI.
    await loaded(page);
    await page.evaluate(()=>{const s=freshState();for(const p of Object.values(s.cases)){p.selected=2;p.submitted=2;}localStorage.setItem(STORAGE_KEY,JSON.stringify(s));});
    await page.reload();await loaded(page,'#finish');await hashIs(page,'#finish');assert.ok(await page.evaluate(()=>shareFile!==null),'通關按鈕出現時 PNG 必須已備妥');
    assert.equal(await page.evaluate(()=>shareCalls.length),0);
    await page.locator('#share-card').click();assert.deepEqual(await page.evaluate(()=>shareCalls.map(c=>c.fileCount)),mode==='fail'?[1,0]:[1],'帶圖分享失敗要改用文字再試一次');
    if(mode==='fail'){await page.locator('#share-fallback').waitFor({state:'visible'});const text=await page.locator('#share-copy').inputValue();assert.ok(text.includes(await page.evaluate(()=>persona()[0])));assert.equal(text.split('\n').length,3,'分享文字只有三行');}
    if(mode==='cancel')assert.equal(await page.locator('#share-fallback:visible').count(),0);
    await context.close();
  }
  reports.push('系統分享成功／取消／失敗與可選取文字退路');
  // LINE 內建瀏覽器不能下載：存成圖片改成跳出分享圖讓人長按儲存，不觸發下載。
  {
    const {page,context}=await newPage({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0'});
    await loaded(page);
    await page.evaluate(()=>{const s=freshState();for(const p of Object.values(s.cases)){p.selected=2;p.submitted=2;}localStorage.setItem(STORAGE_KEY,JSON.stringify(s));});
    await page.reload();await loaded(page,'#finish');await hashIs(page,'#finish');
    let downloaded=false;page.on('download',()=>{downloaded=true;});
    await page.locator('#save-card').click();await page.locator('#save-view').waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>document.querySelector('#save-view img').src===shareData&&shareData.startsWith('data:image/png')),'跳出的是帶 QR 的分享圖');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'save-close');
    await page.waitForTimeout(300);assert.equal(downloaded,false,'內建瀏覽器不觸發下載');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#save-view').count(),0);
    await page.locator('#save-card').click();await page.locator('#save-close').click();assert.equal(await page.locator('#save-view').count(),0);
    await context.close();
  }
  reports.push('LINE 內建瀏覽器長按存圖');
  // Corrupt / older / blocked storage and keyboard navigation.
  for(const mode of ['corrupt','old','blocked']){
    const {page,context}=await newPage();
    await page.addInitScript(mode=>{if(mode==='blocked'){Object.defineProperty(Storage.prototype,'getItem',{value:()=>{throw new Error('blocked');}});Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new Error('blocked');}});}else localStorage.setItem('tea-investigation:v4',mode==='corrupt'?'{bad':JSON.stringify({v:3,cases:{}}));},mode);
    await loaded(page,`#case/${cases[5].id}`);await hashIs(page,`#case/${cases[0].id}`);
    await musicClearOfContent(page);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'verdict-0');
    await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');assert.ok(await page.locator('#verdict-1').isChecked());
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'submit-case');
    await page.keyboard.press('Enter');await hashIs(page,`#review/${cases[0].id}`);
    if(mode==='blocked'){assert.ok(await page.locator('#storage-notice').isVisible());for(const c of cases.slice(1)){await page.locator('.actionbar a').click();await page.locator('#verdict-2').check();await page.locator('#submit-case').click();await hashIs(page,`#review/${c.id}`);}await page.locator('.actionbar a').click();await hashIs(page,'#finish');}
    await context.close();
  }
  reports.push('損壞／舊存檔／停用儲存仍可走完全程／鍵盤');
  assert.deepEqual(failures,[],'瀏覽器執行錯誤');
  console.log('PASS：'+reports.join('；')+'。\n截圖與實際 PNG：'+artifactDir);
}finally{await browser.close();}
