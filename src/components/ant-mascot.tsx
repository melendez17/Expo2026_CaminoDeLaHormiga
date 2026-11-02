export const ANT_IMAGE = '/brand/Copia%20de%20Hormiga.webp';

export function AntMascot({ className = '', priority = false }: { className?: string; priority?: boolean }) {
  return <div className={`ant-mascot ${className}`} aria-hidden="true">
    <div className="ant-mascot-image"><img src={ANT_IMAGE} width="2048" height="2048" alt="" fetchPriority={priority ? 'high' : undefined} /></div>
  </div>;
}
