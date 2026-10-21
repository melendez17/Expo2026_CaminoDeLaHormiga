import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { DEMO_CATALOG } from '../src/lib/demo';
import type { VisitorState } from '../src/lib/contracts';
async function main(){
const base=process.env.BASE_URL??'http://localhost:3000';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--no-sandbox']:[]});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('.campus-map image')!==null);
 assert.equal(await page.locator('.challenge-card').count(),5);assert.equal(await page.getByRole('button',{name:'Comenzar →'}).isDisabled(),true);
 await page.getByRole('button',{name:'⌖ Ubicación'}).first().click();assert.equal(await page.locator('.selected-zone').count(),1);assert.equal(await page.locator('.map-toolbar strong').innerText(),'Centro infantil Pasitos Pequeños');
 await page.getByRole('button',{name:'2D',exact:true}).click();assert.equal(await page.locator('.segmented button[aria-pressed=true]').innerText(),'2D');assert.equal(await page.locator('.selected-zone').count(),1);
 await page.getByRole('button',{name:'Agenda',exact:true}).click();await page.getByRole('button',{name:'CEDES Radio',exact:true}).click();assert.match(await page.locator('.empty').innerText(),/programación/);
 await page.getByRole('button',{name:'Mis tiquetes',exact:true}).click();assert.equal(await page.locator('.badge').count(),5);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 const csrf=await context.request.post(base+'/api/auth/activate',{headers:{Origin:'https://untrusted.invalid'},data:{token:'K8P2'}});assert.equal(csrf.status(),403);
 const unauthorized=await context.request.get(base+'/api/admin/report');assert.equal(unauthorized.status(),401);
 await page.goto(base+'/admin');assert.equal(await page.getByRole('heading',{name:'Iniciar sesión'}).count(),1);
 console.log('PASS real UI: mobile map, selection, 2D, tabs, overflow, admin login and API authorization');
 await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'2D',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.campus-map image')?.getAttribute('href')==='/campus/map-2d.jpg');
 assert.equal(await page.evaluate(async()=>{const r=await fetch('/campus/map-2d.jpg');return r.ok;}),true);
 await context.setOffline(false);console.log('PASS service worker: offline reload and cached maps');
 await context.close();
 // Fixture API only for client queue behavior. SQL business rules are tested separately.
 const fixture=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const client=await fixture.newPage();
 const state:VisitorState={id:'00000000-0000-4000-8000-000000009999',kind:'applicant',firstName:'Ana',activatedAt:new Date().toISOString(),routeCompletedAt:null,admissionCompletedAt:null,surveySubmitted:false,completed:[],assigned:DEMO_CATALOG.challenges.map(c=>c.id),tickets:[]};
 let activated=false,reachable=true,submitted=0;
 await client.route('**/api/catalog',route=>route.fulfill({json:{...DEMO_CATALOG,configured:true}}));
 await client.route('**/api/me',route=>activated?route.fulfill({json:state}):route.fulfill({status:401,json:{error:'Activa tu token.'}}));
 await client.route('**/api/auth/activate',route=>{activated=true;return route.fulfill({json:state});});
 await client.route('**/api/completions',async route=>{if(!reachable)return route.abort('internetdisconnected');const input=route.request().postDataJSON();assert.equal(input.participantId,state.id);submitted++;state.completed.push(input.challengeId);await route.fulfill({json:{result:{completed:true},state}});});
 await client.goto(base);await client.getByLabel('Tu token de 4 caracteres').fill('K8P2');await client.getByRole('button',{name:'Comenzar →'}).click();await client.getByRole('heading',{name:'¡Hola, Ana!'}).waitFor();
 reachable=false;await client.getByRole('button',{name:'Responder →'}).first().click();await client.getByLabel('Nombre del proyecto').fill('Proyecto del agua');await client.getByLabel('Nivel',{exact:true}).fill('Quinto');await client.getByLabel('¿Qué descubriste?').fill('Aprendí a cuidar el agua con sensores.');await client.getByRole('button',{name:'Guardar respuesta'}).click();await client.getByRole('heading',{name:'Respuestas por sincronizar (1)'}).waitFor();
 await client.reload();await client.getByRole('heading',{name:'Respuestas por sincronizar (1)'}).waitFor();assert.equal(state.tickets.length,0);assert.equal(submitted,0);
 reachable=true;await client.getByRole('button',{name:'Sincronizar ahora',exact:true}).click();await client.waitForFunction(()=>!document.querySelector('.pending'));assert.equal(submitted,1);await client.waitForFunction(()=>document.querySelectorAll('.challenge-card.done').length===1);
 console.log('PASS client queue with fixture API: persistent draft after reload, no local reward, sync and confirmed completion');
 assert.deepEqual(errors,[]);await fixture.close();
}finally{await browser.close();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
