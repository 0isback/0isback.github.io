import * as THREE from 'three';
import { BLOCK, HALF, GROUND_Y } from './config.js';
import { makeBoxWithAtlasUV } from './atlas.js';

// ─────────────────────────────────────────────
// 메쉬 생성 (색상별 잎 메쉬 5종)
// ─────────────────────────────────────────────
export function createTreeMeshes(blockMat, atlas){
  // 통나무
  const logGeo = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, {
    top:atlas.tiles.log, bottom:atlas.tiles.log, sides:atlas.tiles.log
  });

  // 잎(색상별 UV)
  const gGeo = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, { top:atlas.tiles.leaves,        bottom:atlas.tiles.leaves,        sides:atlas.tiles.leaves        });
  const pGeo = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, { top:atlas.tiles.leaves_pink,   bottom:atlas.tiles.leaves_pink,   sides:atlas.tiles.leaves_pink   });
  const rGeo = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, { top:atlas.tiles.leaves_red,    bottom:atlas.tiles.leaves_red,    sides:atlas.tiles.leaves_red    });
  const yGeo = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, { top:atlas.tiles.leaves_yellow, bottom:atlas.tiles.leaves_yellow, sides:atlas.tiles.leaves_yellow });
  const sGeo = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, { top:atlas.tiles.leaves_snow,   bottom:atlas.tiles.leaves_snow,   sides:atlas.tiles.leaves_snow   });

  const capacity = 20000;
  const forestLogs         = new THREE.InstancedMesh(logGeo, blockMat, 8000);
  const forestLeavesGreen  = new THREE.InstancedMesh(gGeo,   blockMat, capacity);
  const forestLeavesPink   = new THREE.InstancedMesh(pGeo,   blockMat, capacity);
  const forestLeavesRed    = new THREE.InstancedMesh(rGeo,   blockMat, capacity);
  const forestLeavesYellow = new THREE.InstancedMesh(yGeo,   blockMat, capacity);
  const forestLeavesSnow   = new THREE.InstancedMesh(sGeo,   blockMat, capacity);

  // 초기 비움
  for (const m of [forestLeavesGreen, forestLeavesPink, forestLeavesRed, forestLeavesYellow, forestLeavesSnow]) {
    m.count = 0;
  }

  return {
    forestLogs,
    forestLeavesGreen,
    forestLeavesPink,
    forestLeavesRed,
    forestLeavesYellow,
    forestLeavesSnow
  };
}

const mat4 = new THREE.Matrix4();
const snap = v => Math.round(v / BLOCK) * BLOCK;

function addMatrices(inst, arr){
  let idx = inst.countUsed || 0;
  for (const p of arr){
    mat4.makeTranslation(p[0], p[1], p[2]);
    inst.setMatrixAt(idx++, mat4);
  }
  inst.countUsed = idx;
  inst.count = idx;
  inst.instanceMatrix.needsUpdate = true;
}

// ─────────────────────────────────────────────
// 안정 해시
// ─────────────────────────────────────────────
function hash01(x, y, z){
  let h = (x*374761393 + y*668265263 + z*2147483647) >>> 0;
  h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
  return (h >>> 0) / 0xFFFFFFFF;
}

// ─────────────────────────────────────────────
// 줄기-부착 우선 점수 & 선택
// ─────────────────────────────────────────────
function attachmentScore(p, info){
  // p = [x,y,z,tid]
  const dx = (p[0] - info.cx) / BLOCK;
  const dz = (p[2] - info.cz) / BLOCK;
  const dy = (p[1] - info.canopyY) / BLOCK;
  const r2 = dx*dx + dz*dz;
  // 줄기 꼭대기 주변을 우선: 수평 가까움 + 수직은 가중치 낮게
  return r2 + 0.35*Math.abs(dy) + 0.02*hash01(p[0]|0, p[1]|0, p[2]|0);
}
function attachedPick(list, info, keepCount){
  if (keepCount >= list.length) return list;
  const scored = list.map(p => ({ p, s: attachmentScore(p, info) }));
  scored.sort((a,b)=> a.s - b.s);
  const out = [];
  for (let i=0;i<keepCount;i++) out.push(scored[i].p);
  return out;
}

// ─────────────────────────────────────────────
// 나무 심기: 잎 좌표 + 트리 정보 수집
// ─────────────────────────────────────────────
export function plantTrees(forestLogs){
  const allLeafPositions = [];
  const treeInfos = [];  // tid -> {cx, cz, canopyY}
  let treeId = 0;

  const makeTreeOak=(x,y,z)=>{
    const myId = treeId++;
    x=snap(x); y=snap(y)+HALF; z=snap(z);
    const h=4+(Math.random()*2|0);
    const log=[],leaf=[];
    for (let i=0;i<h;i++) log.push([x,y+i*BLOCK,z]);
    const cy=y+h*BLOCK; // 캐노피 중심 높이
    for(let dx=-2;dx<=2;dx++)
    for(let dy=-1;dy<=2;dy++)
    for(let dz=-2;dz<=2;dz++){
      const rr=dx*dx+dy*dy+dz*dz;
      if (rr<=6+(Math.random()<0.25?1:0)){
        if(!(dx===0&&dy===0&&dz===0)) leaf.push([x+dx*BLOCK,cy+dy*BLOCK,z+dz*BLOCK,myId]);
      }
    }
    addMatrices(forestLogs, log);
    allLeafPositions.push(...leaf);
    treeInfos[myId] = { cx:x, cz:z, canopyY:cy };
  };

  const makeTreeBirch=(x,y,z)=>{
    const myId = treeId++;
    x=snap(x); y=snap(y)+HALF; z=snap(z);
    const h=6+(Math.random()*3|0);
    const log=[],leaf=[];
    for (let i=0;i<h;i++) log.push([x,y+i*BLOCK,z]);
    const cy=y+(h-1)*BLOCK;
    for(let dx=-1;dx<=1;dx++)
    for(let dz=-1;dz<=1;dz++)
    for(let dy=0;dy<=1;dy++){
      if (Math.abs(dx)+Math.abs(dz)<=2) leaf.push([x+dx*BLOCK,cy+dy*BLOCK,z+dz*BLOCK,myId]);
    }
    addMatrices(forestLogs, log);
    allLeafPositions.push(...leaf);
    treeInfos[myId] = { cx:x, cz:z, canopyY:cy };
  };

  const makeTreeSpruce=(x,y,z)=>{
    const myId = treeId++;
    x=snap(x); y=snap(y)+HALF; z=snap(z);
    const h=8+(Math.random()*4|0);
    const log=[],leaf=[];
    for (let i=0;i<h;i++) log.push([x,y+i*BLOCK,z]);
    const top=y+(h-1)*BLOCK;
    for (let layer=0;layer<5;layer++){
      const cy=top-layer*BLOCK;
      const radius=Math.min(3,1+Math.floor(layer/1.2));
      for(let dx=-radius;dx<=radius;dx++)
      for(let dz=-radius;dz<=radius;dz++){
        if (Math.abs(dx)+Math.abs(dz)<=radius+1){
          if(!(dx===0&&dz===0&&layer===0)) leaf.push([x+dx*BLOCK,cy,z+dz*BLOCK,myId]);
        }
      }
    }
    addMatrices(forestLogs, log);
    allLeafPositions.push(...leaf);
    treeInfos[myId] = { cx:x, cz:z, canopyY:top };
  };

  const makeTreeJungle=(x,y,z)=>{
    const myId = treeId++;
    x=snap(x); y=snap(y)+HALF; z=snap(z);
    const h=8+(Math.random()*6|0);
    const log=[],leaf=[];
    for (let i=0;i<h;i++){
      const yy=y+i*BLOCK;
      log.push([x,yy,z],[x+BLOCK,yy,z],[x,yy,z+BLOCK],[x+BLOCK,yy,z+BLOCK]);
    }
    const baseY=y+(h-1)*BLOCK;
    for (let dy=0;dy<2;dy++){
      const cy=baseY+dy*BLOCK;
      for (let dx=-2;dx<=2;dx++)
      for (let dz=-2;dz<=2;dz++){
        if (Math.abs(dx)+Math.abs(dz)<=4){
          if (!(dx>=0&&dx<=1&&dz>=0&&dz<=1)) leaf.push([x+dx*BLOCK,cy,z+dz*BLOCK,myId]);
        }
      }
    }
    addMatrices(forestLogs, log);
    allLeafPositions.push(...leaf);
    // 2x2 줄기 → 중심은 (x+0.5B, z+0.5B)
    treeInfos[myId] = { cx:x+0.5*BLOCK, cz:z+0.5*BLOCK, canopyY:baseY };
  };

  // 샘플 4그루
  makeTreeOak(    0, GROUND_Y,   0);
  makeTreeBirch( 20, GROUND_Y, -14);
  makeTreeSpruce(-28, GROUND_Y,  12);
  makeTreeJungle( 34, GROUND_Y,  22);

  return { leafPositions: allLeafPositions, treeCount: treeId, treeInfos };
}

// ─────────────────────────────────────────────
// InstancedMesh 쓰기/초기화 유틸
// ─────────────────────────────────────────────
function writeToMesh(mesh, arr){
  const m = new THREE.Matrix4();
  let i=0;
  for (const p of arr){
    m.makeTranslation(p[0],p[1],p[2]);
    mesh.setMatrixAt(i++, m);
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
}
function clearMeshes(meshes){
  for (const m of meshes){ m.count = 0; m.instanceMatrix.needsUpdate = true; }
}

// ─────────────────────────────────────────────
// 봄: 분홍 비율
// ─────────────────────────────────────────────
export function applyLeafMix(forestLeavesGreen, forestLeavesPink, leafPositions, pinkRatio){
  const greens=[], pinks=[];
  for (const p of leafPositions){
    const s = hash01(p[0]|0,p[1]|0,p[2]|0);
    (s < pinkRatio ? pinks : greens).push(p);
  }
  writeToMesh(forestLeavesPink,  pinks);
  writeToMesh(forestLeavesGreen, greens);
  return { pink: pinks.length, green: greens.length };
}

// ─────────────────────────────────────────────
// 여름/기타: 한 메쉬로 모두
// ─────────────────────────────────────────────
export function applyAllToOne(targetMesh, others, leafPositions){
  writeToMesh(targetMesh, leafPositions);
  clearMeshes(others);
}

// ─────────────────────────────────────────────
// 가을: 트리별 빨강/노랑 + 낙엽 (줄기 부착 우선)
// ─────────────────────────────────────────────
export function applyAutumnMix({
  redMesh, yellowMesh, greenMesh, leafPositions, treeCount, treeInfos,
  coloredRatio = 1.0, dropRatio = 0.0
}){
  const byTree = Array.from({length: treeCount}, () => ({
    red:[], yellow:[], green:[]
  }));

  const colorOfTree = (tid)=> (tid % 4 < 2 ? 'red' : 'yellow');

  for (const p of leafPositions){
    const [x,y,z,tid] = p;
    const s = hash01(x|0,y|0,z|0);
    const toColor = (s < coloredRatio);
    if (toColor){
      (colorOfTree(tid) === 'red' ? byTree[tid].red : byTree[tid].yellow).push(p);
    } else {
      if (greenMesh) byTree[tid].green.push(p);
    }
  }

  const reds=[], yellows=[], greens=[];
  for (let tid=0; tid<treeCount; tid++){
    const info = treeInfos[tid];
    const r = byTree[tid].red, y = byTree[tid].yellow, g = byTree[tid].green;

    // 낙엽(dropRatio) 적용: 줄기와 가까운 것부터 남기기
    const keepR = Math.round(r.length * (1 - dropRatio));
    const keepY = Math.round(y.length * (1 - dropRatio));
    reds.push(...attachedPick(r, info, keepR));
    yellows.push(...attachedPick(y, info, keepY));

    // 9월처럼 greenMesh가 있을 때는 전부 유지(가을 낙엽은 색변화 잎에만 적용)
    if (greenMesh) greens.push(...g);
  }

  writeToMesh(redMesh,    reds);
  writeToMesh(yellowMesh, yellows);
  if (greenMesh) writeToMesh(greenMesh, greens);
}

// ─────────────────────────────────────────────
// 겨울: 12/1/2월 (줄기 부착 우선)
// ─────────────────────────────────────────────
export function applyWinterLayout({
  month, snowMesh, greenMesh, leafPositions, treeInfos,
  decDropRatio = 0.90,   // 12월: 90% 낙엽 → 10%만 눈잎
  febSnowRatio = 0.10    // 2월: 전체 중 10% 눈잎
}){
  if (month === 12){
    const byTree = new Map();
    for (const p of leafPositions){
      const tid = p[3];
      if (!byTree.has(tid)) byTree.set(tid, []);
      byTree.get(tid).push(p);
    }
    const sn=[];
    byTree.forEach((list, tid)=>{
      const keep = Math.round(list.length * (1 - decDropRatio));
      sn.push(...attachedPick(list, treeInfos[tid], keep));
    });
    writeToMesh(snowMesh, sn);
    if (greenMesh) clearMeshes([greenMesh]); // 초록 금지
  }
  else if (month === 1){
    if (greenMesh) clearMeshes([greenMesh]);
    clearMeshes([snowMesh]);                 // 완전히 앙상
  }
  else if (month === 2){
    const byTree = new Map();
    for (const p of leafPositions){
      const tid = p[3];
      if (!byTree.has(tid)) byTree.set(tid, []);
      byTree.get(tid).push(p);
    }
    const sn=[];
    byTree.forEach((list, tid)=>{
      const keep = Math.round(list.length * febSnowRatio);
      sn.push(...attachedPick(list, treeInfos[tid], keep));
    });
    writeToMesh(snowMesh, sn);
    if (greenMesh) clearMeshes([greenMesh]); // 초록 금지
  }
}
