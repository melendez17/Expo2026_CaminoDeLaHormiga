import type { ReactNode } from 'react';
import { AntMascot } from './ant-mascot';

export function LoadingScreen({ message = 'Preparando tu próximo descubrimiento…', busy = true, children }: { message?: string; busy?: boolean; children?: ReactNode }) {
  return <main className="local-loading" aria-busy={busy}>
    <AntMascot className="loading-mascot" priority />
    <div className="loading-copy">
      <h1>El camino de <span>la hormiga.</span></h1>
      <p role="status">{message}</p>
    </div>
    {children}
  </main>;
}
