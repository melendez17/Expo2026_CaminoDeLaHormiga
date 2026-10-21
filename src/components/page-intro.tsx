export function PageIntro({ eyebrow, title, description, accent, sequence }: { eyebrow: string; title: string; description: string; accent?: string; sequence?: string }) {
  return <header className="page-intro"><span className="eyebrow">{sequence && <b>{sequence}<i/></b>}{eyebrow}</span><h1 aria-label={accent ? `${title} ${accent.replace(/\.$/, '')}` : undefined}>{title}{accent && <><br/><em>{accent}</em></>}</h1><p>{description}</p></header>;
}
