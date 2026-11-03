// Legacy API v0 contracts, retained only by the dormant offline/demo adapters.
// Production API schemas live in src/lib/backend/contracts.ts.
import { z } from 'zod';
export const tokenInput = z.object({ token: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/) });
export const registrationInput = z.object({
  kind: z.enum(['applicant', 'visitor']),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().regex(/^[+\d ()-]{8,24}$/).optional(),
  identityNumber: z.string().trim().regex(/^\d{9,12}$/).optional(),
  consent: z.literal(true)
}).superRefine((v,ctx)=>{
  if(v.kind==='applicant'&&!v.identityNumber)ctx.addIssue({code:'custom',message:'La cédula es obligatoria',path:['identityNumber']});
  if(v.kind==='visitor'&&!v.phone)ctx.addIssue({code:'custom',message:'El teléfono es obligatorio',path:['phone']});
});
export const completionInput = z.object({
  requestId: z.uuid(), participantId: z.uuid(), challengeId: z.uuid(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/).optional(),
  answers: z.object({
    projectName: z.string().trim().max(160).optional(),
    level: z.string().trim().max(80).optional(),
    description: z.string().trim().max(1000).optional(),
    saint: z.string().trim().max(120).optional(),
    quiz: z.record(z.uuid(), z.number().int().min(0).max(5)).optional()
  })
});
export const surveyInput=z.object({expectations:z.string().trim().min(5).max(1000),satisfaction:z.number().int().min(1).max(5),interest:z.string().trim().min(2).max(160)});
export const voteInput=z.object({ticketId:z.uuid(),projectId:z.uuid()});
export type Challenge={id:string;title:string;description:string;building_id:string;project_id:string|null;kind:'freeform'|'quiz_code'|'code'|'saint';is_base:boolean;badge_key?:string|null};
export type Question={id:string;challenge_id:string;kind:string;prompt:string;options:string[]};
export type Project={id:string;name:string;building_id:string;description:string};
export type AgendaEvent={id:string;title:string;category:'general'|'pastoral'|'radio';building_id:string;starts_at:string;ends_at:string};
export type Catalog={configured:boolean;challenges:Challenge[];questions:Question[];projects:Project[];events:AgendaEvent[];radioUrl:string|null};
export type VisitorState={id:string;kind:'applicant'|'visitor';firstName:string;activatedAt:string|null;routeCompletedAt:string|null;admissionCompletedAt:string|null;surveySubmitted:boolean;completed:string[];assigned:string[];tickets:{id:string;source:string;spent:boolean}[]};
export function routeTickets(base:number,extra:number){return base>=5?1+Math.floor(extra/2):0;}
export function participantStatus(p:{activated_at:string|null;route_completed_at:string|null}){return p.route_completed_at?'Completado':p.activated_at?'En Proceso':'Sin Activar';}
export function csvCell(value:unknown){let s=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
