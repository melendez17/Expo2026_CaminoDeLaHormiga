import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeTickets, participantStatus, csvCell, registrationInput } from '../src/lib/contracts';
test('cinco base y cada par extra; extras no premian antes de la ruta',()=>{
 assert.equal(routeTickets(4,6),0);assert.equal(routeTickets(5,0),1);assert.equal(routeTickets(5,1),1);assert.equal(routeTickets(5,2),2);assert.equal(routeTickets(5,5),3);
});
test('completado prevalece incluso en pasaporte físico sin activación',()=>{
 assert.equal(participantStatus({activated_at:null,route_completed_at:null}),'Sin Activar');
 assert.equal(participantStatus({activated_at:'now',route_completed_at:null}),'En Proceso');
 assert.equal(participantStatus({activated_at:null,route_completed_at:'now'}),'Completado');
});
test('registro exige consentimiento y campos de cada público',()=>{
 const base={name:'Ana Prueba',email:'ana@example.test',consent:true};
 assert.equal(registrationInput.safeParse({...base,kind:'applicant'}).success,false);
 assert.equal(registrationInput.safeParse({...base,kind:'visitor'}).success,false);
 assert.equal(registrationInput.safeParse({...base,kind:'applicant',identityNumber:'123456789'}).success,true);
 assert.equal(registrationInput.safeParse({...base,kind:'visitor',phone:'88888888'}).success,true);
 assert.equal(registrationInput.safeParse({...base,consent:false,kind:'visitor',phone:'88888888'}).success,false);
});
test('CSV neutraliza fórmulas y conserva comillas',()=>{
 assert.equal(csvCell(' =HYPERLINK("x")'),'"\' =HYPERLINK(""x"")"');assert.equal(csvCell('Ana, María'),'"Ana, María"');
});
