import { projectLabel } from '@/lib/taxonomy';
import type { LocalData, LocalProgress } from '@/lib/local-game';
import { AppIcon } from './icons';
const dateFormat = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' });
export function VoteHistory({ data, votes }: { data: LocalData; votes: LocalProgress['votes'] }) {
  const groups = new Map<string, { count: number; last: string }>();
  for (const vote of votes) {
    const previous = groups.get(vote.projectId);
    groups.set(vote.projectId, { count: (previous?.count ?? 0) + 1, last: previous && previous.last > vote.at ? previous.last : vote.at });
  }
  return <ul className="vote-history">{[...groups].sort((a, b) => b[1].last.localeCompare(a[1].last)).map(([id, group]) => {
    const project = data.projects.find(p => p.id === id);
    return <li key={id}><AppIcon name="votes" width="19" height="19"/><div className="voted-project"><h3>{project?.name ?? 'Proyecto no disponible'}</h3><span>{project ? projectLabel(project) : 'Área no disponible'}</span><time dateTime={group.last}>Último voto: {Number.isNaN(Date.parse(group.last)) ? 'Fecha no disponible' : dateFormat.format(new Date(group.last))}</time></div><strong className="vote-total">{group.count} {group.count === 1 ? 'voto' : 'votos'}<small>de tu parte</small></strong></li>;
  })}</ul>;
}
