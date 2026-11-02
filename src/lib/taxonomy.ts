export const roles = [{value:'admin',label:'Admin'},{value:'visitor',label:'Visitante'},{value:'admission',label:'Admisión'}] as const;
export const projectCategories = [
  { value: 'pasitos', label: 'Pasitos' }, { value: 'school', label: 'Escuela' },
  { value: 'third_cycle', label: 'Tercer ciclo' }, { value: 'specialty', label: 'Especialidad' }
] as const;
export type ProjectCategory = typeof projectCategories[number]['value'];
export const specialties = [
  { name: 'Desarrollo Web', buildingId: '17' }, { name: 'Ciberseguridad', buildingId: '17' },
  { name: 'Dibujo y Modelado de Edificaciones', buildingId: '16' },
  { name: 'Diseño Gráfico Multimedia', buildingId: '18' },
  { name: 'Electromecánica', buildingId: '15' }, { name: 'Mecánica de Precisión', buildingId: '19' }
] as const;
const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function canonicalSpecialty(name: string) {
  const old: Record<string,string> = { 'ema':'Electromecánica', 'tics': 'Desarrollo Web', 'dibujo y modelado': 'Dibujo y Modelado de Edificaciones', 'diseno grafico': 'Diseño Gráfico Multimedia' };
  return old[normalized(name)] ?? specialties.find(s => normalized(s.name) === normalized(name))?.name ?? name;
}
export const roleLabel = (role: string) => roles.find(r => r.value === role)?.label ?? role;
export const categoryLabel = (category: string) => projectCategories.find(c => c.value === category)?.label ?? category;
export type ProjectLevel = number | 'preescolar';
export const levelLabel = (level:ProjectLevel) => level==='preescolar'?'Preescolar':(['','Primero','Segundo','Tercero','Cuarto','Quinto','Sexto','Séptimo','Octavo','Noveno','Décimo','Undécimo'][level]??String(level));
export function projectLabel(project: { category: ProjectCategory; specialty: string; level?:ProjectLevel }) {
  const area=project.category==='specialty'?`Especialidad · ${project.specialty}`:categoryLabel(project.category);
  return project.level===undefined?area:`${area} · ${levelLabel(project.level)}`;
}

export const isAdmissionRole = (role: string) => role === 'admission';
export const participantAreas = [
  {value:'school',label:'Escuela'},{value:'pasitos',label:'Pasitos'},{value:'third_cycle',label:'Tercer ciclo'},
  ...specialties.map(s=>({value:s.name,label:s.name}))
];
export const areaLabel = (area?:string) => participantAreas.find(a=>a.value===area)?.label ?? area ?? 'Sin área asignada';
export function canonicalArea(value:string) {
  const aliases:Record<string,string>={'escuela':'school','school':'school','pasitos':'pasitos','tercer ciclo':'third_cycle','tercer_ciclo':'third_cycle','third_cycle':'third_cycle'};
  return aliases[normalized(value)]??canonicalSpecialty(value);
}
export function routeArea(user:{area?:string}) {
  if(specialties.some(s=>s.name===user.area))return 'specialty';
  return ['school','pasitos','third_cycle'].includes(user.area??'')?user.area:undefined;
}
