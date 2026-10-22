import ExcelJS from 'exceljs';
import { adminRows, type StorageReader } from './local-admin';
import type { LocalData } from './local-game';
import { challengeAnswers } from './participant-answers';
const zone = 'America/Costa_Rica';
function dateText(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-CR', { dateStyle: 'short', timeStyle: 'medium', timeZone: zone }).format(date);
}
function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number)[][], widths: number[]) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = headers.map((header, i) => ({ header, width: widths[i] ?? 24 }));
  for (const row of rows) sheet.addRow(row);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: headers.length } };
  sheet.eachRow((row, index) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.eachCell(cell => { if (typeof cell.value === 'string') cell.numFmt = '@'; });
    if (index === 1) {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153C29' } };
      row.height = 32;
    }
  });
  return sheet;
}
export function buildParticipantWorkbook(data: LocalData, storage: StorageReader) {
  const participants = adminRows(data, storage);
  const invalid = participants.filter(row => row.error);
  if (invalid.length) throw Error(`No se pudo exportar. Revisa el progreso guardado de: ${invalid.map(row => row.user.name).join(', ')}.`);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ExpoTEC';
  workbook.created = new Date();
  const identityHeaders = ['Nombre completo', 'Tipo de usuario', 'Identificación', 'Correo electrónico', 'Token'];
  const identity = (row: typeof participants[number]) => [row.user.name, row.user.kind === 'applicant' ? 'Postulante (nuevo ingreso)' : 'Visitante', row.user.kind === 'applicant' ? row.user.nationalId ?? '' : '', row.user.email ?? '', row.user.token];
  addSheet(workbook, 'Usuarios', [...identityHeaders, 'Estado del recorrido', 'Participación registrada', 'Retos base completados', 'Retos base pendientes', 'Retos extra completados', 'Inicio del recorrido (Costa Rica)', 'Último reto realizado (Costa Rica)', 'Encuesta', 'Admisión completada', 'Tiquetes digitales', 'Tiquetes manuales', 'Votos emitidos', 'Votos disponibles'], participants.map(row => {
    const p = row.progress!, stats = row.stats!;
    const state = stats.routeComplete ? 'Completado' : !p.startedAt ? 'Sin activar' : p.completed.length ? 'En proceso' : 'Activado sin retos';
    const last = p.completed.map(record => record.at).filter(value => !Number.isNaN(Date.parse(value))).sort((a,b) => Date.parse(b) - Date.parse(a))[0];
    return [...identity(row), state, p.startedAt || stats.manualTickets > 0 ? 'Sí' : 'No', stats.base, 5 - stats.base, stats.extra, dateText(p.startedAt), dateText(last), p.survey ? 'Completada' : 'Pendiente', row.user.kind === 'applicant' ? stats.routeComplete && p.survey ? 'Sí' : 'No' : 'No aplica', stats.digitalTickets, stats.manualTickets, p.votes.length, stats.votesAvailable];
  }), [30,28,30,32,12,24,24,20,20,20,28,28,18,22,18,18,18,18]);
  const headers = [...identityHeaders, 'Reto', 'Estado del reto', 'Pregunta', 'Respuesta', 'Realizado (Costa Rica)'];
  const baseRows: (string | number)[][] = [], extraRows: (string | number)[][] = [];
  const surveyRows: (string | number)[][] = [];
  for (const row of participants) {
    const p = row.progress!;
    for (const challenge of data.challenges.filter(c => c.isBase || p.extraIds.includes(c.id))) {
      const record = p.completed.find(completed => completed.challengeId === challenge.id);
      for (const detail of challengeAnswers(challenge, record?.answers)) {
        (challenge.isBase ? baseRows : extraRows).push([...identity(row), challenge.title, record ? 'Completado' : 'Pendiente', detail.question, detail.answer ?? '', dateText(record?.at)]);
      }
    }
    for (const [question, answer] of [
      ['¿Qué esperabas descubrir?', p.survey?.expectations ?? ''],
      ['¿Qué área te interesa?', p.survey?.interest ?? ''],
      ['¿Cómo fue tu experiencia?', p.survey ? `${p.survey.satisfaction} de 5` : '']
    ]) surveyRows.push([...identity(row), p.survey ? 'Completada' : 'Pendiente', question, answer]);
  }
  addSheet(workbook, 'Retos base', headers, baseRows, [30,28,30,32,12,42,20,48,65,28]);
  addSheet(workbook, 'Retos extra', headers, extraRows, [30,28,30,32,12,42,20,48,65,28]);
  addSheet(workbook, 'Encuestas', [...identityHeaders, 'Estado de la encuesta', 'Pregunta', 'Respuesta'], surveyRows, [30,28,30,32,12,24,42,65]);
  return workbook;
}
export async function participantExcel(data: LocalData, storage: StorageReader): Promise<ArrayBuffer> {
  const workbook = buildParticipantWorkbook(data, storage);
  const buffer = await workbook.xlsx.writeBuffer();
  // Copy into a browser-owned ArrayBuffer for Blob downloads in every supported runtime.
  return new Uint8Array(buffer).buffer;
}
