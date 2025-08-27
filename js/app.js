// js/app.js
import * as THREE from 'three';

import { createScene } from './scene.js';
import { createSky } from './sky.js';
import { makeBlockAtlas, setBoxUVFaces } from './atlas.js';
import { createGround } from './world.js';
import {
  createTreeMeshes,
  plantTrees,
  applyLeafMix,          // 봄(녹/분홍) 섞기
  applyAutumnMix,        // 가을(빨강/노랑/낙엽)
  applyAllToOne,         // 한 색으로 전부 채우기
  applyWinterLayout      // 겨울(12/1/2월) 배치
} from './trees.js';
import {
  createShadowMaterial,
  makeShadowFrom,
  setShadowUniforms,
  updateShadowLightDir,
  resyncShadowFrom
} from './shadows.js';
import { horizontalFrom, positionOnDome } from './solar.js';
import { R, FIXED_LAT_DEG, MIDDAY_OF_MONTH } from './config.js';
import { deg2rad, solarDeclinationRadByMonth, getSeason, toHHMM, fmtDeg } from './utils.js';

// HUD
import { initHUD, updateInfoLines, onHUDResize, updateCamStatus } from './hud.js';

// ─────────────────────────────────────────────
// Scene / Renderer / Camera / Controls / Light
// ─────────────────────────────────────────────
const { renderer, scene, camera, controls, dir } = createScene();

// UI DOM
const monthEl = document.getElementById('month');
const hourEl  = document.getElementById('hour');
const monthv  = document.getElementById('monthv');
const hourv   = document.getElementById('hourv');

// ─────────────────────────────────────────────
// Sky
// ─────────────────────────────────────────────
const sky = createSky();
scene.background = sky.texture;

// ─────────────────────────────────────────────
// Atlas & Materials
// ─────────────────────────────────────────────
const atlas = makeBlockAtlas();
const atlasTex = new THREE.CanvasTexture(atlas.canvas);
atlasTex.magFilter = atlasTex.minFilter = THREE.NearestFilter;

const matLit   = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 1, metalness: 0 });
const matUnlit = new THREE.MeshBasicMaterial({ map: atlasTex }); // 조명 영향 없음

const texelSize = new THREE.Vector2(1 / atlas.canvas.width, 1 / atlas.canvas.height);

// ─────────────────────────────────────────────
// Ground
// ─────────────────────────────────────────────
const { groundSurface, wallMesh } = createGround(scene, matLit, atlas);

// ─────────────────────────────────────────────
// Trees (색상별 잎 메쉬 5종)
// ─────────────────────────────────────────────
const {
  forestLogs,
  forestLeavesGreen,   // 여름/기본 초록
  forestLeavesPink,    // 봄 벚꽃
  forestLeavesRed,     // 가을 빨강
  forestLeavesYellow,  // 가을 노랑
  forestLeavesSnow     // 겨울 눈잎
} = createTreeMeshes(matLit, atlas);

scene.add(
  forestLogs,
  forestLeavesGreen,
  forestLeavesPink,
  forestLeavesRed,
  forestLeavesYellow,
  forestLeavesSnow
);

// 잎 좌표 + 트리 정보 수집(줄기 부착 우선 선택에 사용)
const { leafPositions, treeCount, treeInfos } = plantTrees(forestLogs);

// ─────────────────────────────────────────────
// 땅 텍스처만 계절 반영 (잎은 월별 로직으로 관리)
// ─────────────────────────────────────────────
function updateSeasonalAppearance(season){
  const topRect = (season === '겨울') ? atlas.tiles.snow_top : atlas.tiles.grass_top;
  setBoxUVFaces(groundSurface.geometry, {
    top: topRect,
    bottom: atlas.tiles.dirt,
    sides: atlas.tiles.grass_side
  });
  groundSurface.material = matLit;
  wallMesh.material = matLit;
}

// ─────────────────────────────────────────────
// Celestial dome & horizon
// ─────────────────────────────────────────────
const domeMat = new THREE.MeshBasicMaterial({ color:0x244066, transparent:true, opacity:0.16, side:THREE.BackSide });
const domeGeo = new THREE.SphereGeometry(R, 64, 32, 0, Math.PI*2, 0, Math.PI/2);
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.material.depthWrite = false;
dome.renderOrder = 0;
scene.add(dome);

const horizon = new THREE.Mesh(
  new THREE.TorusGeometry(R, 0.18, 8, 256),
  new THREE.MeshBasicMaterial({ color:0x88aacc })
);
horizon.rotation.x = Math.PI/2;
scene.add(horizon);

// ─────────────────────────────────────────────
// Sun + apparent path
// ─────────────────────────────────────────────
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(5, 24, 16),
  new THREE.MeshBasicMaterial({ color:0xfff3b0 })
);
scene.add(sun);

const sunPathGeom = new THREE.BufferGeometry();
sunPathGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
const sunPathLine = new THREE.Line(
  sunPathGeom,
  new THREE.LineBasicMaterial({ color:0xffd480 })
);
scene.add(sunPathLine);

// ─────────────────────────────────────────────
// Shadows (색상별 잎 그림자까지 생성)
// ─────────────────────────────────────────────
const baseShadowMat = createShadowMaterial(atlasTex, texelSize);
const forestLogsShadow     = makeShadowFrom(forestLogs,        baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowG  = makeShadowFrom(forestLeavesGreen, baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowP  = makeShadowFrom(forestLeavesPink,  baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowR  = makeShadowFrom(forestLeavesRed,   baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowY  = makeShadowFrom(forestLeavesYellow,baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowS  = makeShadowFrom(forestLeavesSnow,  baseShadowMat, atlasTex, texelSize);

scene.add(
  forestLogsShadow,
  forestLeavesShadowG,
  forestLeavesShadowP,
  forestLeavesShadowR,
  forestLeavesShadowY,
  forestLeavesShadowS
);

const allShadows = [
  forestLogsShadow,
  forestLeavesShadowG,
  forestLeavesShadowP,
  forestLeavesShadowR,
  forestLeavesShadowY,
  forestLeavesShadowS
];

// ── 잎 메쉬 비우기 헬퍼 ───────────────────────
function clearLeaves(...meshes){
  for (const m of meshes){
    m.count = 0;
    m.instanceMatrix.needsUpdate = true;
  }
}

// ─────────────────────────────────────────────
// Cardinal labels
// ─────────────────────────────────────────────
async function makeLabelSprite(text, { scale = 5, color = '#ffffff' } = {}) {
  const cvs = document.createElement('canvas');
  cvs.width = 128; cvs.height = 128;

  const { MCFontRenderer } = await import('../MCFont.js');
  const r = new MCFontRenderer({ canvas: cvs, basePath: './images/font' });
  await r.init();
  r.resize();
  await r.draw(text, {
    color, scale,
    align: 'center',
    valign: 'middle',
    x: cvs.width / 2,
    y: cvs.height / 2,
    shadow: false
  });

  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.premultiplyAlpha = true;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  mat.depthTest = false;
  mat.alphaTest = 0.2;

  const sp = new THREE.Sprite(mat);
  sp.renderOrder = 1;
  sp.scale.set(16, 16, 1);
  return sp;
}
(async () => {
  const n = await makeLabelSprite('북', { scale: 5 });
  const s = await makeLabelSprite('남', { scale: 5 });
  const e = await makeLabelSprite('동', { scale: 5 });
  const w = await makeLabelSprite('서', { scale: 5 });
  n.position.set( 0, 6, -R);
  s.position.set( 0, 6,  R);
  e.position.set( R, 6,  0);
  w.position.set(-R, 6,  0);
  scene.add(n, s, e, w);
})();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const DEFAULT_MONTH = 3;
const DEFAULT_HOUR  = 10;

function getSafeInputs() {
  let m = parseInt(monthEl?.value ?? '', 10);
  if (Number.isNaN(m)) {
    const fallback = parseInt(monthEl?.getAttribute('value') ?? '', 10);
    m = Number.isNaN(fallback) ? DEFAULT_MONTH : fallback;
    if (monthEl) monthEl.value = String(m);
  }

  let t = parseFloat(hourEl?.value ?? '');
  if (Number.isNaN(t)) {
    const fallback = parseFloat(hourEl?.getAttribute('value') ?? '');
    t = Number.isNaN(fallback) ? DEFAULT_HOUR : fallback;
    if (hourEl) hourEl.value = String(t);
  }

  if (monthv) monthv.textContent = `${m}월`;
  if (hourv)  hourv.textContent  = t.toFixed(2);

  return { m, t };
}

function makeInitialInfoLines() {
  const { m, t } = getSafeInputs();
  const δ  = solarDeclinationRadByMonth(m, MIDDAY_OF_MONTH);
  const H  = deg2rad(15 * (12 - t));
  const h  = horizontalFrom(deg2rad(FIXED_LAT_DEG), δ, H);

  return [
    '현재 계절',
    `: ${getSeason(m)}`,
    '',
    '현재 시각',
    `: ${toHHMM(t)}`,
    '',
    '현재 태양 고도',
    `: ${fmtDeg(h.alt)}`
  ];
}

// ─────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────
const FIXED_LAT_RAD = deg2rad(FIXED_LAT_DEG);
const SUN_FADE_START = deg2rad(3);
const SUN_FADE_END   = deg2rad(12);

function resyncAllLeafShadows(){
  resyncShadowFrom(forestLeavesShadowG, forestLeavesGreen);
  resyncShadowFrom(forestLeavesShadowP, forestLeavesPink);
  resyncShadowFrom(forestLeavesShadowR, forestLeavesRed);
  resyncShadowFrom(forestLeavesShadowY, forestLeavesYellow);
  resyncShadowFrom(forestLeavesShadowS, forestLeavesSnow);
}

function updateSunAndPath() {
  const { m, t } = getSafeInputs();

  const δ  = solarDeclinationRadByMonth(m, MIDDAY_OF_MONTH);
  const H  = deg2rad(15 * (12 - t));
  const h  = horizontalFrom(FIXED_LAT_RAD, δ, H);

  // Sun
  sun.position.copy(positionOnDome(h.alt, h.az));
  sun.visible = h.alt > -deg2rad(1);

  // Sky
  sky.update(h.alt);

  // Sun path curve
  const steps = 241;
  const arr = new Float32Array(steps * 3);
  for (let i = 0; i < steps; i++) {
    const th = (i / (steps - 1)) * 24;
    const HH = deg2rad(15 * (12 - th));
    const hh = horizontalFrom(FIXED_LAT_RAD, δ, HH);
    const p  = positionOnDome(hh.alt, hh.az);
    arr[i*3 + 0] = p.x;
    arr[i*3 + 1] = p.y;
    arr[i*3 + 2] = p.z;
  }
  sunPathGeom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  sunPathGeom.computeBoundingSphere();

  // Shadows uniforms/visibility
  dir.position.copy(sun.position).normalize().multiplyScalar(120);
  updateShadowLightDir(dir, allShadows);
  const visible = h.alt > 0.0;
  for (const s of allShadows) s.visible = visible;

  const fade = THREE.MathUtils.clamp(
    (h.alt - SUN_FADE_START) / (SUN_FADE_END - SUN_FADE_START),
    0, 1
  );
  setShadowUniforms(allShadows, u => { u.sunFade.value = fade; });

  // HUD info
  const season = getSeason(m);
  updateInfoLines([
    '현재 계절',
    `: ${season}`,
    '',
    '현재 시각',
    `: ${toHHMM(t)}`,
    '',
    '현재 태양 고도',
    `: ${fmtDeg(h.alt)}`
  ]).catch(console.error);

  // 땅 텍스처만 계절 반영
  updateSeasonalAppearance(season);

  // ───── 잎 월별 배치 규칙 ─────
  // 봄(3~5): 녹/분홍 섞기
  if (m === 3) applyLeafMix(forestLeavesGreen, forestLeavesPink, leafPositions, 0.40);
  else if (m === 4) applyLeafMix(forestLeavesGreen, forestLeavesPink, leafPositions, 1.00);
  else if (m === 5) applyLeafMix(forestLeavesGreen, forestLeavesPink, leafPositions, 0.60);
  // 봄에는 red/yellow/snow는 사용 안 함
  if (m >= 3 && m <= 5) clearLeaves(forestLeavesRed, forestLeavesYellow, forestLeavesSnow);

  // 여름(6~8): 전부 초록
  else if (m >= 6 && m <= 8) applyAllToOne(
    forestLeavesGreen,
    [forestLeavesPink, forestLeavesRed, forestLeavesYellow, forestLeavesSnow],
    leafPositions
  );

  // 가을(9~11): 트리 4개 중 2개는 빨강, 2개는 노랑 (줄기 부착 우선)
  else if (m === 9) {
    applyAutumnMix({
      redMesh:    forestLeavesRed,
      yellowMesh: forestLeavesYellow,
      greenMesh:  forestLeavesGreen,  // 일부는 아직 초록
      leafPositions,
      treeCount,
      treeInfos,
      coloredRatio: 0.60,             // 단풍 시작(색 60%)
      dropRatio:    0.00              // 낙엽 없음
    });
    clearLeaves(forestLeavesPink, forestLeavesSnow); // 가을: 분홍/눈 제거
  } else if (m === 10) {
    applyAutumnMix({
      redMesh:    forestLeavesRed,
      yellowMesh: forestLeavesYellow,
      greenMesh:  null,               // 전부 색 변화
      leafPositions,
      treeCount,
      treeInfos,
      coloredRatio: 1.00,             // 절정(100%)
      dropRatio:    0.00
    });
    // 10월엔 초록 잎이 남아있으면 안 됨
    clearLeaves(forestLeavesGreen, forestLeavesPink, forestLeavesSnow);
  } else if (m === 11) {
    applyAutumnMix({
      redMesh:    forestLeavesRed,
      yellowMesh: forestLeavesYellow,
      greenMesh:  null,               // 초록 없음
      leafPositions,
      treeCount,
      treeInfos,
      coloredRatio: 1.00,             // 대상은 100%인데
      dropRatio:    0.85              // 그중 85% 낙엽(= 15%만 남김)
    });
    // 11월엔 초록/분홍/눈 없음
    clearLeaves(forestLeavesGreen, forestLeavesPink, forestLeavesSnow);
  }

  // 겨울(12~2): 12=눈잎 조금, 1=전부 낙엽, 2=눈잎 아주 조금 (줄기 부착 우선)
  else if (m === 12 || m === 1 || m === 2) {
    applyWinterLayout({
      month: m,
      snowMesh:  forestLeavesSnow,
      greenMesh: forestLeavesGreen,   // 2월에도 green은 비움 처리
      leafPositions,
      treeInfos,
      decDropRatio: 0.90,             // 12월: 90% 낙엽 → 10%만 눈잎 남김
      febSnowRatio: 0.10              // 2월: 10% 눈잎만 남김
    });
    // 겨울에는 분홍/빨강/노랑은 항상 비움
    clearLeaves(forestLeavesPink, forestLeavesRed, forestLeavesYellow);
  }

  // 잎 변경 후 그림자 동기화
  resyncAllLeafShadows();

  // ★ 겨울 낮/밤 전환 (지면만)
  if (season === '겨울') {
    groundSurface.material = (h.alt > 0) ? matUnlit : matLit;
  }
}

// ─────────────────────────────────────────────
// Camera HUD
// ─────────────────────────────────────────────
function updateCameraHUD(){
  const d = camera.position.distanceTo(controls.target);
  const dMin = controls.minDistance ?? 0;
  const dMax = controls.maxDistance ?? Math.max(d, 1);
  const pct = THREE.MathUtils.clamp((d - dMin) / Math.max(dMax - dMin, 1e-6), 0, 1) * 100;

  const px = camera.position.x.toFixed(1);
  const py = camera.position.y.toFixed(1);
  const pz = camera.position.z.toFixed(1);

  updateCamStatus([
    `zoom : ${pct.toFixed(0)}%  (d=${d.toFixed(1)})`,
    `pos  : (${px}, ${py}, ${pz})`
  ], { color:'#000000' }).catch(console.error);
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
monthEl.oninput = hourEl.oninput = updateSunAndPath;
updateSunAndPath();
monthEl?.dispatchEvent(new Event('input', { bubbles:true }));
hourEl?.dispatchEvent(new Event('input', { bubbles:true }));

controls.addEventListener('change', updateCameraHUD);
updateCameraHUD();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight - 120;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  onHUDResize();
  updateCameraHUD();
}
window.addEventListener('resize', resize);

initHUD(renderer, camera, scene, {
  infoInitialLines: makeInitialInfoLines()
})
  .then(() => {
    resize();
    updateSunAndPath();
    updateCameraHUD();
  })
  .catch(console.error);

requestAnimationFrame(() => {
  resize();
  updateSunAndPath();
  updateCameraHUD();
});

(function loop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
})();
