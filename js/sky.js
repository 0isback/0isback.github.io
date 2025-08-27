import * as THREE from 'three';
import { deg2rad } from './utils.js';

export function createSky(){
  const cnv=document.createElement('canvas'); cnv.width=1024; cnv.height=512;
  const ctx=cnv.getContext('2d');
  const texture=new THREE.CanvasTexture(cnv);
  texture.magFilter=texture.minFilter=THREE.LinearFilter;

  const mix=(a,b,t)=>a+(b-a)*t;
  const mix3=(c1,c2,t)=>[ mix(c1[0],c2[0],t), mix(c1[1],c2[1],t), mix(c1[2],c2[2],t) ];
  const rgb=c=>`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  const clamp01=x=>Math.min(1,Math.max(0,x));

  const DAY_TOP=[127,178,255], DAY_MID=[156,200,255], DAY_BOT=[200,227,255];
  const NGT_TOP=[ 10, 18, 28], NGT_MID=[ 16, 26, 40], NGT_BOT=[ 24, 36, 54];
  const SUNSET_TINT=[255,120,80];

  function update(sunAltRad){
    const a = clamp01((sunAltRad - deg2rad(-6)) / (deg2rad(20) - deg2rad(-6)));
    const s = 1.0 - clamp01(Math.abs(sunAltRad) / deg2rad(8));
    const topBase = mix3(NGT_TOP, DAY_TOP, a);
    let   midBase = mix3(NGT_MID, DAY_MID, a);
    let   botBase = mix3(NGT_BOT, DAY_BOT, a);
    const tintMid = mix3(midBase, SUNSET_TINT, 0.25 * s);
    const tintBot = mix3(botBase, SUNSET_TINT, 0.60 * s);

    const g = ctx.createLinearGradient(0,0,0,cnv.height);
    g.addColorStop(0.00, rgb(topBase));
    g.addColorStop(0.60, rgb(tintMid));
    g.addColorStop(1.00, rgb(tintBot));
    ctx.fillStyle=g; ctx.fillRect(0,0,cnv.width,cnv.height);
    texture.needsUpdate = true;
  }

  update(deg2rad(30));
  return { texture, update };
}
