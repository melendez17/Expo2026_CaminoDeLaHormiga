'use client';
import { projectLabel } from '@/lib/taxonomy';
import { useState } from 'react';
import type { LocalData, LocalProgress } from '@/lib/local-game';
import { normalize } from '@/lib/local-game';
import { rankProjects } from '@/lib/project-ranking';
import { AppIcon } from './icons';
import { AdminPagination } from './admin-pagination';
export function ProjectLeaderboard({ projects, votes }: { projects: LocalData['projects']; votes: LocalProgress['votes'] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ranked = rankProjects(projects, votes);
  const podium = ranked.filter(p => p.votes > 0).slice(0, 3);
  const featured = new Set(podium.map(p => p.id));
  const list = ranked.filter(p => search ? normalize(`${p.name} ${p.specialty}`).includes(normalize(search)) : !featured.has(p.id));
  const pages = Math.max(1, Math.ceil(list.length / 10));
  const current = Math.min(page, pages);
  const totalVotes = ranked.reduce((n, p) => n + p.votes, 0);
  return <section className="project-leaderboard" aria-labelledby="ranking-title">
    <div className="ranking-heading"><h2 id="ranking-title"><span>04</span>Votos por proyecto</h2><p>{totalVotes} {totalVotes === 1 ? 'voto emitido' : 'votos emitidos'} · {projects.length} proyectos</p></div>
    {podium.length ? <div className="project-podium">{podium.map((project, index) => <article className={`podium-project podium-slot-${index + 1}`} key={project.id}>
      <div className="podium-placement"><span className="podium-medal"><AppIcon name="award" width="24" height="24"/></span><strong>{project.rank === 1 ? '1.er' : `${project.rank}.º`} lugar{project.tied && <small>Empatado</small>}</strong></div>
      <h3>{project.name}</h3><p>{projectLabel(project)}</p><div className="podium-votes"><b>{project.votes}</b><span>{project.votes === 1 ? 'voto' : 'votos'}</span><small>{Math.round(project.votes / totalVotes * 100)}% del total</small></div>
      <progress max={totalVotes} value={project.votes} aria-label={`Porcentaje de votos de ${project.name}`}/>
    </article>)}</div> : <p className="ranking-no-votes"><AppIcon name="votes"/>El podio aparecerá cuando se registre el primer voto. Por ahora, ningún proyecto tiene posición.</p>}
    {podium.some(p => p.tied) && <p className="ranking-tie-note">Los proyectos con la misma cantidad de votos comparten posición; dentro del empate se muestran por nombre.</p>}
    <div className="ranking-list-heading"><h3>{search ? 'Resultados de búsqueda' : podium.length ? 'Los demás proyectos' : 'Todos los proyectos'}</h3><label className="admin-search"><span className="sr-only">Buscar en votos por proyecto</span><AppIcon name="search"/><input type="search" placeholder="Buscar proyecto o especialidad" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></label></div>
    <ol className="compact-ranking">{list.slice((current - 1) * 10, current * 10).map(project => <li key={project.id}><span className="ranking-position">{project.rank ? `${project.rank}.º` : '—'}</span><div><h4>{project.name}</h4><p>{projectLabel(project)}{project.tied && ' · Empatado'}</p></div><strong>{project.votes}<small>{project.votes === 1 ? 'voto' : 'votos'}</small></strong></li>)}</ol>
    {!list.length && <p className="empty">{search ? 'No encontramos proyectos con esa búsqueda.' : 'Todos los proyectos con votos están destacados arriba.'}</p>}
    <AdminPagination page={current} pageCount={pages} total={list.length} size={10} onChange={setPage} label="Páginas de votos por proyecto"/>
  </section>;
}
