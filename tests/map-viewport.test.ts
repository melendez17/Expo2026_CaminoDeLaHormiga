import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMapCamera, clampMapCamera, zoomMapCamera } from '../src/lib/map-viewport';
test('zoom conserva el punto de anclaje y limita la cámara a los bordes del mapa', () => {
  const zoomed = zoomMapCamera(initialMapCamera,2,1600,1050,{x:400,y:300});
  assert.deepEqual(zoomed,{scale:2,x:200,y:150});
  assert.equal((400-zoomed.x)/(1600/zoomed.scale),400/1600);
  assert.deepEqual(clampMapCamera({scale:2,x:-50,y:900},1600,1050),{scale:2,x:0,y:525});
  assert.deepEqual(zoomMapCamera(zoomed,.01,1600,1050),initialMapCamera);
  assert.equal(zoomMapCamera(zoomed,100,1600,1050).scale,4);
});
test('la cámara mantiene sus límites en ambas vistas tras desplazamientos y zoom repetidos', () => {
  for (const [width,height] of [[1600,1050],[1500,1064]]) {
    let camera=initialMapCamera;
    for (let i=0;i<30;i++) {
      camera=zoomMapCamera(camera,i%3?1.4:1/1.4,width,height);
      camera=clampMapCamera({...camera,x:camera.x+300,y:camera.y-50},width,height);
      assert.ok(camera.scale>=1&&camera.scale<=4);
      assert.ok(camera.x>=0&&camera.x<=width-width/camera.scale);
      assert.ok(camera.y>=0&&camera.y<=height-height/camera.scale);
    }
  }
});
