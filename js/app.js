// js/app.js
import * as THREE from 'three';

import { createScene } from './scene.js';
import { createSky } from './sky.js';
import { makeBlockAtlas, setBoxUVFaces } from './atlas.js';
import { createGround } from './world.js';
import { createTreeMeshes, plantTrees, applyLeafMix, applyAutumnMix, applyAllToOne, applyWinterLayout } from './trees.js';
import { createShadowMaterial, makeShadowFrom, setShadowUniforms, updateShadowLightDir, resyncShadowFrom } from './shadows.js';
import { horizontalFrom } from './solar.js';
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
const hourEl = document.getElementById('hour');
const monthv = document.getElementById('monthv');
const hourv = document.getElementById('hourv');

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

const matLit = new THREE.MeshStandardMaterial({
    map: atlasTex,
    roughness: 1,
    metalness: 0
});
const matUnlit = new THREE.MeshBasicMaterial({
    map: atlasTex
});

const texelSize = new THREE.Vector2(1 / atlas.canvas.width, 1 / atlas.canvas.height);

// ─────────────────────────────────────────────
// Ground
// ─────────────────────────────────────────────
const { groundSurface, wallMesh } = createGround(scene, matLit, atlas);

// ─────────────────────────────────────────────
// Trees
// ─────────────────────────────────────────────
const { forestLogs, forestLeavesGreen, forestLeavesPink, forestLeavesRed, forestLeavesYellow, forestLeavesSnow } = createTreeMeshes(matLit, atlas);

scene.add(
    forestLogs,
    forestLeavesGreen,
    forestLeavesPink,
    forestLeavesRed,
    forestLeavesYellow,
    forestLeavesSnow);

// 잎 좌표/트리 정보
const { leafPositions, treeCount, treeInfos } = plantTrees(forestLogs);

// ─────────────────────────────────────────────
// 땅 텍스처만 계절 반영
// ─────────────────────────────────────────────
function updateSeasonalAppearance(season) {
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
// Celestial sphere hierarchy
//   axisAlign ( +Y → nAxis )
//     └─ spinGroup (시간 회전)
//         └─ sunDecl (적위)
//             └─ sun
// ─────────────────────────────────────────────
const celestialRoot = new THREE.Group();
scene.add(celestialRoot);

const FIXED_LAT_RAD = deg2rad(FIXED_LAT_DEG);
const nAxis = new THREE.Vector3(0, Math.sin(FIXED_LAT_RAD), -Math.cos(FIXED_LAT_RAD)).normalize();
const MIDDAY_LOCAL = 12.5; // 한국: 태양 최고고도 12:30

// +Y → nAxis 정렬
const axisAlign = new THREE.Group();
axisAlign.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nAxis);
celestialRoot.add(axisAlign);

// 시간 회전 그룹
const spinGroup = new THREE.Group();
axisAlign.add(spinGroup);

// 천구 돔(전체 구)
const domeMat = new THREE.MeshBasicMaterial({
    color: 0x244066,
    transparent: true,
    opacity: 0.16,
    side: THREE.BackSide
});
const domeGeo = new THREE.SphereGeometry(R, 64, 32);
const dome = new THREE.Mesh(domeGeo, domeMat);
dome.material.depthWrite = false;
dome.renderOrder = 0;
spinGroup.add(dome);

// 수평선(관측자 고정)
const horizon = new THREE.Mesh(
        new THREE.TorusGeometry(R, 0.18, 8, 256),
        new THREE.MeshBasicMaterial({
            color: 0x88aacc
        }));
horizon.rotation.x = Math.PI / 2;
scene.add(horizon);

// 태양(적위만 sunDecl에)
const sunDecl = new THREE.Group();
spinGroup.add(sunDecl);

const sun = new THREE.Mesh(
        new THREE.SphereGeometry(5, 24, 16),
        new THREE.MeshBasicMaterial({
            color: 0xfff3b0,
            toneMapped: false
        }));
sun.position.set(0, 0, R); // 적도(+Z)
sunDecl.add(sun);

// 태양 경로(고정 라인)
const sunPathGeom = new THREE.BufferGeometry();
sunPathGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
const sunPathLine = new THREE.Line(sunPathGeom, new THREE.LineBasicMaterial({
            color: 0xffd480
        }));
scene.add(sunPathLine);

// ─────────────────────────────────────────────
// Shadows
// ─────────────────────────────────────────────
const baseShadowMat = createShadowMaterial(atlasTex, texelSize);
const forestLogsShadow = makeShadowFrom(forestLogs, baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowG = makeShadowFrom(forestLeavesGreen, baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowP = makeShadowFrom(forestLeavesPink, baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowR = makeShadowFrom(forestLeavesRed, baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowY = makeShadowFrom(forestLeavesYellow, baseShadowMat, atlasTex, texelSize);
const forestLeavesShadowS = makeShadowFrom(forestLeavesSnow, baseShadowMat, atlasTex, texelSize);

scene.add(
    forestLogsShadow,
    forestLeavesShadowG,
    forestLeavesShadowP,
    forestLeavesShadowR,
    forestLeavesShadowY,
    forestLeavesShadowS);

const allShadows = [
    forestLogsShadow,
    forestLeavesShadowG,
    forestLeavesShadowP,
    forestLeavesShadowR,
    forestLeavesShadowY,
    forestLeavesShadowS
];

function clearLeaves(...meshes) {
    for (const m of meshes) {
        m.count = 0;
        m.instanceMatrix.needsUpdate = true;
    }
}

// ─────────────────────────────────────────────
// Cardinal labels
// ─────────────────────────────────────────────
async function makeLabelSprite(text, {
    scale = 5,
    color = '#ffffff'
} = {}) {
    const cvs = document.createElement('canvas');
    cvs.width = 128;
    cvs.height = 128;

    const { MCFontRenderer } = await import('../MCFont.js');
    const r = new MCFontRenderer({
        canvas: cvs,
        basePath: './images/font'
    });
    await r.init();
    r.resize();
    await r.draw(text, {
        color,
        scale,
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

    const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true
    });
    mat.depthTest = false;
    mat.alphaTest = 0.2;

    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 1;
    sp.scale.set(16, 16, 1);
    return sp;
}
(async() => {
    const n = await makeLabelSprite('북', {
        scale: 5
    });
    const s = await makeLabelSprite('남', {
        scale: 5
    });
    const e = await makeLabelSprite('동', {
        scale: 5
    });
    const w = await makeLabelSprite('서', {
        scale: 5
    });
    n.position.set(0, 6, -R);
    s.position.set(0, 6, R);
    e.position.set(R, 6, 0);
    w.position.set(-R, 6, 0);
    scene.add(n, s, e, w);
})();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const DEFAULT_MONTH = 3;
const DEFAULT_HOUR = 10;

function getSafeInputs() {
    let m = parseInt(monthEl?.value ?? '', 10);
    if (Number.isNaN(m)) {
        const fallback = parseInt(monthEl?.getAttribute('value') ?? '', 10);
        m = Number.isNaN(fallback) ? DEFAULT_MONTH : fallback;
        if (monthEl)
            monthEl.value = String(m);
    }

    let t = parseFloat(hourEl?.value ?? '');
    if (Number.isNaN(t)) {
        const fallback = parseFloat(hourEl?.getAttribute('value') ?? '');
        t = Number.isNaN(fallback) ? DEFAULT_HOUR : fallback;
        if (hourEl)
            hourEl.value = String(t);
    }

    if (monthv)
        monthv.textContent = `${m}월`;
    if (hourv)
        hourv.textContent = t.toFixed(2);

    return {
        m,
        t
    };
}

function makeInitialInfoLines() {
    const { m, t } = getSafeInputs();
    const δ = solarDeclinationRadByMonth(m, MIDDAY_OF_MONTH);
    const H = deg2rad(15 * (12 - t));
    const h = horizontalFrom(deg2rad(FIXED_LAT_DEG), δ, H);

    return [
        '현재 계절', `: ${getSeason(m)}`, '',
        '현재 시각', `: ${toHHMM(t)}`, '',
        '현재 태양 고도', `: ${fmtDeg(h.alt)}`
    ];
}

// 간이: 한국 위상에 맞춰 월별로 부드럽게 변화하는 태양 적위(라디안)
function seasonalDeclinationRadKR(m /* 1~12 */) {
    const A = deg2rad(23.44);
    // m=3 → 0, m=6 → +A, m=9 → 0, m=12 → -A, m=1(=13) → ≈-A
    return A * Math.sin(2 * Math.PI * ((m - 3) / 12));
}

// NOAA 근사(라디안) — 필요 시 사용 가능
function solarDeclinationRad_NOAA(dayOfYear, hourLocal = 12.5) {
    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourLocal - 12) / 24);
    return (
        0.006918
         - 0.399912 * Math.cos(gamma)
         + 0.070257 * Math.sin(gamma)
         - 0.006758 * Math.cos(2 * gamma)
         + 0.000907 * Math.sin(2 * gamma)
         - 0.002697 * Math.cos(3 * gamma)
         + 0.00148 * Math.sin(3 * gamma));
}

// ─────────────────────────────────────────────
// Shadows helpers
// ─────────────────────────────────────────────
const SUN_FADE_START = deg2rad(3);
const SUN_FADE_END = deg2rad(12);

function resyncAllLeafShadows() {
    resyncShadowFrom(forestLeavesShadowG, forestLeavesGreen);
    resyncShadowFrom(forestLeavesShadowP, forestLeavesPink);
    resyncShadowFrom(forestLeavesShadowR, forestLeavesRed);
    resyncShadowFrom(forestLeavesShadowY, forestLeavesYellow);
    resyncShadowFrom(forestLeavesShadowS, forestLeavesSnow);
}

// 태양 경로를 씬 좌표로 계산
function sunWorldPosFrom(δ, H) {
    const sδ = Math.sin(δ),
    cδ = Math.cos(δ);
    const vδ = new THREE.Vector3(0, R * sδ, R * cδ);
    const sH = Math.sin(H),
    cH = Math.cos(H);
    const x = vδ.x * cH + vδ.z * sH;
    const y = vδ.y;
    const z = -vδ.x * sH + vδ.z * cH;
    const v = new THREE.Vector3(x, y, z);
    return v.applyQuaternion(axisAlign.quaternion);
}

// ─────────────────────────────────────────────
// Earth axis / equator / (Polaris & Crux as spheres)
// ─────────────────────────────────────────────
function addEarthAxis({
    axisOuterColor = 0x000000,
    axisInnerColor = 0x9aa0a6,
    axisInnerOpacity = 0.28,
    axisOuterExtend = 0.2,
    equatorDash = {
        dashSize: 1.2,
        gapSize: 0.6,
        opacity: 0.7
    },

    poleSize = 0.5,
    poleColor = 0xffffff,
    poleEmissiveIntensity = 1.4,
    poleToneMapped = false,

    showLabels = true,
    labelScale = 1.5,
    labelOffset = 6,
    labelColor = '#000000'
} = {}) {
    const g = new THREE.Group();

    const phi = FIXED_LAT_RAD;
    const n = new THREE.Vector3(0, Math.sin(phi), -Math.cos(phi)).normalize();

    const outerLen = R * (1.0 + axisOuterExtend);
    const innerLen = R;

    // 내부 축
    {
        const geom = new THREE.BufferGeometry().setFromPoints([
                    n.clone().multiplyScalar(-innerLen),
                    n.clone().multiplyScalar(+innerLen)
                ]);
        const mat = new THREE.LineBasicMaterial({
            color: axisInnerColor,
            transparent: true,
            opacity: axisInnerOpacity
        });
        g.add(new THREE.Line(geom, mat));
    }

    // 외부 축
    const armMat = new THREE.LineBasicMaterial({
        color: axisOuterColor,
        transparent: true,
        opacity: 0.95
    });
    g.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([n.clone().multiplyScalar(+innerLen), n.clone().multiplyScalar(+outerLen)]),
            armMat));
    g.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([n.clone().multiplyScalar(-innerLen), n.clone().multiplyScalar(-outerLen)]),
            armMat.clone()));

    // 극별
    const poleMat = new THREE.MeshStandardMaterial({
        color: poleColor,
        roughness: 0.2,
        metalness: 0.0,
        emissive: new THREE.Color(poleColor),
        emissiveIntensity: poleEmissiveIntensity,
        toneMapped: poleToneMapped
    });
    const poleGeo = new THREE.SphereGeometry(poleSize, 16, 12);

    const polaris = new THREE.Mesh(poleGeo, poleMat);
    const crux = new THREE.Mesh(poleGeo.clone(), poleMat);

    const rPoles = R + 0.001;
    polaris.position.copy(n).multiplyScalar(rPoles);
    crux.position.copy(n).multiplyScalar(-rPoles);
    g.add(polaris, crux);

    // 라벨
    if (showLabels && typeof makeLabelSprite === 'function') {
        const labelR = R + poleSize * 2 + labelOffset;
        makeLabelSprite('북극성', {
            scale: labelScale,
            color: labelColor
        }).then(sp => {
            sp.position.copy(n).multiplyScalar(labelR);
            sp.material.depthTest = false;
            sp.renderOrder = 12;
            g.add(sp);
        });
        makeLabelSprite('남십자성', {
            scale: labelScale,
            color: labelColor
        }).then(sp => {
            sp.position.copy(n).multiplyScalar(-labelR);
            sp.material.depthTest = false;
            sp.renderOrder = 12;
            g.add(sp);
        });
    }

    // 적도
    const segs = 360;
    const pos = new Float32Array(segs * 3);
    const u = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    if (u.lengthSq() < 1e-6)
        u.set(1, 0, 0);
    const v = n.clone().cross(u).normalize();
    for (let i = 0; i < segs; i++) {
        const t = (i / (segs - 1)) * Math.PI * 2;
        const p = u.clone().multiplyScalar(Math.cos(t)).add(v.clone().multiplyScalar(Math.sin(t))).multiplyScalar(R);
        pos[i * 3 + 0] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
    }
    const eqGeom = new THREE.BufferGeometry();
    eqGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const equator = new THREE.Line(eqGeom, new THREE.LineDashedMaterial({
                color: 0x000000,
                dashSize: equatorDash.dashSize ?? 1.2,
                gapSize: equatorDash.gapSize ?? 0.6,
                transparent: true,
                opacity: equatorDash.opacity ?? 0.7
            }));
    equator.computeLineDistances();
    g.add(equator);

    function setDeclination(deltaRad, eps = THREE.MathUtils.degToRad(0.2)) {
        equator.visible = Math.abs(deltaRad) > eps;
    }

    return {
        group: g,
        setDeclination
    };
}

// ─────────────────────────────────────────────
// Update (earthAxis 생성 후 정의/사용)
// ─────────────────────────────────────────────
const earthAxis = addEarthAxis({
    poleSize: 1,
    poleColor: 0xffffff,
    poleEmissiveIntensity: 1.4,
    poleToneMapped: false
});
scene.add(earthAxis.group);

// ─────────────────────────────────────────────
// Constellations (RA/Dec based)
// ─────────────────────────────────────────────

// 북두칠성 (소수 시간)
const STARS_UMa = [{
        id: 'eta',
        ra: 13.783333,
        dec: 49.3
    }, // η Alkaid
    {
        id: 'zeta',
        ra: 13.383333,
        dec: 54.9
    }, // ζ Mizar
    {
        id: 'eps',
        ra: 12.900000,
        dec: 55.9
    }, // ε Alioth
    {
        id: 'del',
        ra: 12.250000,
        dec: 57.0
    }, // δ Megrez
    {
        id: 'gam',
        ra: 11.900000,
        dec: 53.7
    }, // γ Phecda/Phad
    {
        id: 'bet',
        ra: 11.016667,
        dec: 56.4
    }, // β Merak
    {
        id: 'alp',
        ra: 11.066667,
        dec: 61.8
    }, // α Dubhe
];

// 카시오페이아 (소수 시간)
const STARS_CAS = [{
        id: 'segin',
        ra: 1.900000,
        dec: 63.7
    }, // ε
    {
        id: 'sched',
        ra: 0.666667,
        dec: 56.5
    }, // α
    {
        id: 'gamma',
        ra: 0.933333,
        dec: 60.7
    }, // γ
    {
        id: 'ruch',
        ra: 1.416667,
        dec: 60.2
    }, // δ
    {
        id: 'caph',
        ra: 0.150000,
        dec: 59.2
    }, // β
];

// 작은곰자리 (소수 시간; J2000 근사)
// α(Polaris), β(Kochab), γ(Pherkad), δ(Yildun), ε, ζ, η
const STARS_UMi = [{
        id: 'alp',
        ra: 2.5303,
        dec: 89.264
    }, // α Polaris  (꼬리 끝 = 북극성)
    {
        id: 'del',
        ra: 17.5369,
        dec: 86.586
    }, // δ Yildun
    {
        id: 'eps',
        ra: 16.7661,
        dec: 82.036
    }, // ε
    {
        id: 'zet',
        ra: 15.7344,
        dec: 77.794
    }, // ζ
    {
        id: 'eta',
        ra: 16.2920,
        dec: 75.755
    }, // η
    {
        id: 'gam',
        ra: 15.3456,
        dec: 71.834
    }, // γ Pherkad
    {
        id: 'bet',
        ra: 14.8450,
        dec: 74.155
    }, // β Kochab
];

// LST with longitude & UTC offset (서울 기본)
const FIXED_LON_DEG = 127.0; // 동경 +
const TZ_OFFSET_HOURS = 9;

function lstHoursByMonthAndTime(m, tLocal) {
    let tUTC = tLocal - TZ_OFFSET_HOURS;
    while (tUTC < 0)
        tUTC += 24;
    while (tUTC >= 24)
        tUTC -= 24;

    const N = MIDDAY_OF_MONTH[m - 1] || 15; // day-of-year 근사 (달 중순)
    let LSTdeg = 100.46 + 0.985647 * (N - 1 + tUTC / 24) + FIXED_LON_DEG + 15 * tUTC;
    LSTdeg = ((LSTdeg % 360) + 360) % 360;
    return LSTdeg / 15; // hours
}

// RA/Dec → 월드 좌표
function raDecToWorld(raHours, decDeg, m, t) {
    const LST = lstHoursByMonthAndTime(m, t); // hours
    const H = THREE.MathUtils.degToRad(15 * (raHours - LST)); // hour angle
    const δ = THREE.MathUtils.degToRad(decDeg);

    const sδ = Math.sin(δ),
    cδ = Math.cos(δ);
    const sH = Math.sin(H),
    cH = Math.cos(H);
    const x = cδ * sH;
    const y = sδ;
    const z = cδ * cH;

    return new THREE.Vector3(x, y, z).applyQuaternion(axisAlign.quaternion).multiplyScalar(R);
}

// 드로잉 유틸
const R_SKY = R - 0.2;
function makeStar(size = R * 0.005) {
    return new THREE.Mesh(
        new THREE.SphereGeometry(size, 10, 8),
        new THREE.MeshBasicMaterial({
            color: 0xfff1c2,
            toneMapped: false,
            transparent: true,
            opacity: 0.95
        }));
}
function updateArc(lineObj, a, b, segments = 12, color = 0xffd58a, opacity = 0.55) {
    const A = a.clone().normalize(),
    B = b.clone().normalize();
    const dot = THREE.MathUtils.clamp(A.dot(B), -1, 1);
    const w = Math.acos(dot);
    const so = Math.max(Math.sin(w), 1e-6);
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const p = A.clone().multiplyScalar(Math.sin((1 - t) * w) / so)
            .add(B.clone().multiplyScalar(Math.sin(t * w) / so))
            .multiplyScalar(R_SKY);
        pts.push(p);
    }
    if (!lineObj.geometry)
        lineObj.geometry = new THREE.BufferGeometry();
    lineObj.geometry.setFromPoints(pts);
    if (!lineObj.material) {
        lineObj.material = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity
        });
    }
}

// 초기 오브젝트
const constelRoot = new THREE.Group();
scene.add(constelRoot);

const dipStars = {};
const dipLines = [];
STARS_UMa.forEach(s => {
    const m = makeStar();
    dipStars[s.id] = m;
    constelRoot.add(m);
});
for (let i = 0; i < STARS_UMa.length - 1; i++) {
    const line = new THREE.Line();
    dipLines.push(line);
    constelRoot.add(line);
}

const casStars = {};
const casLines = [];
STARS_CAS.forEach(s => {
    const m = makeStar();
    casStars[s.id] = m;
    constelRoot.add(m);
});
for (let i = 0; i < 4; i++) {
    const line = new THREE.Line();
    casLines.push(line);
    constelRoot.add(line);
}

const umiStars = {};
const umiLines = [];
STARS_UMi.forEach(s => {
    const m = makeStar();
    umiStars[s.id] = m;
    constelRoot.add(m);
});
for (let i = 0; i < 7; i++) { // 7개 선(마지막 1개는 β–ζ 닫기용)
    const line = new THREE.Line();
    umiLines.push(line);
    constelRoot.add(line);
}

// 매 프레임 갱신
function updateConstellations(m, t) {
    // Big Dipper (η→ζ→ε→δ→γ→β→α)
    const posUMaMap = {};
    STARS_UMa.forEach(s => posUMaMap[s.id] = raDecToWorld(s.ra, s.dec, m, t));
    const orderUMa = ['eta', 'zeta', 'eps', 'del', 'gam', 'bet', 'alp'];
    orderUMa.forEach((id, i) => {
        dipStars[id].position.copy(posUMaMap[id]);
        if (i < orderUMa.length - 1) {
            updateArc(dipLines[i], posUMaMap[id], posUMaMap[orderUMa[i + 1]]);
        }
    });

    // Cassiopeia (β→α→γ→δ→ε)
    const posCasMap = {};
    STARS_CAS.forEach(s => posCasMap[s.id] = raDecToWorld(s.ra, s.dec, m, t));
    const orderCAS = ['caph', 'sched', 'gamma', 'ruch', 'segin'];
    orderCAS.forEach((id, i) => {
        casStars[id].position.copy(posCasMap[id]);
        if (i < orderCAS.length - 1) {
            updateArc(casLines[i], posCasMap[id], posCasMap[orderCAS[i + 1]]);
        }
    });

    // --- Ursa Minor / Little Dipper (α=Polaris at tail end) ---
    const posUMiMap = {};
    STARS_UMi.forEach(s => posUMiMap[s.id] = raDecToWorld(s.ra, s.dec, m, t));

    // 북극성은 꼬리 끝: 지구축 방향으로 '정확히' 고정(스냅)
    posUMiMap['alp'] = nAxis.clone().multiplyScalar(R_SKY);

    // 기존 체인
    const orderUMi = ['alp', 'del', 'eps', 'zet', 'eta', 'gam', 'bet'];
    orderUMi.forEach((id, i) => {
        umiStars[id].position.copy(posUMiMap[id]);
        if (i < orderUMi.length - 1) {
            updateArc(umiLines[i], posUMiMap[id], posUMiMap[orderUMi[i + 1]]);
        }
    });

    // ★ 바가지 닫기: β ↔ ζ
    updateArc(umiLines[6], posUMiMap['bet'], posUMiMap['zet']);

    [...Object.values(dipStars), ...Object.values(casStars), ...Object.values(umiStars)]
    .forEach(mesh => mesh.position.setLength(R_SKY));
}

// ─────────────────────────────────────────────
// Update (sun, sky, leaves, constellations)
// ─────────────────────────────────────────────
function updateSunAndPath() {
    const { m, t } = getSafeInputs();

    const δ = seasonalDeclinationRadKR(m);
    const H = deg2rad(15 * (MIDDAY_LOCAL - t));

    // 천구 갱신
    sunDecl.rotation.set(-δ, 0, 0);
    spinGroup.rotation.set(0, H, 0);

    // 적도선 표시/숨김
    earthAxis.setDeclination(δ);

    // 태양 월드 위치/고도
    const sunWorld = new THREE.Vector3();
    sun.getWorldPosition(sunWorld);
    const alt = Math.asin(THREE.MathUtils.clamp(sunWorld.y / R, -1, 1));
    sun.visible = alt > -deg2rad(1);

    sky.update(alt);

    // 태양 경로
    const steps = 241;
    const arr = new Float32Array(steps * 3);
    for (let i = 0; i < steps; i++) {
        const th = (i / (steps - 1)) * 24;
        const HH = deg2rad(15 * (MIDDAY_LOCAL - th));
        const p = sunWorldPosFrom(δ, HH);
        arr[i * 3 + 0] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
    }
    sunPathGeom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    sunPathGeom.computeBoundingSphere();

    // 그림자
    dir.position.copy(sunWorld).normalize().multiplyScalar(120);
    updateShadowLightDir(dir, allShadows);
    const visible = alt > 0.0;
    for (const s of allShadows)
        s.visible = visible;

    const fade = THREE.MathUtils.clamp(
            (alt - SUN_FADE_START) / (SUN_FADE_END - SUN_FADE_START),
            0, 1);
    setShadowUniforms(allShadows, u => {
        u.sunFade.value = fade;
    });

    // HUD
    const season = getSeason(m);
    updateInfoLines([
            '현재 계절', `: ${season}`, '',
            '현재 시각', `: ${toHHMM(t)}`, '',
            '현재 태양 고도', `: ${fmtDeg(alt)}`
        ]).catch(console.error);

    updateSeasonalAppearance(season);

    // 잎 월별 배치
    if (m === 3)
        applyLeafMix(forestLeavesGreen, forestLeavesPink, leafPositions, 0.40);
    else if (m === 4)
        applyLeafMix(forestLeavesGreen, forestLeavesPink, leafPositions, 1.00);
    else if (m === 5)
        applyLeafMix(forestLeavesGreen, forestLeavesPink, leafPositions, 0.60);
    if (m >= 3 && m <= 5)
        clearLeaves(forestLeavesRed, forestLeavesYellow, forestLeavesSnow);
    else if (m >= 6 && m <= 8)
        applyAllToOne(
            forestLeavesGreen,
            [forestLeavesPink, forestLeavesRed, forestLeavesYellow, forestLeavesSnow],
            leafPositions);
    else if (m === 9) {
        applyAutumnMix({
            redMesh: forestLeavesRed,
            yellowMesh: forestLeavesYellow,
            greenMesh: forestLeavesGreen,
            leafPositions,
            treeCount,
            treeInfos,
            coloredRatio: 0.60,
            dropRatio: 0.00
        });
        clearLeaves(forestLeavesPink, forestLeavesSnow);
    } else if (m === 10) {
        applyAutumnMix({
            redMesh: forestLeavesRed,
            yellowMesh: forestLeavesYellow,
            greenMesh: null,
            leafPositions,
            treeCount,
            treeInfos,
            coloredRatio: 1.00,
            dropRatio: 0.00
        });
        clearLeaves(forestLeavesGreen, forestLeavesPink, forestLeavesSnow);
    } else if (m === 11) {
        applyAutumnMix({
            redMesh: forestLeavesRed,
            yellowMesh: forestLeavesYellow,
            greenMesh: null,
            leafPositions,
            treeCount,
            treeInfos,
            coloredRatio: 1.00,
            dropRatio: 0.85
        });
        clearLeaves(forestLeavesGreen, forestLeavesPink, forestLeavesSnow);
    } else if (m === 12 || m === 1 || m === 2) {
        applyWinterLayout({
            month: m,
            snowMesh: forestLeavesSnow,
            greenMesh: forestLeavesGreen,
            leafPositions,
            treeInfos,
            decDropRatio: 0.90,
            febSnowRatio: 0.10
        });
        clearLeaves(forestLeavesPink, forestLeavesRed, forestLeavesYellow);
    }

    resyncAllLeafShadows();

    if (season === '겨울') {
        groundSurface.material = (alt > 0) ? matUnlit : matLit;
    }

    // 별자리 갱신
    updateConstellations(m, t);
}

// ─────────────────────────────────────────────
// Camera HUD
// ─────────────────────────────────────────────
function updateCameraHUD() {
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
        ], {
        color: '#000000'
    }).catch(console.error);
}

// ─────────────────────────────────────────────
// Init (축 생성 → 핸들러 연결 → 최초 업데이트 순서)
// ─────────────────────────────────────────────
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
    // 이벤트 핸들러 연결
    monthEl.oninput = hourEl.oninput = updateSunAndPath;

    // 최초 렌더링/레이아웃
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
