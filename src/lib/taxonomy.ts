export const roles = [
  { value: 'admin', label: 'Admin' }, { value: 'visitor', label: 'Visitante' },
  { value: 'pasitos', label: 'Pasitos' }, { value: 'school', label: 'Escuela' },
  { value: 'third_cycle', label: 'Tercer ciclo' }, { value: 'fourth_cycle', label: 'Cuarto ciclo' }
] as const;
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
  const old: Record<string,string> = { 'tics': 'Desarrollo Web', 'dibujo y modelado': 'Dibujo y Modelado de Edificaciones', 'diseno grafico': 'Diseño Gráfico Multimedia' };
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

export const admissionRoles = ['pasitos','school','third_cycle','fourth_cycle'] as const;
export const isAdmissionRole = (role: string) => admissionRoles.some(value=>value===role);
