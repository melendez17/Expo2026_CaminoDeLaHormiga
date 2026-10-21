import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankProjects } from '../src/lib/project-ranking';
const projects = Array.from({length: 120}, (_, i) => ({ id: `p${i}`, name: `Proyecto ${String(i).padStart(3,'0')}`, specialty: 'TICs', buildingId: '17', description: 'Demo' }));
const vote = (projectId: string) => ({ projectId, at: '2026-10-21T12:00:00.000Z' });
test('ranking agrega votos repetidos y conserva los 120 proyectos sin inventar posiciones con cero votos', () => {
  const ranked = rankProjects(projects, [vote('p9'),vote('p9'),vote('p8'),vote('p7'),vote('inexistente')]);
  assert.equal(ranked.length, 120);
  assert.deepEqual(ranked.slice(0,3).map(p => [p.id,p.votes,p.rank,p.tied]), [['p9',2,1,false],['p7',1,2,true],['p8',1,2,true]]);
  assert.equal(ranked.filter(p => p.rank === null).length, 117);
  assert.equal(ranked.reduce((n,p) => n+p.votes,0),4);
});
test('ranking respeta posiciones compartidas y salta las posiciones ocupadas por empates', () => {
  const ranked = rankProjects(projects, [vote('p1'),vote('p1'),vote('p2'),vote('p2'),vote('p3')]);
  assert.deepEqual(ranked.slice(0,3).map(p => p.rank), [1,1,3]);
  assert.ok(rankProjects(projects,[]).every(p => p.rank === null && p.votes === 0 && !p.tied));
});
