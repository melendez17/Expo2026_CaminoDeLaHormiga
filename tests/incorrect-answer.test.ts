import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasIncorrectAnswer } from '../src/lib/incorrect-answer';
import type { LocalChallenge } from '../src/lib/local-game';
const quiz: LocalChallenge = { id:'test',title:'Prueba',description:'',buildingId:'17',isBase:false,kind:'quiz',code:'T123',questions:[{id:'a',prompt:'Pregunta',options:['A','B'],correctIndex:0},{id:'b',prompt:'Pregunta 2',options:['A','B'],correctIndex:1}] };
test('detecta respuestas incorrectas en quiz, código y santo; campos incompletos no son fallos',()=>{
 assert.equal(hasIncorrectAnswer(quiz,{a:'0',b:'1',code:'t123'}),false);
 assert.equal(hasIncorrectAnswer(quiz,{a:'1',b:'1',code:'T123'}),true);
 assert.equal(hasIncorrectAnswer(quiz,{a:'0',b:'1',code:'ZZZZ'}),true);
 assert.equal(hasIncorrectAnswer(quiz,{a:'0',code:'ZZZZ'}),false);
 assert.equal(hasIncorrectAnswer(quiz,{a:'0',b:'1',code:''}),false);
 assert.equal(hasIncorrectAnswer({...quiz,kind:'code'},{code:'ZZZZ'}),true);
 assert.equal(hasIncorrectAnswer({...quiz,kind:'code'},{code:'Z'}),false);
 const saint={...quiz,kind:'saint' as const,questions:[quiz.questions![0]]};
 assert.equal(hasIncorrectAnswer(saint,{saintChoice:'1'}),true);
 assert.equal(hasIncorrectAnswer(saint,{saintChoice:'0'}),false);
 assert.equal(hasIncorrectAnswer(saint,{}),false);
 assert.equal(hasIncorrectAnswer({...quiz,kind:'freeform'},{}),false);
});

import {readFileSync} from 'node:fs';
import {localDataSchema,freshProgress,startLocal,addExtraForWrongAnswer,parseProgress,completeLocal,summary,generateExtras,saintQuestion,routeChallenges,extraChallenges,type LocalProgress} from '../src/lib/local-game';
const data=localDataSchema.parse(Object.fromEntries(['users','projects','challenges','agenda','settings'].map(key=>[key,JSON.parse(readFileSync(new URL(`../public/data/${key}.json`,import.meta.url),'utf8'))])));
test('fallo de quiz genera extra antes de terminar la base, conserva ruta y no da premio',()=>{
 const initial=({...freshProgress(data,'ana'),startedAt:new Date().toISOString()});
 const c=data.challenges.find(c=>c.id==='tics')!;
 const wrong={code:c.code!,...Object.fromEntries(c.questions!.map((q,i)=>[q.id,String(i===0?(q.correctIndex+1)%q.options.length:q.correctIndex)]))};
 const next=addExtraForWrongAnswer(data,initial,c.id,wrong,()=>0);
 assert.deepEqual(next.routeIds,initial.routeIds);assert.deepEqual(routeChallenges(data,next),routeChallenges(data,initial));
 assert.equal(next.extraIds.length,1);assert.equal(next.completed.length,0);assert.equal(summary(data,next).tickets,0);
 assert.deepEqual(parseProgress(data,'ana',next),next);
 assert.equal(next.failedAnswers[0].challengeId,c.id);assert.deepEqual(next.failedAnswers[0].answers,wrong);
 const again=addExtraForWrongAnswer(data,next,c.id,wrong,()=>0);assert.equal(again.extraIds.length,2);assert.equal(new Set(again.extraIds).size,2);assert.equal(again.failedAnswers.length,2);assert.deepEqual(parseProgress(data,'ana',again),again);
 assert.throws(()=>parseProgress(data,'ana',{...next,failedAnswers:[]}),/base no están completos/);
 assert.throws(()=>parseProgress(data,'ana',{...next,failedAnswers:[{...next.failedAnswers[0],answers:{...wrong,code:c.code!,...Object.fromEntries(c.questions!.map(q=>[q.id,String(q.correctIndex)]))}}]}),/historial/);
});
test('fallo de código genera extra; completar después no borra el intento y no duplica premios',()=>{
 let p:LocalProgress=({...freshProgress(data,'ana'),startedAt:new Date().toISOString()});const c=data.challenges.find(c=>c.id==='photo')!;
 const failed=addExtraForWrongAnswer(data,p,c.id,{code:'ZZZZ'},()=>0);
 p=completeLocal(data,failed,c.id,{code:c.code!});assert.equal(p.failedAnswers.length,1);assert.equal(p.completed.length,1);assert.equal(summary(data,p).tickets,0);assert.deepEqual(parseProgress(data,'ana',p),p);
 assert.throws(()=>addExtraForWrongAnswer(data,p,c.id,{code:'ZZZZ'}),/pendiente/);
 assert.throws(()=>addExtraForWrongAnswer(data,failed,c.id,{code:''}),/incorrecta válida/);
 assert.throws(()=>addExtraForWrongAnswer(data,failed,'pasitos',{}),/incorrecta válida/);
});
test('extra de santo obtenido por fallo puede reemplazarse sin bloquear el progreso inicial',()=>{
 const p=({...freshProgress(data,'ana'),startedAt:new Date().toISOString()});
 const c=data.challenges.find(c=>c.id==='photo')!;
 const next=addExtraForWrongAnswer(data,p,c.id,{code:'ZZZZ'},()=>0);
 const saint=data.challenges.find(c=>c.id===next.extraIds[0])!;assert.equal(saint.kind,'saint');
 const q=saintQuestion(saint);
 const replaced=addExtraForWrongAnswer(data,next,saint.id,{saintChoice:String((q.correctIndex+1)%q.options.length)},()=>0);
 assert.equal(replaced.failedExtras.length,1);assert.deepEqual(parseProgress(data,'ana',replaced),replaced);
});
test('catálogo agotado informa y no cambia el avance',()=>{
 const p=({...freshProgress(data,'ana'),startedAt:new Date().toISOString()});p.extraIds=extraChallenges(data).filter(c=>!c.isBase).map(c=>c.id);
 const saved=JSON.stringify(p);assert.throws(()=>addExtraForWrongAnswer(data,p,'photo',{code:'ZZZZ'}),/No quedan retos extra/);assert.equal(JSON.stringify(p),saved);
});
