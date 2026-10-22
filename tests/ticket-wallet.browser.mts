import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completeLocal, freshProgress, localDataSchema, storageKey, type LocalProgress } from '../src/lib/local-game';
const keys = ['users', 'projects', 'challenges', 'agenda', 'settings'];
const data = localDataSchema.parse(Object.fromEntries(keys.map(key => [key, JSON.parse(readFileSync(`public/data/${key}.json`, 'utf8'))])));
let progress: LocalProgress = { ...freshProgress(data, 'ana'), startedAt: new Date().toISOString() };
for (const c of data.challenges.filter(c => c.isBase)) {
  const answers: Record<string,string> = c.kind === 'freeform' ? { projectName: 'Proyecto', level: 'Quinto', description: 'Aprendí sobre tecnología y sensores.' } : { code: c.code!, ...Object.fromEntries((c.questions ?? []).map(q => [q.id, String(q.correctIndex)])) };
  progress = completeLocal(data, progress, c.id, answers);
}
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({headless:true, executablePath:executable,args:executable ? ['--no-sandbox'] : []});
try {
for (const width of [1280,390]) {
  const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const admin = await context.newPage(), person = await context.newPage();
  const errors: string[] = []; for (const p of [admin,person]) p.on('pageerror',e=>errors.push(e.message));
  await person.goto(base);
  await person.evaluate(({key,progress})=>localStorage.setItem(key,JSON.stringify(progress)),{key:storageKey(data,'ana'),progress});
  await person.getByLabel('Token de acceso').fill('K8P2'); await person.getByRole('button',{name:'Ingresar →'}).click();
  await person.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Mi resumen',exact:true}).click();
  const wallet=person.getByRole('region',{name:'Mis tiquetes'});
  await wallet.getByText('K8P2 1',{exact:true}).waitFor();
  await admin.goto(base + '/admin'); await admin.getByLabel('Token de acceso').fill('ADM1'); await admin.getByRole('button',{name:'Ingresar →'}).click();
  const nav=admin.getByRole('navigation',{name:'Administración local'});
  await nav.getByRole('button',{name:'Usuarios',exact:true}).click();
  await admin.getByRole('button',{name:'Ver tiquetes: Ana Rodríguez',exact:true}).click();
  const owned=admin.getByRole('region',{name:'Tiquetes de Ana Rodríguez'});
  await owned.getByText('K8P2 1',{exact:true}).waitFor();
  await nav.getByRole('button',{name:/Rifa/}).click();
  await admin.getByLabel('Token del participante').fill('K8P2');
  await admin.getByRole('button',{name:'Registrar tiquete',exact:true}).click();
  await wallet.getByText('K8P2 2',{exact:true}).waitFor();
  assert.equal(await person.getByTestId('ticket-count').innerText(),'2');
  assert.equal(await person.getByTestId('available-votes').innerText(),'2');
  assert.equal(await nav.getByRole('button',{name:'Respuestas',exact:true}).count(),0);
  assert.equal(await nav.getByRole('button',{name:'Tiquetes',exact:true}).count(),0);
  assert.equal(await wallet.getByText('Digital',{exact:true}).count(),1);
  assert.equal(await wallet.getByText('Manual',{exact:true}).count(),1);
  await admin.getByRole('button',{name:'Sortear ganador'}).click();
  await wallet.getByText('Ganador',{exact:true}).waitFor();
  assert.equal(await wallet.locator('.ticket-codes li').count(),2);
  await nav.getByRole('button',{name:'Usuarios',exact:true}).click();
  await admin.getByRole('button',{name:'Ver tiquetes: Ana Rodríguez',exact:true}).click();
  await owned.getByText('K8P2 2',{exact:true}).waitFor();
  assert.deepEqual(await owned.locator('.ticket-codes strong').allTextContents(),await wallet.locator('.ticket-codes strong').allTextContents());
  await person.reload(); await person.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Mi resumen',exact:true}).click();
  await wallet.getByText('K8P2 2',{exact:true}).waitFor();
  assert.equal(await person.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await wallet.screenshot({path:`work/wallet-${width}.png`}); await admin.screenshot({path:`work/admin-tickets-${width}.png`,fullPage:true});
  await admin.getByRole('button',{name:'Ver respuestas',exact:true}).click();
  await admin.getByRole('heading',{name:'Respuestas por participante',exact:true}).waitFor();
  assert.equal(await admin.getByLabel('Seleccionar participante').count(),0);
  await admin.getByRole('button',{name:'Volver a usuarios',exact:true}).click();
  await admin.getByRole('button',{name:'Ver tiquetes: Ana Rodríguez',exact:true}).waitFor();
  // A manual ticket is visible even before this other participant starts the route.
  await nav.getByRole('button',{name:/Rifa/}).click(); await admin.getByLabel('Token del participante').fill('M4T7'); await admin.getByRole('button',{name:'Registrar tiquete',exact:true}).click();
  await person.getByRole('button',{name:'Salir',exact:true}).click(); await person.getByLabel('Token de acceso').fill('M4T7'); await person.getByRole('button',{name:'Ingresar →'}).click();
  await wallet.getByText('M4T7 1',{exact:true}).waitFor();
  assert.equal(await wallet.getByText('K8P2 1',{exact:true}).count(),0);
  await person.getByRole('button',{name:'Iniciar el camino →'}).click();
  const personNav=person.getByRole('navigation',{name:'Navegación principal'});
  await personNav.getByRole('button',{name:'Mi resumen',exact:true}).click();
  assert.equal(await person.getByTestId('available-votes').innerText(),'1');
  await personNav.getByRole('button',{name:'Votar',exact:true}).click();
  await person.getByRole('button',{name:'Dar 1 voto',exact:true}).first().click();
  await person.getByRole('button',{name:'Confirmar voto',exact:true}).click();
  await person.getByRole('button',{name:'Dar 1 voto',exact:true}).first().waitFor();
  assert.equal(await person.getByRole('button',{name:'Dar 1 voto',exact:true}).first().isDisabled(),true);
  await person.reload(); await personNav.getByRole('button',{name:'Mi resumen',exact:true}).click();
  assert.equal(await person.getByTestId('available-votes').innerText(),'0');
  await wallet.getByText('M4T7 1',{exact:true}).waitFor();
  await nav.getByRole('button',{name:'Usuarios',exact:true}).click();
  await admin.getByRole('button',{name:'Ver tiquetes: Carlos Méndez',exact:true}).click();
  await admin.getByText('M4T7 1',{exact:true}).waitFor();
  assert.ok((await admin.getByRole('region',{name:'Tiquetes de Carlos Méndez'}).innerText()).includes('Votos disponibles: 0'));

  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}: user detail buttons, shared ticket codes, manual voting, overspend prevention, reload and ownership`);
  await context.close();
}
} finally { await browser.close(); }
