import type { ReactNode } from 'react';

export function LoadingScreen({ message = 'Preparando tu próximo descubrimiento…', children }: { message?: string; children?: ReactNode }) {
  return <main className="local-loading">
    <img src="/brand/Copia%20de%20Hormiga.webp" width="2048" height="2048" alt="" fetchPriority="high" />
    <h1>El camino de la hormiga</h1>
    <p role="status">{message}</p>
    {children}
  </main>;
}
