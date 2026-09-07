import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base=process.env.DUAL_FRONTEND_TEST_URL||'http://127.0.0.1:3722';
const out=resolve('handoff/dual-frontend-qa');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const eventId='evt_e912cb05373a12af9141c910';
const keys=['ensei-user-preferences','ensei-event-plans','ensei-follows','ensei-trip-plans'];
const results=[];
async function snapshot(page){return page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),keys);}
async function mode(page,value){await page.waitForFunction(value=>document.documentElement.dataset.frontend===value,value);}
async function toggle(page,value){await page.getByTestId('frontend-switch').click();await mode(page,value);}
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'暂时跳过'}).click();
  await page.getByRole('heading',{name:'先完成眼前的动作'}).waitFor();
  await page.screenshot({path:resolve(out,`classic-${viewport.width}.png`)});
  const before=await snapshot(page);await toggle(page,'paper');
  await page.getByRole('heading',{name:/下一场心动，\s*准备好出发。/}).waitFor();assert.deepEqual(await snapshot(page),before);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='frontend-switch');
  await page.reload({waitUntil:'networkidle'});await mode(page,'paper');
  await page.screenshot({path:resolve(out,`paper-${viewport.width}.png`),fullPage:true});
  await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('dialog',{name:'全站搜索'}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'切换深色模式'}).click();assert(await page.locator('html').evaluate(e=>e.classList.contains('dark')));
  await page.screenshot({path:resolve(out,`paper-dark-${viewport.width}.png`)});
  await toggle(page,'classic');assert(await page.locator('html').evaluate(e=>e.classList.contains('dark')));await toggle(page,'paper');await page.getByRole('button',{name:'切换深色模式'}).click();
  await page.goto(`${base}/events/${eventId}?from=dual-test#plan-manager`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'加入计划',exact:true}).click();
  await page.getByRole('button',{name:'已申请此轮'}).click();
  const data=await snapshot(page);const url=page.url();await toggle(page,'classic');assert.equal(page.url(),url);assert.deepEqual(await snapshot(page),data);
  await page.locator('#plan-manager > details > summary').click();
  const record=page.locator('[data-application-id]').first();await record.getByText('申请详情与准备状态',{exact:true}).click();
  await record.getByLabel('申请私人备注').fill('切换前未保存的手账草稿');
  await toggle(page,'paper');assert.equal(await record.getByLabel('申请私人备注').inputValue(),'切换前未保存的手账草稿');
  await record.getByRole('button',{name:'保存申请详情'}).click();
  await page.goto(base+'/applications',{waitUntil:'networkidle'});await page.locator('select').selectOption('won');
  let plans=await page.evaluate(()=>JSON.parse(localStorage.getItem('ensei-event-plans')).plans);assert.equal(plans[0].applications[0].status,'won');
  const changed=await snapshot(page);await toggle(page,'classic');assert.deepEqual(await snapshot(page),changed);
  await page.goto(base+`/events/${eventId}`,{waitUntil:'networkidle'});await page.getByTestId('application-summary').getByText('中签 1 轮',{exact:true}).waitFor();
  await toggle(page,'paper');await page.goto(base+'/applications');await page.screenshot({path:resolve(out,`applications-${viewport.width}.png`)});
  for(const route of ['/events?q=森本','/trips','/me','/map','/rankings']){
   const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);await mode(page,'paper');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' horizontal overflow');
  }
  // Real storage events synchronize the preference across tabs.
  const second=await context.newPage();await second.goto(base,{waitUntil:'networkidle'});await toggle(second,'classic');await mode(page,'classic');await second.close();
  await page.evaluate(()=>localStorage.setItem('ensei-frontend','invalid'));await page.reload({waitUntil:'networkidle'});await mode(page,'classic');
  assert.deepEqual(errors,[]);results.push({viewport,passed:true,checks:['switch/reload','shared data','unsaved event form','query/hash','application status roundtrip','dark mode','routes','cross-tab','invalid preference'],errors});
  await context.close();
 }
 const context=await browser.newContext();await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Disabled','SecurityError');}});});
 const page=await context.newPage();await page.goto(base);await page.getByRole('alert').getByText('浏览器存储暂不可用').waitFor();await toggle(page,'paper');await toggle(page,'classic');await context.close();
 results.push({storageDisabled:true,passed:true});
 const full=await browser.newContext();await full.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
 const fullPage=await full.newPage();await fullPage.goto(base);await fullPage.getByRole('alert').getByText('浏览器存储暂不可用').waitFor();await toggle(fullPage,'paper');await toggle(fullPage,'classic');await full.close();results.push({storageFull:true,passed:true});
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
