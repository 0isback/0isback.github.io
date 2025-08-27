// atlas.js
import * as THREE from 'three';

export function makeBlockAtlas(){
  const tile = 16;
  const cols = 10;                 // ← 5 → 10으로 확장
  const w = tile * cols, h = tile;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const xctx = c.getContext('2d', { willReadFrequently:true });

  // grass_top (0)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const v=(Math.random()*0.08-0.04); const g=Math.max(0,Math.min(1,0.6+v));
    xctx.fillStyle=`rgb(${30+70*g|0},${100+120*g|0},${30+70*g|0})`;
    xctx.fillRect(x+tile*0,y,1,1);
  }
  // grass_side (1)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const col = y<6 ? `rgb(${50+(x%2)*10},${110+((x+y)%3)*8},${40+(x%3)*8})`
                    : `rgb(${102+((x+y)%3)*7},${82+((x+y)%2)*6},${48+((x+y)%4)*6})`;
    xctx.fillStyle=col; xctx.fillRect(x+tile*1,y,1,1);
  }
  // dirt (2)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    xctx.fillStyle=`rgb(${102+(x%4)*6},${72+((x*y)%3)*5},${40+((x+y)%5)*6})`;
    xctx.fillRect(x+tile*2,y,1,1);
  }
  // log (3)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const base=90+((x+y)%4)*8; xctx.fillStyle=`rgb(${base+20},${base-10},${base-30})`;
    xctx.fillRect(x+tile*3,y,1,1);
  }
  // leaves_summer / green (4)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const a=0.85+(Math.random()*0.1);
    xctx.fillStyle=`rgba(${60+(x%5)*10},${150+((x+y)%6)*8},${60+(y%5)*10},${a})`;
    xctx.fillRect(x+tile*4,y,1,1);
  }
  // ★ leaves_spring_pink (5)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const a=0.85+(Math.random()*0.1);
    xctx.fillStyle=`rgba(${220+((x+y)%5)*6},${120+((x*y)%3)*5},${180+((x+y)%6)*6},${a})`;
    xctx.fillRect(x+tile*5,y,1,1);
  }
  // ★ leaves_autumn_red (6)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const a=0.85+(Math.random()*0.1);
    xctx.fillStyle=`rgba(${190+((x+y)%8)*8},${40+((x*y)%4)*8},${30+((x+y)%5)*6},${a})`;
    xctx.fillRect(x+tile*6,y,1,1);
  }
  // ★ leaves_autumn_yellow (7)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const a=0.85+(Math.random()*0.1);
    xctx.fillStyle=`rgba(${220+((x+y)%6)*6},${170+((x*y)%6)*6},${40+((x+y)%4)*6},${a})`;
    xctx.fillRect(x+tile*7,y,1,1);
  }
  // ★ leaves_winter_snowy (8) : 짙은 잎 + 흰 점(눈)
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
    const a=0.9;
    xctx.fillStyle=`rgba(${40+(x%5)*8},${80+((x+y)%6)*8},${40+(y%5)*8},${a})`;
    xctx.fillRect(x+tile*8,y,1,1);
    if ((x+y)%7===0) { // 눈 알갱이
      xctx.fillStyle='rgba(255,255,255,0.95)';
      xctx.fillRect(x+tile*8,y,1,1);
    }
  }
  // snow_top (9) : 거의 순백색
  for(let y=0;y<tile;y++) for(let x=0;x<tile;x++){
  const g = 250 + ((x+y)%5);   // 250~255
  xctx.fillStyle = `rgb(${g},${g},${g})`;
  xctx.fillRect(x+tile*9,y,1,1);
  // 작은 점무늬 효과
  if ((x*y)%17===0) {
    xctx.fillStyle = 'rgb(255,255,255)';
    xctx.fillRect(x+tile*9,y,1,1);
  }
}

  const toUV = col => ({ u0:(col*tile)/w, v0:0, u1:((col+1)*tile)/w, v1:1 });
  return {
    canvas:c,
    tiles:{
      grass_top:toUV(0),
      grass_side:toUV(1),
      dirt:toUV(2),
      log:toUV(3),
      leaves:toUV(4),                 // summer/green
      leaves_pink:toUV(5),
      leaves_red:toUV(6),
      leaves_yellow:toUV(7),
      leaves_snow:toUV(8),
      snow_top:toUV(9)
    }
  };
}

// 기존 생성 함수는 그대로 유지
export function makeBoxWithAtlasUV(sx, sy, sz, maps){
  const g = new THREE.BoxGeometry(sx, sy, sz);
  setBoxUVFaces(g, maps);
  return g;
}

// ★ 추가: 이미 만들어진 박스 지오메트리의 UV만 교체
export function setBoxUVFaces(g, maps){
  const uv = g.getAttribute('uv');
  const faceStart = { right:0, left:4, top:8, bottom:12, front:16, back:20 };
  const rectTop = maps.top, rectBottom = maps.bottom, rectSides = maps.sides;

  function setFace4(start, rect){
    uv.setXY(start+0, rect.u1, rect.v1);
    uv.setXY(start+1, rect.u0, rect.v1);
    uv.setXY(start+2, rect.u1, rect.v0);
    uv.setXY(start+3, rect.u0, rect.v0);
  }
  setFace4(faceStart.right , rectSides);
  setFace4(faceStart.left  , rectSides);
  setFace4(faceStart.top   , rectTop);
  setFace4(faceStart.bottom, rectBottom);
  setFace4(faceStart.front , rectSides);
  setFace4(faceStart.back  , rectSides);
  uv.needsUpdate = true;
  return g;
}
