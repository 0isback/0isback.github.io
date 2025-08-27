// js/hud.js
import * as THREE from 'three';
import { MCFontRenderer } from '../MCFont.js';

let renderer, camera, scene;

// ── 기준 해상도(비율 유지) ─────────────────────────────────────────
const BASE_W = 1280;
const BASE_H = 720;
function getUiScale() {
  const cw = Math.max(1, Math.round(renderer?.domElement?.clientWidth  ?? window.innerWidth));
  const ch = Math.max(1, Math.round(renderer?.domElement?.clientHeight ?? window.innerHeight));
  const s  = Math.min(cw / BASE_W, ch / BASE_H);
  return THREE.MathUtils.clamp(s, 0.75, 1.35);
}

// 스케일 계수
const TITLE_FACTOR = 0.52;
const INFO_FACTOR  = 0.52;
const CAM_FACTOR   = 0.48;

const TITLE_TEXT_SCALE = 2.5;
const INFO_TEXT_SCALE  = 2.5;
const CAM_TEXT_SCALE   = 2.5;

const PANEL_PADDING_X = [15, 15];
const PANEL_PADDING_Y = [15, 15];
const INFO_LINE_HEIGHT_PX = 40;

// ── 오버레이 캔버스 & 부모 ────────────────────────────────────────
let bgCanvas, bgCtx;
let hudCanvas, font;
let DPR = 1;

function getHudParent() {
  const p = renderer?.domElement?.parentElement || document.getElementById('app') || document.body;
  if (p && getComputedStyle(p).position === 'static') p.style.position = 'relative';
  return p;
}

function ensureCanvases(){
  const parent = getHudParent();
  if (!bgCanvas){
    bgCanvas = document.getElementById('hud2dbg') || document.createElement('canvas');
    bgCanvas.id = 'hud2dbg';
    Object.assign(bgCanvas.style, { position:'absolute', left:'0px', top:'0px', pointerEvents:'none' });
    parent.appendChild(bgCanvas);
    bgCtx = bgCanvas.getContext('2d'); bgCtx.imageSmoothingEnabled = false;
  }
  if (!hudCanvas){
    hudCanvas = document.getElementById('hud2d') || document.createElement('canvas');
    hudCanvas.id = 'hud2d';
    Object.assign(hudCanvas.style, { position:'absolute', left:'0px', top:'0px', pointerEvents:'none' });
    parent.appendChild(hudCanvas);
  }
}

async function ensureFont(){
  ensureCanvases();
  if (!font){
    font = new MCFontRenderer({ canvas: hudCanvas, basePath: './images/font' });
    await font.init();
  }
  // 고해상도 텍스트용 DPR 적용
  DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));   // 필요하면 2→1.5로 낮춰도 OK
  try { font.DPR = DPR; } catch {}
  resizeOverlayCanvases();
  font.resize();
}

function resizeOverlayCanvases(){
  const cw = Math.round(renderer?.domElement?.clientWidth  ?? window.innerWidth);
  const ch = Math.round(renderer?.domElement?.clientHeight ?? window.innerHeight);

  // CSS 크기 = 렌더러와 동일 (정확한 px)
  bgCanvas.style.width = hudCanvas.style.width = `${cw}px`;
  bgCanvas.style.height = hudCanvas.style.height = `${ch}px`;

  // 내부 해상도 = CSS * DPR (고해상도)
  const W = Math.round(cw * DPR);
  const H = Math.round(ch * DPR);
  if (bgCanvas.width !== W || bgCanvas.height !== H){ bgCanvas.width = W; bgCanvas.height = H; }
  if (hudCanvas.width !== W || hudCanvas.height !== H){ hudCanvas.width = W; hudCanvas.height = H; }

  // 배경은 CSS좌표로 그리되, 컨텍스트에 DPR 변환을 미리 적용
  bgCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  bgCtx.clearRect(0, 0, cw, ch);
}

// ── HUD 블록 ───────────────────────────────────────────────────────
function createHudBlock({
  // widthPx: number | (viewportWidthCSS:number)=>number
  widthPx, lines,
  background = true,
  lineHeightPx = 42,
  paddingX = PANEL_PADDING_X,
  paddingY = PANEL_PADDING_Y,
  textScale = 3,
  anchor = 'topleft',
  offsetPx = [12, 12],
  factor = 1.0,
  textColor = '#ffffff',
  bgColor = 'rgba(60, 66, 74, 0.42)',
  radius = 16,
  border = false,
  minHeightPx = 90
}){
  const norm2 = (v)=> Array.isArray(v) ? v : [v, v];
  const [padL0, padR0] = norm2(paddingX);
  const [padT0, padB0] = norm2(paddingY);

  const state = {
    widthPx, lineHeightPx,
    paddingX:[padL0, padR0], paddingY:[padT0, padB0],
    textScale, anchor, offsetPx: [...offsetPx], factor, textColor,
    lines: Array.isArray(lines) ? lines : [lines],
    rectCSS: { x:0, y:0, w:0, h:0 },
    background, bgColor, radius, border, minHeightPx
  };

  function layout(){
    const s = getUiScale();
    const eff = state.factor * s;

    // 텍스트와 동일한 정수 계산(단위: CSS px)
    const padL = Math.round(state.paddingX[0] * eff);
    const padR = Math.round(state.paddingX[1] * eff);
    const padT = Math.round(state.paddingY[0] * eff);
    const padB = Math.round(state.paddingY[1] * eff);
    const lineStep = Math.round(state.lineHeightPx * eff);
    const contentH = Math.max(1, state.lines.length) * lineStep;
    const innerH   = contentH + padT + padB;
    const minHcss  = state.background ? Math.round((state.minHeightPx ?? 0) * eff) : 0;
    const hS       = state.background ? Math.max(minHcss, innerH) : innerH;

    const widthCSS  = Math.round(renderer.domElement.clientWidth);
    const heightCSS = Math.round(renderer.domElement.clientHeight);

    const baseW = (typeof state.widthPx === 'function') ? state.widthPx(widthCSS) : state.widthPx;
    const wS    = Math.round(baseW * eff);

    const [ox, oy] = state.offsetPx;
    let x = ox, y = oy;
    if (state.anchor.includes('right'))  x = widthCSS  - wS - ox;
    if (state.anchor.includes('bottom')) y = heightCSS - hS - oy;

    // +1 여유로 배경이 항상 글자보다 크도록
    state.rectCSS = { x, y, w: wS + 1, h: hS + 1 };
  }

  async function setLines(next, { color = state.textColor, scale = state.textScale } = {}){
    state.lines = Array.isArray(next) ? next : [next];
    state.textColor = color;
    state.textScale = scale;
  }

  return { state, layout, setLines };
}

function roundRect(ctx, x, y, w, h, r=12){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

// ── 전역 블록 + 렌더 ───────────────────────────────────────────────
let titleBlock, infoBlock, camBlock;

function stackInfoBelowTitle(gap = 10){
  if (!titleBlock || !infoBlock) return;
  const y = Math.round(titleBlock.state.rectCSS.y + titleBlock.state.rectCSS.h + gap);
  infoBlock.state.offsetPx = [infoBlock.state.offsetPx[0], y];
  infoBlock.layout();
}

async function redrawOverlay(){
  if (!font) return;

  titleBlock?.layout();
  stackInfoBelowTitle(10);
  camBlock?.layout();

  resizeOverlayCanvases();

  // 배경(2D) — CSS px 좌표로 그리고 컨텍스트에 DPR 변환이 적용되어 선명함
  bgCtx.clearRect(0,0, bgCanvas.width / DPR, bgCanvas.height / DPR);
  const drawPanel = (b)=>{
    if (!b || !b.state.background) return;
    const { x,y,w,h } = b.state.rectCSS;
    bgCtx.fillStyle = b.state.bgColor;
    roundRect(bgCtx, x, y, w, h, b.state.radius);
    bgCtx.fill();
    if (b.state.border) {
      bgCtx.strokeStyle = 'rgba(0,0,0,0.35)';
      bgCtx.lineWidth = 1;
      bgCtx.stroke();
    }
  };
  drawPanel(titleBlock);
  drawPanel(infoBlock);
  drawPanel(camBlock);

  // 텍스트(WebGL) — 장치픽셀 좌표 사용 (DPR 반영) → 또렷
  const blocks = [titleBlock, infoBlock, camBlock].filter(Boolean);
  let first = true;
  for (const b of blocks){
    const st = b.state;
    const eff = st.factor * getUiScale();

    const px   = (v)=> Math.round(v * eff * DPR);   // 장치픽셀
    const toPx = (v)=> Math.round(v * DPR);         // CSS px → 장치픽셀

    const baseX = toPx(st.rectCSS.x);
    const baseY = toPx(st.rectCSS.y);

    const padL = px(st.paddingX[0]);
    const padT = px(st.paddingY[0]);
    const padB = px(st.paddingY[1]);
    const startX = baseX + padL;
    const innerH = toPx(st.rectCSS.h) - padT - padB;

    const lineStep = px(st.lineHeightPx);
    const linesTotalH = lineStep * st.lines.length;

    const groupCenterY = baseY + padT + Math.floor(innerH / 2);
    let y = groupCenterY - Math.floor((linesTotalH - lineStep) / 2);

    const drawOpts = {
      align: 'left',
      valign: 'middle',
      color: st.textColor,
      scale: st.textScale * eff,
      shadow: true,
      clear: first
    };

    for (const line of st.lines){
      await font.draw(line, { ...drawOpts, x: startX, y });
      drawOpts.clear = false;
      y += lineStep;
    }
    first = false;
  }
}

// ── 공개 API ───────────────────────────────────────────────────────
export async function initHUD(_renderer, _camera, _scene, options = {}) {
  const { infoInitialLines } = options;
  renderer = _renderer; camera = _camera; scene = _scene;

  await ensureFont();

  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  titleBlock = createHudBlock({
    widthPx: (vw)=> clamp(vw * 0.42, 420, 720),
    lines: '6학년 2학기 과학 2단원. 계절의 변화',
    background: true,
    lineHeightPx: 40,
    paddingX: [15, 15],
    paddingY: [15, 15],
    textScale: TITLE_TEXT_SCALE,
    anchor: 'topleft',
    offsetPx: [15, 15],
    factor: TITLE_FACTOR,
    textColor: '#ffffff',
    bgColor: 'rgba(58, 64, 72, 0.42)',
    radius: 10,
    border: false,
    minHeightPx: 0
  });

  const defaultInfoLines = [
    '현재 계절', ': -', '',
    '현재 시각', ': -', '',
    '현재 태양 고도', ': -'
  ];
  infoBlock = createHudBlock({
    widthPx: (vw)=> clamp(vw * 0.22, 260, 420),
    lines: Array.isArray(infoInitialLines) ? infoInitialLines : defaultInfoLines,
    background: true,
    lineHeightPx: INFO_LINE_HEIGHT_PX,
    paddingX: [15, 15],
    paddingY: [15, 15],
    textScale: INFO_TEXT_SCALE,
    anchor: 'topleft',
    offsetPx: [15, 60],
    factor: INFO_FACTOR,
    textColor: '#ffffff',
    bgColor: 'rgba(60, 66, 74, 0.42)',
    radius: 10,
    border: false
  });

  camBlock = createHudBlock({
    widthPx: (vw)=> clamp(vw * 0.27, 260, 480),
    lines: ['zoom : -', 'pos  : -'],
    background: false,
    lineHeightPx: 30,
    paddingX: [15, 15],
    paddingY: [15, 15],
    textScale: CAM_TEXT_SCALE,
    anchor: 'topright',
    offsetPx: [25, 5],
    factor: CAM_FACTOR,
    textColor: '#000000'
  });

  await redrawOverlay();
}

export function onHUDResize() {
  if (!renderer) return;
  DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  try { if (font) font.DPR = DPR; } catch {}
  resizeOverlayCanvases();

  titleBlock?.layout();
  stackInfoBelowTitle(10);
  camBlock?.layout();

  if (font) font.resize();
  redrawOverlay();
}

export async function updateInfoLines(lines, opts={}){
  if (!infoBlock) return;
  await infoBlock.setLines(lines, opts);
  titleBlock?.layout();
  stackInfoBelowTitle(10);
  await redrawOverlay();
}

export async function updateCamStatus(lines, { color = '#000000' } = {}){
  if (!camBlock) return;
  await camBlock.setLines(lines, { color, scale: CAM_TEXT_SCALE });
  camBlock.layout();
  await redrawOverlay();
}
