'use client';
import {useEffect,useRef,useState} from 'react';
import {ACTION_FEEDBACK_EVENT} from '@/lib/action-feedback';
import {AppIcon} from './icons';
export function ActionNotifications(){
 const [notice,setNotice]=useState<{id:number;message:string}|null>(null),sequence=useRef(0);
 useEffect(()=>{const receive=(event:Event)=>{const message=(event as CustomEvent<unknown>).detail;if(typeof message==='string'){if(message.trim())setNotice({id:++sequence.current,message});else setNotice(null);}};window.addEventListener(ACTION_FEEDBACK_EVENT,receive);return()=>window.removeEventListener(ACTION_FEEDBACK_EVENT,receive);},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),10000);return()=>clearTimeout(timer);},[notice]);
 return notice?<aside key={notice.id} className="action-notification" role="status" aria-live="polite" aria-atomic="true"><AppIcon name="check"/><div><strong>Acción completada</strong><p>{notice.message}</p></div><button aria-label="Cerrar confirmación" onClick={()=>setNotice(null)}><AppIcon name="close"/></button></aside>:null;
}
