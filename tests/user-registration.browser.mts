import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL ?? 'http://localhost:3000';
const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser=await chromium.launch({headless:true,executablePath:executable,args:executable ? ['--no-sandbox'] : []});
try {
  for(const width of [1280,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const errors:string[]=[];
    const documentText=' Ab-123 / Pasaporte ' + 'X'.repeat(90) + ' ';
    async function open() {
      const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/admin'); await page.getByLabel('Token de acceso').fill('ADM1'); await page.getByRole('button',{name:'Ingresar →'}).click();
      await page.getByRole('navigation',{name:'Administración local'}).getByRole('button',{name:'Usuarios',exact:true}).click();
      await page.getByRole('button',{name:'Nuevo usuario',exact:true}).click(); return page;
    }
    const first=await open(), second=await open();
    await first.getByLabel('Tipo de usuario').selectOption('visitor');
    assert.equal(await first.getByLabel('Identificación',{exact:true}).count(),0);
    assert.equal(await first.locator('.admin-editor form input').count(),2);
    assert.equal(await first.getByLabel('Token de cuatro caracteres').count(),0);
    await first.getByLabel('Nombre completo').fill('Persona Uno');
    await first.screenshot({path:`work/registration-visitor-${width}.png`,fullPage:true});
    assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await second.getByLabel('Tipo de usuario').selectOption('applicant');
    const identification=second.getByLabel('Identificación',{exact:true});
    assert.equal(await identification.getAttribute('maxlength'),null);
    assert.equal(await identification.getAttribute('pattern'),null);
    assert.equal(await second.locator('.admin-editor form input').count(),3);
    await identification.fill(documentText); await second.getByLabel('Nombre completo').fill('Persona Dos'); await second.getByLabel('Correo electrónico (opcional)').fill('persona@example.com');
    await second.screenshot({path:`work/registration-applicant-${width}.png`,fullPage:true});
    await Promise.all([first.getByRole('button',{name:'Generar usuario',exact:true}).click(),second.getByRole('button',{name:'Generar usuario',exact:true}).click()]);
    await first.getByRole('status').filter({hasText:'Usuario generado:'}).waitFor(); await second.getByRole('status').filter({hasText:'Usuario generado:'}).waitFor();
    await first.waitForFunction(()=>{const users=JSON.parse(localStorage.getItem('camino-local-catalog-v1')!).users;return users.some((u:{name:string})=>u.name==='Persona Uno')&&users.some((u:{name:string})=>u.name==='Persona Dos');});
    const readUsers=()=>first.evaluate(()=>JSON.parse(localStorage.getItem('camino-local-catalog-v1')!).users as {id:string;name:string;nationalId?:string;token:string;email?:string;kind:string}[]);
    const users=await readUsers(),one=users.find(u=>u.name==='Persona Uno')!,two=users.find(u=>u.name==='Persona Dos')!;
    assert.match(one.token,/^[0-9A-F]{4}$/); assert.match(two.token,/^[0-9A-F]{4}$/); assert.notEqual(one.token,two.token);
    assert.equal(new Set(users.map(u=>u.token)).size,users.length); assert.equal(one.nationalId,undefined); assert.equal(two.nationalId,documentText);
    assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(one.email,''); assert.equal(two.email,'persona@example.com'); assert.equal(one.kind,'visitor'); assert.equal(two.kind,'applicant');
    await first.getByRole('button',{name:'Nuevo usuario',exact:true}).click(); await first.getByLabel('Tipo de usuario').selectOption('applicant'); await first.getByLabel('Identificación',{exact:true}).fill(documentText); await first.getByLabel('Nombre completo').fill('Duplicada'); await first.getByRole('button',{name:'Generar usuario',exact:true}).click();
    await first.getByRole('alert').filter({hasText:'esa identificación'}).waitFor();
    await first.getByRole('button',{name:'Cancelar edición',exact:true}).click(); await first.getByRole('button',{name:'Editar: Persona Uno',exact:true}).click();
    assert.equal(await first.getByLabel('Identificación',{exact:true}).count(),0);
    await first.getByLabel('Tipo de usuario').selectOption('applicant');
    assert.equal(await first.locator('.admin-editor form').evaluate(form=>(form as HTMLFormElement).checkValidity()),false);
    await first.getByLabel('Identificación',{exact:true}).fill('Doc A-007 / Z');
    await first.getByRole('button',{name:'Guardar cambios',exact:true}).click(); await first.getByRole('heading',{name:'Persona Uno',exact:true}).waitFor();
    assert.equal((await readUsers()).find(u=>u.id===one.id)!.nationalId,'Doc A-007 / Z');
    await first.getByRole('button',{name:'Editar: Persona Uno',exact:true}).click(); await first.getByLabel('Tipo de usuario').selectOption('visitor');
    assert.equal(await first.getByLabel('Identificación',{exact:true}).count(),0);
    await first.getByRole('button',{name:'Guardar cambios',exact:true}).click(); await first.getByRole('heading',{name:'Persona Uno',exact:true}).waitFor();
    assert.equal((await readUsers()).find(u=>u.id===one.id)!.nationalId,undefined);
    assert.equal((await readUsers()).find(u=>u.id===one.id)!.token,one.token);
    await first.reload(); await first.getByRole('navigation',{name:'Administración local'}).getByRole('button',{name:'Usuarios',exact:true}).click(); await first.getByRole('heading',{name:'Persona Dos',exact:true}).waitFor();
    assert.equal((await readUsers()).find(u=>u.id===two.id)!.nationalId,documentText);
    const person=await context.newPage(); await person.goto(base); await person.getByLabel('Token de acceso').fill(one.token); await person.getByRole('button',{name:'Ingresar →'}).click(); await person.getByRole('heading',{name:'Bienvenido, Persona.',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}: visitor without ID, literal applicant document, concurrent unique hex tokens, optional email, type changes, persistence and login`);
    await context.close();
  }
} finally {await browser.close();}
