import type { LocalData } from '@/lib/local-game';
import { rankProjects } from '@/lib/project-ranking';
import { projectLabel } from '@/lib/taxonomy';

type Ranked = ReturnType<typeof rankProjects<LocalData['projects'][number]>>;
export function VisitorProjectLeaders({ ranked }: { ranked: Ranked }) {
  const leaders=ranked.filter(project=>project.votes>0).slice(0,3);
  const total=ranked.reduce((sum,project)=>sum+project.votes,0);
  return <section className="visitor-project-leaders" aria-label="Top 3 de proyectos">
    <header><h2>Los más votados</h2><p>Top 3 · {total} {total===1?'voto':'votos'}</p></header>
    {leaders.length?<ol>{leaders.map(project=><li key={project.id} data-project-id={project.id}>
      <span className="visitor-leader-rank">{project.rank}.º<small>{project.tied?'Empate':'Lugar'}</small></span>
      <div><h3>{project.name}</h3><p>{projectLabel(project)}</p></div>
      <strong>{project.votes}<small>{project.votes===1?'voto':'votos'}</small></strong>
    </li>)}</ol>:<p className="visitor-ranking-empty">El top 3 aparecerá con el primer voto. ¡Apoya a tu proyecto favorito!</p>}
    {leaders.some(project=>project.tied)&&<p className="visitor-ranking-tie">Los empates comparten posición; se muestran por nombre.</p>}
  </section>;
}
