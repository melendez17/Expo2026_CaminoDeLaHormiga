'use client';
import type { z } from 'zod';
import type { completionInput } from './contracts';
export type Pending={id:string;participantId:string;payload:z.infer<typeof completionInput>;createdAt:number;error?:string};
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('camino-offline',1);r.onupgradeneeded=()=>{r.result.createObjectStore('completions',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const database=await open();return new Promise((resolve,reject)=>{const tx=database.transaction('completions',mode);const req=work(tx.objectStore('completions'));let value:T;req.onsuccess=()=>{value=req.result;};tx.oncomplete=()=>{database.close();resolve(value);};tx.onerror=()=>{database.close();reject(tx.error);};tx.onabort=()=>{database.close();reject(tx.error);};});
}
export const pending=()=>transaction('readonly',store=>store.getAll()) as Promise<Pending[]>;
export const removePending=(id:string)=>transaction('readwrite',store=>store.delete(id));
export const clearPending=()=>transaction('readwrite',store=>store.clear());
export async function enqueue(item:Pending){
 await transaction('readwrite',store=>store.put(item));
 if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg&&'sync' in reg)await (reg as ServiceWorkerRegistration&{sync:{register(tag:string):Promise<void>}}).sync.register('camino-completions').catch(()=>{});}
}
export async function syncPending(){
 const me=await fetch('/api/me',{cache:'no-store'});if(!me.ok)return;
 const current=await me.json();
 for(const item of await pending()){
  if(item.participantId!==current.id||item.error)continue;
  let response:Response;try{response=await fetch('/api/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.payload)});}catch{return;}
  if(response.ok)await removePending(item.id);
  else if(response.status===401||response.status===429||response.status>=500)return;
  else{const result=await response.json();await enqueue({...item,error:result.error??'No se pudo validar el reto.'});}
 }
}
