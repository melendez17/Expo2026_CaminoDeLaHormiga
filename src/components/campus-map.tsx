'use client';
import { useState } from 'react';
import campus from '@/lib/campus.json';
const names:Record<string,string>=campus.names;
const polygons=campus.polygons as Record<string,Record<string,number[][]>>;
function area(points:number[][]){return Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);}
function inside(points:number[][],x:number,y:number){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function CampusMap({selected,onSelect}:{selected:string|null;onSelect:(id:string|null)=>void}){
 const [view,setView]=useState('3d');const [width,height]=view==='3d'?[1600,1050]:[1500,1064];
 const points=selected?polygons[view][selected]:null;
 return <section className="map-panel" aria-label="Mapa del campus"><div className="map-toolbar"><div><span className="eyebrow">TU PRÓXIMA PARADA</span><strong aria-live="polite">{selected?names[selected]:'Explora el campus'}</strong></div><div className="segmented">{['3d','2d'].map(v=><button key={v} aria-pressed={v===view} onClick={()=>setView(v)}>{v.toUpperCase()}</button>)}</div></div>
 <svg className="campus-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Mapa ${view}. ${selected?names[selected]:'Selecciona un edificio'}`} onClick={e=>{
  const point=e.currentTarget.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const matrix=e.currentTarget.getScreenCTM();if(!matrix)return;const local=point.matrixTransform(matrix.inverse());
  const hits=Object.entries(polygons[view]).filter(([,p])=>inside(p,local.x,local.y)).sort((a,b)=>area(a[1])-area(b[1]));onSelect(hits[0]?.[0]??null);
 }}>
 <defs><clipPath id="selected-zone">{points&&<polygon points={points.map(p=>p.join(',')).join(' ')}/>}</clipPath></defs>
 <image href={`/campus/map-${view}.jpg`} width={width} height={height} style={{filter:points?'grayscale(1) brightness(.76)':'none'}}/>
 {points&&<><image href={`/campus/map-${view}.jpg`} width={width} height={height} clipPath="url(#selected-zone)"/><polygon className="selected-zone" points={points.map(p=>p.join(',')).join(' ')}/></>}
 </svg><label className="map-select">Ir a un edificio<select value={selected??''} onChange={e=>onSelect(e.target.value||null)}><option value="">Todos los lugares</option>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></section>;
}
