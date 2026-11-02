import {chromium} from 'playwright';
import assert from 'node:assert/strict';

async function main(){
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--no-sandbox']:[]});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),user=await context.newPage(),admin=await context.newPage();
  const base=process.env.BASE_URL??'http://127.0.0.1:3000';
  await user.goto(base);await user.getByLabel('Token de acceso').fill('K8P2');await user.getByRole('button',{name:'Ingresar →'}).click();await user.getByRole('button',{name:'Iniciar el camino →'}).click();await user.getByRole('button',{name:'Mapa completo',exact:true}).click();
  const selectPlace=async(name:string)=>{await user.getByRole('searchbox',{name:'Ir a un edificio'}).fill(name);await user.getByRole('button',{name:`Seleccionar lugar: ${name}`,exact:true}).click();};
  await selectPlace('TICs');const projects=user.getByRole('list',{name:'Proyectos del edificio'});assert.ok((await projects.innerText()).includes('Desarrollo Web'));assert.ok((await projects.innerText()).includes('Ciberseguridad'));
  await admin.goto(base+'/admin');await admin.getByLabel('Token de acceso').fill('ADM1');await admin.getByRole('button',{name:'Ingresar →'}).click();const nav=(name:string)=>admin.getByRole('navigation',{name:'Administración local'}).getByRole('button',{name,exact:true});
  for(const name of ['Rifa','Respuestas'])assert.equal(await nav(name).count(),0);
  await nav('Usuarios').click();for(const name of ['Asignación: Ana Rodríguez','Ver respuestas: Ana Rodríguez','Editar: Ana Rodríguez','Eliminar: Ana Rodríguez'])assert.equal(await admin.getByRole('button',{name,exact:true}).count(),1);
  if(process.env.UNIFIED_SCREENSHOTS)await admin.screenshot({path:process.env.UNIFIED_SCREENSHOTS+'-users-desktop.png'});
  await admin.getByRole('button',{name:'Asignación: Ana Rodríguez',exact:true}).click();assert.equal(await nav('Usuarios').getAttribute('aria-current'),'page');assert.equal(await admin.getByLabel('Participante para asignar retos').count(),0);await admin.getByRole('button',{name:'Volver a usuarios',exact:true}).click();
  await nav('Proyectos').click();await admin.getByRole('button',{name:'Nuevo proyecto',exact:true}).click();await admin.getByLabel('Nombre del proyecto',{exact:true}).fill('Proyecto de mapa en vivo');await admin.getByLabel('Especialidad',{exact:true}).selectOption('Desarrollo Web');await admin.getByLabel('Nivel del proyecto',{exact:true}).selectOption('11');await admin.getByLabel('Descripción',{exact:true}).fill('Proyecto para probar la actualización del mapa.');await admin.getByRole('button',{name:'Guardar cambios',exact:true}).click();await projects.getByText('Proyecto de mapa en vivo',{exact:true}).waitFor();assert.ok((await projects.locator('li').filter({hasText:'Proyecto de mapa en vivo'}).innerText()).includes('Undécimo'));
  await admin.getByRole('button',{name:'Editar: Proyecto de mapa en vivo',exact:true}).click();await admin.getByLabel('Especialidad',{exact:true}).selectOption('Electromecánica');await admin.getByLabel('Disponible para nuevas asignaciones').uncheck();await admin.getByRole('button',{name:'Guardar cambios',exact:true}).click();await projects.getByText('Proyecto de mapa en vivo',{exact:true}).waitFor({state:'hidden'});await selectPlace('Electromecánica');await projects.getByText('Proyecto de mapa en vivo',{exact:true}).waitFor();assert.ok((await projects.locator('li').filter({hasText:'Proyecto de mapa en vivo'}).innerText()).includes('No disponible para nuevas visitas'));
  await selectPlace('Iglesia');await user.getByText('No hay proyectos registrados en este edificio.',{exact:true}).waitFor();await selectPlace('TICs');
  if(process.env.UNIFIED_SCREENSHOTS)await user.screenshot({path:process.env.UNIFIED_SCREENSHOTS+'-map-desktop.png'});
  await admin.setViewportSize({width:390,height:844});await user.setViewportSize({width:390,height:844});await nav('Usuarios').click();if(process.env.UNIFIED_SCREENSHOTS)await admin.screenshot({path:process.env.UNIFIED_SCREENSHOTS+'-users-mobile.png'});await user.locator('.campus-building-projects').scrollIntoViewIfNeeded();if(process.env.UNIFIED_SCREENSHOTS)await user.screenshot({path:process.env.UNIFIED_SCREENSHOTS+'-map-mobile.png'});
  for(const page of [admin,user]){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  console.log('PASS unified navigation, per-user actions, TICs shared specialties, all building projects, create/move/closure updates across tabs, empty state and responsive layouts');await context.close();
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
