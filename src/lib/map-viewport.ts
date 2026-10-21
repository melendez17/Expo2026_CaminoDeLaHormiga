export type MapCamera = { x: number; y: number; scale: number };
export const initialMapCamera: MapCamera = { x: 0, y: 0, scale: 1 };
export function clampMapCamera(camera: MapCamera, width: number, height: number): MapCamera {
  const scale = Math.min(4, Math.max(1, camera.scale));
  return { scale, x: Math.max(0, Math.min(width - width / scale, camera.x)), y: Math.max(0, Math.min(height - height / scale, camera.y)) };
}
export function zoomMapCamera(camera: MapCamera, factor: number, width: number, height: number, anchor = { x: camera.x + width / camera.scale / 2, y: camera.y + height / camera.scale / 2 }): MapCamera {
  const scale = Math.min(4, Math.max(1, camera.scale * factor));
  const ratio = camera.scale / scale;
  return clampMapCamera({ scale, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio }, width, height);
}
