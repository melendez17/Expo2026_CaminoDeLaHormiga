import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { LocalChallenge } from '../src/lib/local-game';
const challenges: LocalChallenge[] = JSON.parse(readFileSync(new URL('../public/data/challenges.json', import.meta.url), 'utf8'));
async function main() {
  const base = process.env.BASE_URL ?? 'http://localhost:3000';
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? ['--no-sandbox'] : [] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors: string[] = [], apiCalls: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url()); });
    const nav = (name: string) => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', { name, exact: true });
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByLabel('Token de acceso').fill('ZZZZ'); await page.getByRole('button', { name: 'Ingresar →' }).click();
    await page.getByRole('alert').filter({ hasText: 'No encontramos ese token' }).waitFor();
    await page.getByLabel('Token de acceso').fill('k8p2'); await page.getByRole('button', { name: 'Ingresar →' }).click();
    await page.getByRole('heading', { name: 'Bienvenido, Ana.' }).waitFor();
    assert.equal(await page.locator('.challenge-card').count(), 0);
    await page.getByRole('button', { name: 'Iniciar el camino →' }).click();
    await page.getByRole('heading', { name: 'Tu camino, Ana.' }).waitFor();
    assert.equal(await page.locator('.challenge-card').count(), 5);
    const ratio = await page.evaluate(() => document.querySelector('.compact-map')!.getBoundingClientRect().height / document.querySelector('.route-workspace')!.getBoundingClientRect().height);
    assert.ok(ratio >= .30 && ratio <= .36, 'Map occupies approximately one third of workspace');
    await page.getByRole('button', { name: 'Ubicación: Pequeñas ideas, grandes descubrimientos', exact: true }).click();
    assert.equal(await page.locator('.map-toolbar strong').innerText(), 'Centro infantil Pasitos Pequeños');
    assert.equal(await page.locator('.selected-zone').count(), 1);
    assert.equal(await page.locator('.challenge-card').first().locator('.place-tag').count(), 1);
    assert.equal(await page.locator('.challenge-card').first().locator('button.primary-location svg').count(), 1);
    await page.getByRole('button', { name: '2D', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.campus-map image')?.getAttribute('href') === '/campus/map-2d.jpg');
    console.log('PASS JSON login, invalid token, personalized welcome, explicit start, mobile map ratio and highlight');

    async function complete(c: LocalChallenge, testWrong = false) {
      await page.getByRole('button', { name: `Responder: ${c.title}`, exact: true }).click();
      const dialog = page.getByRole('dialog');
      if (c.kind === 'freeform') {
        await dialog.getByLabel('Nombre del proyecto').fill('Proyecto del agua');
        await dialog.getByLabel('Nivel', { exact: true }).fill('Quinto');
        await dialog.getByLabel('¿Qué descubriste?').fill('Descubrí cómo cuidar el agua con sensores.');
      }
      if (c.kind === 'quiz') {
        for (const q of c.questions!) await dialog.getByRole('radio', { name: q.options[testWrong ? (q.correctIndex + 1) % q.options.length : q.correctIndex], exact: true }).check();
      }
      if (c.kind === 'saint') await dialog.getByLabel('Nombre del santo').fill(c.answer!);
      if (c.code) await dialog.getByLabel('Código del stand').fill(c.code);
      await dialog.getByRole('button', { name: 'Completar reto', exact: true }).click();
      if (testWrong) {
        await dialog.getByRole('alert').filter({ hasText: 'Hay una respuesta por revisar' }).waitFor();
        for (const q of c.questions!) await dialog.getByRole('radio', { name: q.options[q.correctIndex], exact: true }).check();
        await dialog.getByRole('button', { name: 'Completar reto', exact: true }).click();
      }
      await dialog.waitFor({ state: 'hidden' });
    }
    for (const c of challenges.filter(c => c.isBase)) await complete(c, c.kind === 'quiz');
    assert.equal(await page.locator('.challenge-card.done').count(), 5);
    await nav('Mi resumen').click();
    assert.equal(await page.getByTestId('ticket-count').innerText(), '1');
    assert.equal(await page.getByTestId('available-votes').innerText(), '1');
    await nav('Votar').click();
    await page.getByLabel('Buscar proyecto por nombre').fill('AquaSmart');
    assert.equal(await page.locator('.local-project').count(), 1);
    await page.getByRole('button', { name: 'Dar 1 voto', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar voto', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.vote-balance>b')?.textContent === '0');
    assert.equal(await page.getByRole('button', { name: 'Dar 1 voto', exact: true }).isDisabled(), true);
    await nav('Mi resumen').click();
    assert.equal(await page.getByTestId('ticket-count').innerText(), '1');
    assert.equal(await page.getByTestId('available-votes').innerText(), '0');
    await page.reload(); await nav('Mi resumen').click();
    assert.equal(await page.getByTestId('available-votes').innerText(), '0');
    console.log('PASS all five base challenges, incorrect quiz rejection, ticket award, searched vote, no double spend and reload persistence');

    await nav('Retos').click(); await page.getByRole('button', { name: /^Retos extra/ }).click();
    await page.getByRole('button', { name: 'Generar más retos', exact: true }).click();
    const extraIds = await page.evaluate(() => JSON.parse(localStorage.getItem('camino-local:demo-2026-v1:ana')!).extraIds as string[]);
    assert.equal(extraIds.length, 2);
    assert.equal(await page.getByRole('button', { name: 'Generar más retos', exact: true }).isDisabled(), true);
    for (const id of extraIds) await complete(challenges.find(c => c.id === id)!);
    await page.getByRole('button', { name: 'Generar más retos', exact: true }).click();
    assert.equal(await page.locator('.challenge-card').count(), 4);
    await nav('Mi resumen').click();
    assert.equal(await page.getByTestId('ticket-count').innerText(), '2');
    assert.equal(await page.getByTestId('available-votes').innerText(), '1');
    await page.getByLabel('¿Qué esperabas descubrir?').fill('Conocer nuevos proyectos');
    await page.getByLabel('¿Qué área te interesa?').fill('TICs');
    await page.getByRole('button', { name: 'Enviar encuesta', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=ticket-count]')?.textContent === '3');
    await page.getByText('Guardar, importar o reiniciar mi prueba', { exact: true }).click();
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportar mi progreso JSON', exact: true }).click();
    const download = await downloadPromise; const filePath = await download.path(); assert.ok(filePath);
    const exported = JSON.parse(readFileSync(filePath!, 'utf8')); assert.equal(exported.userId, 'ana');
    await page.getByLabel('Importar mi progreso JSON').setInputFiles({ name: 'otro-usuario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...exported, userId: 'carlos' })) });
    await page.getByRole('alert').filter({ hasText: 'otra persona' }).waitFor();
    await page.getByLabel('Importar mi progreso JSON').setInputFiles(filePath!);
    await page.getByRole('status').filter({ hasText: 'Progreso importado' }).waitFor();
    console.log('PASS extra rounds without repeats, pair rewards, survey bonus, JSON export/import and ownership validation');

    await nav('Agenda').click(); await page.getByRole('button', { name: 'Pastoral', exact: true }).click();
    await page.getByRole('heading', { name: 'Un momento para agradecer' }).waitFor();
    await page.getByRole('button', { name: 'Tabla', exact: true }).click();
    await page.getByRole('table').waitFor();
    assert.match(await page.getByRole('table').innerText(), /Programa del Sábado/);
    assert.equal(await page.getByRole('columnheader', { name: 'Hora', exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('button', { name: 'Tarjetas', exact: true }).click();
    await page.getByRole('button', { name: 'Ubicación: Un momento para agradecer', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.map-toolbar strong')?.textContent === 'Iglesia');
    await nav('Mapa completo').click(); await page.getByRole('combobox', { name: 'Ir a un edificio' }).selectOption('19');
    assert.equal(await page.locator('.map-toolbar strong').innerText(), 'Mecánica de Precisión');
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.getByLabel('Token de acceso').fill('M4T7'); await page.getByRole('button', { name: 'Ingresar →' }).click();
    await page.getByRole('heading', { name: 'Bienvenido, Carlos.' }).waitFor();
    await page.getByRole('button', { name: 'Iniciar el camino →' }).click(); await nav('Mi resumen').click();
    assert.equal(await page.getByTestId('ticket-count').innerText(), '0');
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.getByLabel('Token de acceso').fill('K8P2'); await page.getByRole('button', { name: 'Ingresar →' }).click();
    await nav('Mi resumen').click(); assert.equal(await page.getByTestId('ticket-count').innerText(), '3');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    console.log('PASS agenda, full map, separate users and returning-user progress');

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true); await page.reload();
    await nav('Mi resumen').click(); assert.equal(await page.getByTestId('ticket-count').innerText(), '3');
    await page.getByRole('button', { name: 'Salir', exact: true }).click();
    await page.getByLabel('Token de acceso').fill('D9C5'); await page.getByRole('button', { name: 'Ingresar →' }).click();
    await page.getByRole('heading', { name: 'Bienvenido, Diego.' }).waitFor();
    await page.getByRole('button', { name: 'Iniciar el camino →' }).click();
    await complete(challenges[0]);
    assert.deepEqual(apiCalls, []); assert.deepEqual(errors, []);
    console.log('PASS offline reload, offline new-user login and challenge completion; zero API calls and no page errors');
    if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
