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
try{
  const {page,context}=await newPage();await loaded(page);
  const cases=await page.evaluate(()=>SCENARIOS),verdicts=await page.evaluate(()=>VERDICTS);
  assert.equal(verdicts.length,3);
  assert.equal(await page.locator('.case-card,table').count(),0);
  assert.equal(await page.getByRole('link',{name:'開始調查',exact:true}).count(),1);
  const start=await page.getByRole('link',{name:'開始調查',exact:true}).boundingBox();assert.ok(start.y+start.height<812,'首頁開始不在首屏');
  await page.waitForFunction(()=>[...document.querySelectorAll('.bubble')].every(b=>getComputedStyle(b).opacity==='1'),null,{timeout:5000});await noOverflow(page);
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
    assert.equal(await page.locator('#submit-case').innerText(),'你怎麼看？');
    await page.locator(`#verdict-${choice}`).check();
    if(i===0){await page.reload();await page.locator(`#verdict-${choice}`).waitFor();assert.ok(await page.locator(`#verdict-${choice}`).isChecked());}
    assert.equal(await page.locator('#submit-case').innerText(),'送出判斷');
    const choices=await page.locator('.choices').boundingBox();assert.ok(choices.height<=70,`選項應只佔一列 ${choices.height}`);
    await page.locator('#submit-case').click();await hashIs(page,`#review/${c.id}`);
    assert.equal(await page.locator('#choice-feedback').innerText(),c.feedback[choice]);
    assert.ok((await page.locator('#verdict-compare').innerText()).includes(`調查局${choice===c.answer?'都':''}選「${verdicts[c.answer]}」`));
    assert.equal(await page.locator('.feedback').count(),2,'解析只有看法和做法兩個區塊');
    assert.deepEqual(await page.evaluate(()=>[...new Set([...document.querySelectorAll('.feedback:first-of-type p,.feedback:first-of-type p span')].map(e=>getComputedStyle(e).fontSize+getComputedStyle(e).color))].length),1,'第一塊內文只有一種字級與顏色');
    if(i===0){const first=page.locator(`#clue-${c.segments.find(s=>s.id).id}`);const line=await page.evaluate(()=>{const t=document.querySelector('.message-text');return {h:t.getBoundingClientRect().height,lh:parseFloat(getComputedStyle(t).lineHeight)};});assert.ok(Math.abs(line.h/line.lh-Math.round(line.h/line.lh))<.05,`線索不可撐高行距 ${JSON.stringify(line)}`);await first.focus();await page.keyboard.press('Enter');assert.equal(await first.getAttribute('aria-expanded'),'true');await page.keyboard.press('Space');assert.equal(await first.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.clue.seen').count(),1);await page.evaluate(id=>{state.cases[id].seen=[];save();},c.id);await page.reload();await hashIs(page,`#review/${c.id}`);}
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
          const b=document.getElementById(`clue-${id}`).getBoundingClientRect(),n=document.getElementById(`hint-${id}`).getBoundingClientRect(),a=document.querySelector('.actionbar').getBoundingClientRect();
          return {button:{x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom},note:{y:n.y,bottom:n.bottom,height:n.height},limit:a.top};
        },s.id);
        assert.ok(geometry.button.width>=44&&geometry.button.height>=44,`線索觸控區 ${c.id}/${s.id}`);
        assert.ok(geometry.button.y>=0&&geometry.note.bottom<=geometry.limit+1,`提示不可被操作列遮住 ${c.id}/${s.id} ${width}: ${JSON.stringify(geometry)}`);
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
    assert.equal(await page.locator('a').filter({hasText:'返回'}).count(),0);
    await page.locator('.actionbar a').click();
  }
  await hashIs(page,'#finish');assert.equal(await page.locator('table,.message,.feedback').count(),0);
  const finishText=await page.locator('#finish-card').innerText();assert.ok(finishText.includes('茶訊拆招員'));
  assert.equal(await page.locator('#finish-card svg.radar .radar-area').count(),1);assert.equal(await page.locator('.recap').count(),0);assert.equal(await page.locator('.footer:visible').count(),1);
  const expectedFull=cases.reduce((sum,c,i)=>sum+[50,30,10][Math.abs(i%3-c.answer)]+50,0);
  assert.equal(await page.evaluate(()=>totalScore()),expectedFull,'線索全看完的總分');assert.ok(finishText.includes(`${expectedFull}／600`));
  const labels=await page.evaluate(()=>{const box=document.querySelector('svg.radar').getBoundingClientRect();return [...document.querySelectorAll('svg.radar text')].every(t=>{const r=t.getBoundingClientRect();return r.left>=box.left-.5&&r.right<=box.right+.5&&r.top>=box.top-.5&&r.bottom<=box.bottom+.5;});});assert.ok(labels,'六角圖文字不可超出圖框');
  await page.reload();assert.equal(await page.locator('#finish-card').innerText(),finishText);
  await page.screenshot({path:`${artifactDir}/finish-mobile.png`,fullPage:true});
  // Select the non-native branch explicitly; still use the real browser clipboard.
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:undefined}));
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('#share-card').click();await page.waitForFunction(()=>document.getElementById('share-status').textContent.includes('已複製'));
  const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(copied.includes('茶訊拆招員'));assert.ok(copied.includes('／600'));assert.ok(!copied.includes('127.0.0.1'));assert.ok(!copied.includes('你的判斷'));
  const downloadPromise=page.waitForEvent('download');await page.locator('#save-card').click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'茶訊拆招員.png');await download.saveAs(`${artifactDir}/通關卡.png`);
  for(const viewport of [{width:320,height:568},{width:560,height:720},{width:1280,height:900}]){await page.setViewportSize(viewport);await noOverflow(page);}
  await page.locator('#restart-game').click();await hashIs(page,'#home');assert.equal(await page.getByRole('link',{name:'開始調查',exact:true}).count(),1,'重玩回到首頁');
  assert.ok((await page.evaluate(()=>Object.values(state.cases))).every(p=>p.selected===null&&p.submitted===null));
  await page.goBack();assert.ok(!page.url().endsWith('#finish'),'重玩後不能用返回領取舊通關卡');
  await context.close();reports.push('六案依序／來源／原答案／各線索／返回／重載／通關／真實剪貼簿／PNG');
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
    await page.evaluate(()=>{const s=freshState();for(const p of Object.values(s.cases)){p.selected=2;p.submitted=2;}s.finishLine=0;localStorage.setItem(STORAGE_KEY,JSON.stringify(s));});
    await page.reload();await loaded(page,'#finish');await hashIs(page,'#finish');assert.ok(await page.evaluate(()=>shareFile!==null),'通關按鈕出現時 PNG 必須已備妥');
    assert.equal(await page.evaluate(()=>shareCalls.length),0);
    await page.locator('#share-card').click();assert.equal(await page.evaluate(()=>shareCalls.length),1);
    assert.equal(await page.evaluate(()=>shareCalls[0].fileCount),1);
    if(mode==='fail'){await page.locator('#share-fallback').waitFor({state:'visible'});assert.ok((await page.locator('#share-copy').inputValue()).includes('茶訊拆招員'));}
    if(mode==='cancel')assert.equal(await page.locator('#share-fallback:visible').count(),0);
    await context.close();
  }
  reports.push('系統分享成功／取消／失敗與可選取文字退路');
  // Corrupt / older / blocked storage and keyboard navigation.
  for(const mode of ['corrupt','old','blocked']){
    const {page,context}=await newPage();
    await page.addInitScript(mode=>{if(mode==='blocked'){Object.defineProperty(Storage.prototype,'getItem',{value:()=>{throw new Error('blocked');}});Object.defineProperty(Storage.prototype,'setItem',{value:()=>{throw new Error('blocked');}});}else localStorage.setItem('tea-investigation:v4',mode==='corrupt'?'{bad':JSON.stringify({v:3,cases:{}}));},mode);
    await loaded(page,`#case/${cases[5].id}`);await hashIs(page,`#case/${cases[0].id}`);
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
