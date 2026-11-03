import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasIncorrectAnswer } from '../src/lib/incorrect-answer';
import type { LocalChallenge, Answers } from '../src/lib/local-game';
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
function answers(c:LocalChallenge):Answers{return c.kind==='freeform'?{projectName:'Proyecto',level:'Décimo',description:'Descubrí una nueva manera de ayudar a nuestra comunidad.'}:c.kind==='saint'?{saintChoice:String(saintQuestion(c).correctIndex)}:{code:c.code!,...Object.fromEntries((c.questions??[]).map(q=>[q.id,String(q.correctIndex)]))};}
test('quiz fallado se sustituye en la base, bloquea reintentos y no aumenta pendientes ni premios',()=>{
 const initial={...freshProgress(data,'ana'),startedAt:new Date().toISOString()},c=data.challenges.find(c=>c.id==='tics')!;
 const wrong={...answers(c),code:'ZZZZ'},next=addExtraForWrongAnswer(data,initial,c.id,wrong,()=>0);
 assert.equal(routeChallenges(data,next).length,5);assert.equal(next.extraIds.length,0);assert.equal(next.failedExtras.length,1);assert.ok(!routeChallenges(data,next).some(task=>task.id===c.id));assert.equal(next.completed.length,0);assert.equal(summary(data,next).tickets,0);assert.deepEqual(parseProgress(data,'ana',next),next);
 assert.throws(()=>addExtraForWrongAnswer(data,next,c.id,wrong),/pendiente/);assert.throws(()=>completeLocal(data,next,c.id,answers(c)),/camino/);
 assert.throws(()=>parseProgress(data,'ana',{...next,failedExtras:[{...next.failedExtras[0],answers:answers(c)}]}),/historial/);
});
test('códigos y santos fallados se reemplazan en cadena sin acumular retos',()=>{
 let p:LocalProgress={...freshProgress(data,'ana'),startedAt:new Date().toISOString()};let c=data.challenges.find(c=>c.id==='photo')!;
 for(let i=0;i<2;i++){const wrong:Answers=c.kind==='saint'?{saintChoice:String((saintQuestion(c).correctIndex+1)%saintQuestion(c).options.length)}:{code:'ZZZZ'};p=addExtraForWrongAnswer(data,p,c.id,wrong,()=>0);assert.equal(routeChallenges(data,p).length,5);assert.equal(p.extraIds.length,0);assert.deepEqual(parseProgress(data,'ana',p),p);c=data.challenges.find(c=>c.id===p.failedExtras.at(-1)!.replacementId)!;}
 p=completeLocal(data,p,c.id,answers(c));assert.equal(p.completed.length,1);assert.equal(p.failedExtras.length,2);assert.equal(summary(data,p).tickets,0);assert.deepEqual(parseProgress(data,'ana',p),p);
});
test('admisión conserva la meta y la distribución original al sustituir una visita fallada',()=>{
 let p=startLocal(data,freshProgress(data,'sofia'),()=>.3);const original=[...p.routeIds],c=data.challenges.find(c=>c.id===original[0])!;p=addExtraForWrongAnswer(data,p,c.id,{...answers(c),code:'ZZZZ'},()=>0);assert.equal(p.routeIds.length,original.length);assert.equal(summary(data,p).baseTarget,5);assert.deepEqual(parseProgress(data,'sofia',p),p);
 for(const task of routeChallenges(data,p))p=completeLocal(data,p,task.id,answers(task));assert.equal(p.completed.length,5);assert.equal(summary(data,p).tickets,1);
});
test('catálogo agotado informa y no cambia el avance',()=>{
 const p={...freshProgress(data,'ana'),startedAt:new Date().toISOString()};p.extraIds=extraChallenges(data).filter(c=>!c.isBase).map(c=>c.id);const saved=JSON.stringify(p);assert.throws(()=>addExtraForWrongAnswer(data,p,'photo',{code:'ZZZZ'}),/No quedan retos extra/);assert.equal(JSON.stringify(p),saved);
});

test('el aviso muestra las respuestas correctas de los campos fallados',async()=>{
 const {correctAnswersForAttempt}=await import('../src/lib/incorrect-answer');assert.deepEqual(correctAnswersForAttempt(quiz,{a:'1',b:'1',code:'ZZZZ'}),[{question:'Pregunta',answer:'A'},{question:'Código del stand',answer:'T123'}]);
});
