// js/hud.js
import * as THREE from 'three';
import { MCFontRenderer } from '../MCFont.js';

let renderer, camera, scene;

// ─────────────────────────────────────────────
// 배치/스케일 상수
// ─────────────────────────────────────────────
const TITLE_FACTOR = 0.5;
const INFO_FACTOR  = 0.5;
const CAM_FACTOR   = 0.45;

const TITLE_TEXT_SCALE = 2.5;
const INFO_TEXT_SCALE  = 2;
const CAM_TEXT_SCALE   = 2;

const PANEL_PADDING_X = [15, 15];   // [left,right]
const PANEL_PADDING_Y = [15, 15];   // [top,bottom]
const INFO_LINE_HEIGHT_PX = 40;

// 픽셀 고정 레이아웃: 창 크기/브라우저 줌과 무관
function getUiScale() { return 1.0; }

// ─────────────────────────────────────────────
// 오버레이 캔버스(배경 2D / 텍스트 WebGL2)
// ─────────────────────────────────────────────
let bgCanvas, bgCtx;      // 배경(2D)
let hudCanvas, font;      // 텍스트(WebGL2)

function ensureCanvases(){
  if (!bgCanvas){
    bgCanvas = document.getElementById('hud2dbg') || document.createElement('canvas');
    bgCanvas.id = 'hud2dbg';
    bgCanvas.style.position = 'absolute';
    bgCanvas.style.inset = '0';
    bgCanvas.style.pointerEvents = 'none';
    (document.getElementById('app') || document.body).appendChild(bgCanvas);
    bgCtx = bgCanvas.getContext('2d');
    bgCtx.imageSmoothingEnabled = false;
  }
  if (!hudCanvas){
    hudCanvas = document.getElementById('hud2d') || document.createElement('canvas');
    hudCanvas.id = 'hud2d';
    hudCanvas.style.position = 'absolute';
    hudCanvas.style.inset = '0';
    hudCanvas.style.pointerEvents = 'none';
    (document.getElementById('app') || document.body).appendChild(hudCanvas);
  }
}

async function ensureFont(){
  ensureCanvases();
  if (!font){
    font = new MCFontRenderer({ canvas: hudCanvas, basePath: './images/font' });
    await font.init();
  }
  resizeOverlayCanvases();
  font.resize();
}

function resizeOverlayCanvases(){
  const cw = Math.round(renderer?.domElement?.clientWidth  ?? window.innerWidth);
  const ch = Math.round(renderer?.domElement?.clientHeight ?? window.innerHeight);
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  bgCanvas.style.width = hudCanvas.style.width = cw + 'px';
  bgCanvas.style.height = hudCanvas.style.height = ch + 'px';

  const W = Math.round(cw * dpr);
  const H = Math.round(ch * dpr);
  if (bgCanvas.width !== W || bgCanvas.height !== H){ bgCanvas.width = W; bgCanvas.height = H; }
  if (hudCanvas.width !== W || hudCanvas.height !== H){ hudCanvas.width = W; hudCanvas.height = H; }

  bgCtx.setTransform(1,0,0,1,0,0);
  bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
  bgCtx.scale(dpr, dpr);
}

// ─────────────────────────────────────────────
// HUD 블록(타이틀/인포/카메라)
// ─────────────────────────────────────────────
function createHudBlock({
  widthPx,
  lines,
  background = true,
  lineHeightPx = 42,
  paddingX = PANEL_PADDING_X,   // number | [L,R]
  paddingY = PANEL_PADDING_Y,   // number | [T,B]
  textScale = 3,
  anchor = 'topleft',
  offsetPx = [12, 12],
  factor = 1.0,
  textColor = '#ffffff',
  bgColor = 'rgba(60, 66, 74, 0.42)',
  radius = 16,
  border = false,
  minHeightPx = 90            // 배경 있을 때만 적용
}){
  const normPad2 = (v)=> Array.isArray(v) ? v : [v, v];
  const [padL, padR] = normPad2(paddingX);
  const [padT, padB] = normPad2(paddingY);

  const state = {
    widthPx, lineHeightPx,
    paddingX:[padL, padR], paddingY:[padT, padB],
    textScale, anchor, offsetPx: [...offsetPx], factor, textColor,
    lines: Array.isArray(lines) ? lines : [lines],
    rectCSS: { x:0, y:0, w:0, h:0 },   // CSS px 단위
    background, bgColor, radius, border, minHeightPx
  };

  function layout(){
    const s = getUiScale();
    const eff = factor * s;

    const innerH = Math.max(1, state.lines.length) * lineHeightPx
                 + state.paddingY[0] + state.paddingY[1];

    const minH = background ? (state.minHeightPx ?? 0) : 0;
    const hPx = background ? Math.max(minH, innerH) : innerH;

    const widthCSS  = renderer.domElement.clientWidth;
    const heightCSS = renderer.domElement.clientHeight;
    const wS = state.widthPx * eff;
    const hS = hPx * eff;

    // ★ 항상 state.offsetPx를 사용 (동적 재배치 가능)
    const [ox, oy] = state.offsetPx;
    let x = ox, y = oy;
    if (anchor.includes('right'))  x = widthCSS  - wS - ox;
    if (anchor.includes('bottom')) y = heightCSS - hS - oy;

    state.rectCSS = { x, y, w:wS, h:hS };
  }

  async function setLines(next, { color = state.textColor, scale = state.textScale } = {}){
    state.lines = Array.isArray(next) ? next : [next];
    state.textColor = color;
    state.textScale = scale;
  }

  return { state, layout, setLines };
}

// 둥근 사각형
function roundRect(ctx, x, y, w, h, r=12){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

// ─────────────────────────────────────────────
// 전역 블록 + 렌더 루틴
// ─────────────────────────────────────────────
let titleBlock, infoBlock, camBlock;

// 스택 배치 도우미: title 아래 info를 gap만큼 띄워 정렬
function stackInfoBelowTitle(gap = 10){
  if (!titleBlock || !infoBlock) return;
  const y = Math.round(titleBlock.state.rectCSS.y + titleBlock.state.rectCSS.h + gap);
  infoBlock.state.offsetPx = [infoBlock.state.offsetPx[0], y];
  infoBlock.layout();
}

async function redrawOverlay(){
  if (!font) return;

  // 순차 레이아웃 + 스태킹
  titleBlock?.layout();
  stackInfoBelowTitle(10);
  camBlock?.layout();

  resizeOverlayCanvases();
  bgCtx.clearRect(0,0,bgCanvas.width, bgCanvas.height);

  const drawPanel = (b)=>{
    if (!b || !b.state.background) return;
    const { x,y,w,h } = b.state.rectCSS;
    const { bgColor, radius, border } = b.state;
    bgCtx.fillStyle = bgColor;
    roundRect(bgCtx, x, y, w, h, radius);
    bgCtx.fill();
    if (border) {
      bgCtx.strokeStyle = 'rgba(0,0,0,0.35)';
      bgCtx.lineWidth = 1;
      bgCtx.stroke();
    }
  };
  drawPanel(titleBlock);
  drawPanel(infoBlock);
  drawPanel(camBlock);

  // 텍스트(WebGL) — 수직 중앙 정렬
  const blocks = [titleBlock, infoBlock, camBlock].filter(Boolean);
  let first = true;
  for (const b of blocks){
    const st = b.state;
    const eff = st.factor * getUiScale();
    const dpr = font.DPR || window.devicePixelRatio || 1;

    const px   = (v)=> Math.round(v * eff * dpr);
    const toPx = (v)=> Math.round(v * dpr);

    const baseX = toPx(st.rectCSS.x);
    const baseY = toPx(st.rectCSS.y);

    const padL = px(st.paddingX[0]);
    const padR = px(st.paddingX[1]);
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

// ─────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────
export async function initHUD(_renderer, _camera, _scene, options = {}) {
  const { infoInitialLines } = options;
  renderer = _renderer; camera = _camera; scene = _scene;

  await ensureFont();

  titleBlock = createHudBlock({
    widthPx: 560,
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
    widthPx: 270,
    lines: Array.isArray(infoInitialLines) ? infoInitialLines : defaultInfoLines,
    background: true,
    lineHeightPx: INFO_LINE_HEIGHT_PX,
    paddingX: [15, 15],
    paddingY: [15, 15],
    textScale: INFO_TEXT_SCALE,
    anchor: 'topleft',
    offsetPx: [15, 60],  // 초기값(스택 배치에서 Y는 즉시 재설정됨)
    factor: INFO_FACTOR,
    textColor: '#ffffff',
    bgColor: 'rgba(60, 66, 74, 0.42)',
    radius: 10,
    border: false
  });

  camBlock = createHudBlock({
    widthPx: 350,
    lines: ['zoom : -', 'pos  : -'],
    background: false,    // 필요하면 true로 바꾸고 패딩/배경색 지정
    lineHeightPx: 30,
    paddingX: [15, 15],
    paddingY: [15, 15],
    textScale: CAM_TEXT_SCALE,
    anchor: 'topright',
    offsetPx: [15, 5],
    factor: CAM_FACTOR,
    textColor: '#000000'
  });

  await redrawOverlay();
}

export function onHUDResize() {
  if (!renderer) return;
  resizeOverlayCanvases();

  // 리사이즈 때도 동일한 스택 배치
  titleBlock?.layout();
  stackInfoBelowTitle(10);
  camBlock?.layout();

  if (font) font.resize();
  redrawOverlay();
}

export async function updateInfoLines(lines, opts={}){
  if (!infoBlock) return;
  await infoBlock.setLines(lines, opts);
  // 내용이 바뀌면 타이틀 높이가 변할 수도 → 다시 스택
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
