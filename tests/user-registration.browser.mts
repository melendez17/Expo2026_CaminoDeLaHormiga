import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL ?? 'http://localhost:3000';
const executable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser=await chromium.launch({headless:true,executablePath:executable,args:executable ? ['--no-sandbox'] : []});
try {
  for(const width of [1280,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const errors:string[]=[];
    async function open() {
      const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/admin'); await page.getByLabel('Token de acceso').fill('ADM1'); await page.getByRole('button',{name:'Ingresar →'}).click();
      await page.getByRole('navigation',{name:'Administración local'}).getByRole('button',{name:'Usuarios',exact:true}).click();
      await page.getByRole('button',{name:'Nuevo usuario',exact:true}).click();
      return page;
    }
    const first=await open(), second=await open();
    assert.equal(await first.locator('.admin-editor form input').count(),3);
    assert.equal(await first.getByLabel('Token de cuatro caracteres').count(),0);
    await first.getByLabel('Número de cédula').fill('000000001'); await first.getByLabel('Nombre completo').fill('Persona Uno'); await first.getByLabel('Tipo de usuario').selectOption('visitor');
    await first.screenshot({path:`work/registration-${width}.png`,fullPage:true});
    assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await second.getByLabel('Número de cédula').fill('000000002'); await second.getByLabel('Nombre completo').fill('Persona Dos'); await second.getByLabel('Tipo de usuario').selectOption('applicant'); await second.getByLabel('Correo electrónico (opcional)').fill('persona@example.com');
    await Promise.all([first.getByRole('button',{name:'Generar usuario',exact:true}).click(),second.getByRole('button',{name:'Generar usuario',exact:true}).click()]);
    await first.getByRole('status').filter({hasText:'Usuario generado:'}).waitFor(); await second.getByRole('status').filter({hasText:'Usuario generado:'}).waitFor();
    // The other renderer's localStorage cache updates when its storage event arrives.
    await first.waitForFunction(() => { const users=JSON.parse(localStorage.getItem('camino-local-catalog-v1')!).users; return users.some((u: {nationalId?:string})=>u.nationalId==='000000001') && users.some((u: {nationalId?:string})=>u.nationalId==='000000002'); });
    const users=await first.evaluate(()=>JSON.parse(localStorage.getItem('camino-local-catalog-v1')!).users as {id:string;name:string;nationalId?:string;token:string;email?:string;kind:string}[]);
    const one=users.find(u=>u.nationalId==='000000001')!, two=users.find(u=>u.nationalId==='000000002')!;
    assert.ok(one&&two, JSON.stringify(users.map(u=>({name:u.name,nationalId:u.nationalId,token:u.token,kind:u.kind})))); assert.match(one.token,/^\d{4}$/); assert.match(two.token,/^\d{4}$/); assert.notEqual(one.token,two.token);
    assert.equal(new Set(users.map(u=>u.token)).size,users.length); assert.equal(one.email,''); assert.equal(two.email,'persona@example.com'); assert.equal(one.kind,'visitor'); assert.equal(two.kind,'applicant');
    await first.getByRole('button',{name:'Nuevo usuario',exact:true}).click(); await first.getByLabel('Número de cédula').fill('0-0000-0001'); await first.getByLabel('Nombre completo').fill('Duplicada'); await first.getByLabel('Tipo de usuario').selectOption('visitor'); await first.getByRole('button',{name:'Generar usuario',exact:true}).click();
    await first.getByRole('alert').filter({hasText:'esa cédula'}).waitFor();
    await first.getByRole('button',{name:'Cancelar edición',exact:true}).click(); await first.getByRole('button',{name:'Editar: Persona Uno',exact:true}).click();
    assert.equal(await first.getByLabel('Número de cédula').inputValue(),'000000001'); assert.equal(await first.locator('input[name=token]').count(),0);
    await first.getByRole('button',{name:'Guardar cambios',exact:true}).click(); await first.getByRole('heading',{name:'Persona Uno',exact:true}).waitFor();
    await first.reload(); await first.getByRole('navigation',{name:'Administración local'}).getByRole('button',{name:'Usuarios',exact:true}).click(); await first.getByRole('heading',{name:'Persona Uno',exact:true}).waitFor();
    const person=await context.newPage(); await person.goto(base); await person.getByLabel('Token de acceso').fill(one.token); await person.getByRole('button',{name:'Ingresar →'}).click(); await person.getByRole('heading',{name:'Bienvenido, Persona.',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}: ID/name/optional email and visitor/applicant type, concurrent unique tokens, duplicate ID rejection, editing, persistence and numeric-token login`);
    await context.close();
  }
} finally {await browser.close();}
