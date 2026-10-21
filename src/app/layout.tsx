import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'El camino de la hormiga · ExpoTEC',description:'Explora CEDES Don Bosco, completa retos y descubre tu próximo destino.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Camino ExpoTEC'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#173e30'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>;}
