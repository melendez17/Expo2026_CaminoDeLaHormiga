import type { LocalData, LocalProgress } from './local-game';
export function rankProjects<T extends Pick<LocalData['projects'][number], 'id' | 'name' | 'specialty'>>(projects: T[], votes: LocalProgress['votes']) {
  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.projectId, (counts.get(vote.projectId) ?? 0) + 1);
  const sorted = projects.map(project => ({ ...project, votes: counts.get(project.id) ?? 0 })).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
  const ties = new Map<number, number>();
  for (const project of sorted) if (project.votes) ties.set(project.votes, (ties.get(project.votes) ?? 0) + 1);
  let previous = -1, rank = 0;
  return sorted.map((project, index) => {
    if (project.votes !== previous) { rank = index + 1; previous = project.votes; }
    return { ...project, rank: project.votes ? rank : null, tied: project.votes > 0 && (ties.get(project.votes) ?? 0) > 1 };
  });
}
