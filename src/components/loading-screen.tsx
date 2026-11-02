import type { ReactNode } from 'react';

export function LoadingScreen({ message = 'Preparando tu próximo descubrimiento…', busy = true, children }: { message?: string; busy?: boolean; children?: ReactNode }) {
  return <main className="local-loading" aria-busy={busy}>
    <div className="loading-mascot" aria-hidden="true">
      <div className="loading-mascot-image"><img src="/brand/Copia%20de%20Hormiga.webp" width="2048" height="2048" alt="" fetchPriority="high" /></div>
    </div>
    <div className="loading-copy">
      <h1>El camino de <span>la hormiga.</span></h1>
      <p role="status">{message}</p>
    </div>
    {children}
  </main>;
}
