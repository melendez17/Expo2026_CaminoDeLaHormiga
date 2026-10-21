'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import campus from '@/lib/campus.json';
import { initialMapCamera, clampMapCamera, zoomMapCamera, type MapCamera } from '@/lib/map-viewport';
const names: Record<string,string> = campus.names;
const polygons = campus.polygons as Record<string,Record<string,number[][]>>;
type Point = { x: number; y: number };
function area(points:number[][]) { return Math.abs(points.reduce((s,p,i) => { const q=points[(i+1)%points.length]; return s+p[0]*q[1]-q[0]*p[1]; },0)/2); }
function inside(points:number[][],x:number,y:number) { let hit=false; for(let i=0,j=points.length-1;i<points.length;j=i++) { const a=points[i],b=points[j]; if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) hit=!hit; } return hit; }
export function CampusMap({ selected, onSelect, explorer = false }: { selected:string|null; onSelect:(id:string|null)=>void; explorer?:boolean }) {
  const [view,setView] = useState('3d');
  const [camera,setCamera] = useState<MapCamera>(initialMapCamera);
  const cameraRef = useRef(camera);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number,Point>());
  const gesture = useRef({ moved:false, distance:0 });
  const clipId = useId();
  const helpId = useId();
  const [width,height] = view === '3d' ? [1600,1050] : [1500,1064];
  const points = selected ? polygons[view][selected] : null;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const matrix = svg!.getScreenCTM();
      const anchor = matrix ? new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()) : undefined;
      const next = zoomMapCamera(cameraRef.current,Math.exp(-event.deltaY*.005),width,height,anchor);
      cameraRef.current = next; setCamera(next);
    }
    svg.addEventListener('wheel',wheel,{passive:false});
    return () => svg.removeEventListener('wheel',wheel);
  }, [width,height]);
  function update(next: MapCamera) { cameraRef.current = next; setCamera(next); }
  function zoom(factor:number, anchor?:Point) { update(zoomMapCamera(cameraRef.current,factor,width,height,anchor)); }
  function mapPoint(svg:SVGSVGElement, point:Point) {
    const matrix=svg.getScreenCTM();
    if(!matrix) return null;
    return new DOMPoint(point.x,point.y).matrixTransform(matrix.inverse());
  }
  function move(e:ReactPointerEvent<SVGSVGElement>) {
    const previous=pointers.current.get(e.pointerId);
    if(!previous) return;
    const before=[...pointers.current.values()];
    const next={x:e.clientX,y:e.clientY};
    pointers.current.set(e.pointerId,next);
    const after=[...pointers.current.values()];
    gesture.current.distance += Math.hypot(next.x-previous.x,next.y-previous.y);
    if(gesture.current.distance>5 || after.length>1) gesture.current.moved=true;
    if(after.length>1 && before.length>1) {
      const center=(p:Point[])=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2});
      const oldPoint=mapPoint(e.currentTarget,center(before)), newPoint=mapPoint(e.currentTarget,center(after));
      if(!oldPoint || !newPoint) return;
      const oldDistance=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y);
      const distance=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);
      const panned=clampMapCamera({...cameraRef.current,x:cameraRef.current.x+oldPoint.x-newPoint.x,y:cameraRef.current.y+oldPoint.y-newPoint.y},width,height);
      update(zoomMapCamera(panned,oldDistance>0?distance/oldDistance:1,width,height,oldPoint));
    } else if(cameraRef.current.scale>1) {
      const a=mapPoint(e.currentTarget,previous), b=mapPoint(e.currentTarget,next);
      if(a && b) update(clampMapCamera({...cameraRef.current,x:cameraRef.current.x+a.x-b.x,y:cameraRef.current.y+a.y-b.y},width,height));
    }
  }
  function endPointer(e:ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return <section className={`map-panel ${explorer ? 'explorer-map-panel' : ''}`} aria-label="Mapa del campus">
    <div className="map-toolbar"><div><span className="eyebrow">TU PRÓXIMA PARADA</span><strong aria-live="polite">{selected?names[selected]:'Explora el campus'}</strong></div><div className="segmented">{['3d','2d'].map(v=><button key={v} aria-pressed={v===view} onClick={()=>{ setView(v); update(initialMapCamera); pointers.current.clear(); }}>{v.toUpperCase()}</button>)}</div></div>
    <div className={`map-viewport ${camera.scale>1 ? 'is-zoomed' : ''}`} style={{aspectRatio:`${width}/${height}`}}>
      <svg ref={svgRef} className="campus-map" viewBox={`${camera.x} ${camera.y} ${width/camera.scale} ${height/camera.scale}`} preserveAspectRatio="xMidYMid slice" role="img" tabIndex={0} aria-describedby={helpId} aria-label={`Mapa ${view}. ${selected?names[selected]:'Selecciona un edificio'}`}
        onPointerDown={e=>{ if(e.button!==0) return; if(!pointers.current.size) gesture.current={moved:false,distance:0}; pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY}); if(pointers.current.size>1) gesture.current.moved=true; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={move} onLostPointerCapture={e=>pointers.current.delete(e.pointerId)} onPointerUp={endPointer} onPointerCancel={e=>{gesture.current.moved=true;endPointer(e);}}
        onKeyDown={e=>{
          if(e.key==='+' || e.key==='=') {e.preventDefault();zoom(1.4);}
          else if(e.key==='-') {e.preventDefault();zoom(1/1.4);}
          else if(e.key==='0') {e.preventDefault();update(initialMapCamera);}
          else if(camera.scale>1 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {e.preventDefault();update(clampMapCamera({...cameraRef.current,x:cameraRef.current.x+(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0)*width/camera.scale*.12,y:cameraRef.current.y+(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)*height/camera.scale*.12},width,height));}
        }}

        onClick={e=>{
          if(gesture.current.moved) return;
          const local=mapPoint(e.currentTarget,{x:e.clientX,y:e.clientY});if(!local)return;
          const hits=Object.entries(polygons[view]).filter(([,p])=>inside(p,local.x,local.y)).sort((a,b)=>area(a[1])-area(b[1]));onSelect(hits[0]?.[0]??null);
        }}>
        <defs><clipPath id={clipId}>{points&&<polygon points={points.map(p=>p.join(',')).join(' ')}/>}</clipPath></defs>
        <image href={`/campus/map-${view}.jpg`} width={width} height={height} style={{filter:points||explorer?'grayscale(1) brightness(.8)':'none'}}/>
        {points&&<><image href={`/campus/map-${view}.jpg`} width={width} height={height} clipPath={`url(#${clipId})`}/><polygon className="selected-zone" points={points.map(p=>p.join(',')).join(' ')}/></>}
      </svg>
      <div className="map-zoom-controls" role="group" aria-label="Zoom del mapa"><button aria-label="Acercar mapa" title="Acercar mapa" disabled={camera.scale>=4} onClick={()=>zoom(1.4)}>+</button><button aria-label="Alejar mapa" title="Alejar mapa" disabled={camera.scale<=1} onClick={()=>zoom(1/1.4)}>−</button><button className="map-zoom-reset" aria-label="Restablecer zoom del mapa" title="Restablecer zoom" disabled={camera.scale<=1} onClick={()=>update(initialMapCamera)}>{Math.round(camera.scale*100)}%</button></div>
    </div>
    <p className="sr-only" id={helpId}>Usa los botones de zoom o pellizca con dos dedos. Con zoom, arrastra para moverte. Con el teclado: + y − para zoom, flechas para moverte y 0 para restablecer.</p>
    {!explorer&&<label className="map-select">Ir a un edificio<select value={selected??''} onChange={e=>onSelect(e.target.value||null)}><option value="">Todos los lugares</option>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
    {explorer&&<div className="map-explorer-legend"><span><i/>Zona seleccionada</span><span>Toca un edificio para explorarlo</span></div>}
  </section>;
}
