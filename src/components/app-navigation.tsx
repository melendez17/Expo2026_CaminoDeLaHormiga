'use client';
import { AppIcon, type IconName } from './icons';
export function AppNavigation<T extends string>({ label, items, active, onChange, admin = false }: {
  label: string; items: readonly { id: T; title: string; icon: IconName }[];
  active: T; onChange: (id: T) => void; admin?: boolean;
}) {
  return <nav className={`local-nav app-navigation ${admin ? 'admin-navigation' : 'participant-navigation'}`} aria-label={label}>
    <div className="navigation-items">{items.map((item, index) => <button key={item.id} aria-current={active === item.id ? 'page' : undefined} onClick={() => onChange(item.id)}><span className="navigation-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="navigation-icon"><AppIcon name={item.icon}/></span><span className="navigation-label">{item.title}</span></button>)}</div>
  </nav>;
}
