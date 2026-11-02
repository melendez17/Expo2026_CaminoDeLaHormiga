import { z } from 'zod';
import { participantAreas, specialties } from './taxonomy';
const count=z.number().int().min(0).max(20);
export const routeRuleSchema=z.object({pasitos:count,school:count,third_cycle:count,specialty:count,extra:count,own10:count,own11:count,ownAny:count,other:count}).refine(rule=>Object.values(rule).reduce((a,b)=>a+b,0)>0&&Object.values(rule).reduce((a,b)=>a+b,0)<=50,'La ruta debe tener entre 1 y 50 retos.');
export type RouteRule=z.infer<typeof routeRuleSchema>;
export const emptyRule:RouteRule={pasitos:0,school:0,third_cycle:0,specialty:0,extra:0,own10:0,own11:0,ownAny:0,other:0};
export const defaultAdmissionRules:Record<string,RouteRule>=Object.fromEntries(participantAreas.map(area=>[area.value,{...emptyRule,extra:1,...(area.value==='pasitos'?{pasitos:2,school:1,specialty:1}:area.value==='school'?{school:2,third_cycle:1,specialty:1}:area.value==='third_cycle'?{third_cycle:2,specialty:2}:{own10:1,own11:1,ownAny:1,other:1})}]));
export function legacyRule(area:string):RouteRule {
 return {...(defaultAdmissionRules[area]??emptyRule),...(area==='pasitos'?{pasitos:1,school:1,specialty:2}:area==='school'?{school:1,third_cycle:1,specialty:2}:{})};
}
export const assignmentRulesSchema=z.object({visitorBatchSize:z.number().int().min(1).max(20),admission:z.record(z.string(),routeRuleSchema)}).superRefine((value,ctx)=>{
 for(const area of participantAreas) {
  const rule=value.admission[area.value];if(!rule){ctx.addIssue({code:'custom',message:`Falta la distribución de ${area.label}.`});continue;}
  const specialty=specialties.some(s=>s.name===area.value);
  if(specialty?(rule.pasitos+rule.school+rule.third_cycle+rule.specialty)>0:(rule.own10+rule.own11+rule.ownAny+rule.other)>0)ctx.addIssue({code:'custom',message:`La distribución de ${area.label} contiene campos que no corresponden a esa área.`});
 }
 for(const key of Object.keys(value.admission))if(!participantAreas.some(a=>a.value===key))ctx.addIssue({code:'custom',message:'Hay un área desconocida en las distribuciones.'});
});
export const defaultAssignmentRules={visitorBatchSize:2,admission:defaultAdmissionRules};
export const ruleTotal=(rule:RouteRule)=>Object.values(rule).reduce((a,b)=>a+b,0);
export function ruleDescription(rule:RouteRule,area?:string) {
 const fields:[keyof RouteRule,string][]=[['pasitos','de Pasitos'],['school','de Escuela'],['third_cycle','de Tercer ciclo'],['specialty','de especialidades'],['own10',`de décimo de ${area}`],['own11',`de undécimo de ${area}`],['ownAny',`más de ${area} (décimo o undécimo)`],['other','de otras especialidades'],['extra','extra']];
 return fields.filter(([key])=>rule[key]>0).map(([key,label])=>`${rule[key]} ${label}`).join(' + ');
}
export const assignmentEditSchema=z.object({id:z.string().min(1),actorId:z.string().min(1),at:z.iso.datetime(),reason:z.string().trim().min(3).max(500),scope:z.enum(['route','extra','visitor']),fromId:z.string().nullable(),toId:z.string().nullable(),role:z.enum(['visitor','admission']),area:z.string().optional(),routeIds:z.array(z.string()).optional()});
