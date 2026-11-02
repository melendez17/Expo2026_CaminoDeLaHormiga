import {chromium} from 'playwright';
import assert from 'node:assert/strict';
async function main(){
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--no-sandbox']:[]});
 try{
  const context=await browser.newContext({reducedMotion:'reduce'}),first=await context.newPage(),second=await context.newPage(),base=process.env.BASE_URL??'http://127.0.0.1:3000';
  async function login(page:typeof first){await page.goto(base+'/admin');await page.getByLabel('Token de acceso').fill('ADM1');await page.getByRole('button',{name:'Ingresar →'}).click();await page.getByRole('navigation',{name:'Administración local'}).getByRole('button',{name:'Tiquetes',exact:true}).click();}
  async function create(token:string,code:string){await first.getByLabel('Token del participante').fill(token);await first.getByRole('button',{name:'Crear',exact:true}).click();await first.getByRole('status').filter({hasText:`Tiquete ${code} creado`}).waitFor();}
  await login(first);await create('K8P2','M-K8P2-001');await create('K8P2','M-K8P2-002');await login(second);await first.getByLabel('Token del participante').fill('K8P2');await second.getByLabel('Token del participante').fill('K8P2');await Promise.all([first.getByRole('button',{name:'Crear',exact:true}).click(),second.getByRole('button',{name:'Crear',exact:true}).click()]);await first.waitForFunction(()=>JSON.parse(localStorage.getItem('camino-local:demo-2026-v1:ana')!).manualTickets.length===4);
  assert.deepEqual((await first.locator('.ticket-register code').allTextContents()).sort(),['M-K8P2-001','M-K8P2-002','M-K8P2-003','M-K8P2-004']);await create('M4T7','M-M4T7-001');await first.getByRole('button',{name:'Sortear ganador',exact:true}).click();await first.locator('.raffle-winner').waitFor();const winner=await first.locator('.raffle-winner code').innerText();assert.match(winner,/^M-(K8P2|M4T7)-00[1-4]$/);await first.reload();await first.getByRole('navigation',{name:'Administración local'}).getByRole('button',{name:'Tiquetes',exact:true}).click();assert.equal(await first.locator('.raffle-winner code').innerText(),winner);assert.equal(await first.locator('.ticket-register code').count(),5);assert.equal(await first.locator('.ticket-register tbody tr').filter({hasText:'Ganador'}).count(),1);
  console.log('PASS per-token manual sequences, concurrent admin tabs, no lost or duplicate tickets, compact winner code and reload persistence');await context.close();
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
