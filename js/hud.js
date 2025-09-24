// js/hud.js
import * as THREE from 'three';
import { MCFontRenderer } from '../MCFont.js';

let renderer, camera, scene;

// ─── 기준 해상도(비율 유지용) ───────────────────────────────────────
const BASE_W = 1280;
const BASE_H = 720;
function getUiScale() {
    const cw = Math.max(1, Math.round(renderer?.domElement?.clientWidth ?? window.innerWidth));
    const ch = Math.max(1, Math.round(renderer?.domElement?.clientHeight ?? window.innerHeight));
    const s = Math.min(cw / BASE_W, ch / BASE_H);
    return THREE.MathUtils.clamp(s, 0.75, 1.35);
}

// 상대 스케일
const TITLE_FACTOR = 0.52;
const INFO_FACTOR = 0.52;
const CAM_FACTOR = 0.48;

const TITLE_TEXT_SCALE = 2.5;
const INFO_TEXT_SCALE = 2.0;
const CAM_TEXT_SCALE = 2.0;

const PANEL_PADDING_X = [15, 15];
const PANEL_PADDING_Y = [15, 15];
const INFO_LINE_HEIGHT_PX = 40;

// ─── 오버레이 캔버스 & 부모 얻기 ────────────────────────────────────
let bgCanvas, bgCtx; // 배경(2D)
let hudCanvas, font; // 텍스트(WebGL2)

function getHudParent() {
    const p = renderer?.domElement?.parentElement || document.getElementById('app') || document.body;
    // 부모가 position: static이면 absolute 배치가 화면 전체 기준이 되므로 relative 부여
    if (p && getComputedStyle(p).position === 'static')
        p.style.position = 'relative';
    return p;
}

function ensureCanvases() {
    const parent = getHudParent();
    if (!bgCanvas) {
        bgCanvas = document.getElementById('hud2dbg') || document.createElement('canvas');
        bgCanvas.id = 'hud2dbg';
        Object.assign(bgCanvas.style, {
            position: 'absolute',
            left: '0px',
            top: '0px',
            pointerEvents: 'none'
        });
        parent.appendChild(bgCanvas);
        bgCtx = bgCanvas.getContext('2d');
        bgCtx.imageSmoothingEnabled = false;
    }
    if (!hudCanvas) {
        hudCanvas = document.getElementById('hud2d') || document.createElement('canvas');
        hudCanvas.id = 'hud2d';
        Object.assign(hudCanvas.style, {
            position: 'absolute',
            left: '0px',
            top: '0px',
            pointerEvents: 'none'
        });
        parent.appendChild(hudCanvas);
    }
}

async function ensureFont() {
    ensureCanvases();
    if (!font) {
        font = new MCFontRenderer({
            canvas: hudCanvas,
            basePath: './images/font'
        });
        await font.init();
        try {
            font.DPR = 1;
        } catch {}
    }
    resizeOverlayCanvases();
    font.resize();
}

function resizeOverlayCanvases() {
    const cw = Math.round(renderer?.domElement?.clientWidth ?? window.innerWidth);
    const ch = Math.round(renderer?.domElement?.clientHeight ?? window.innerHeight);

    // ★ 렌더러 캔버스의 CSS 크기에 정확히 맞춘다 (100% 금지)
    bgCanvas.style.width = hudCanvas.style.width = `${cw}px`;
    bgCanvas.style.height = hudCanvas.style.height = `${ch}px`;

    // ★ 내부 해상도도 CSS px로 1:1
    if (bgCanvas.width !== cw || bgCanvas.height !== ch) {
        bgCanvas.width = cw;
        bgCanvas.height = ch;
    }
    if (hudCanvas.width !== cw || hudCanvas.height !== ch) {
        hudCanvas.width = cw;
        hudCanvas.height = ch;
    }

    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.clearRect(0, 0, cw, ch);
}

// ─── HUD 블록(타이틀/인포/카메라) ──────────────────────────────────
function createHudBlock({
    // widthPx: number | (viewportWidthCSS:number)=>number
    widthPx,
    lines,
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
}) {
    const normPad2 = (v) => Array.isArray(v) ? v : [v, v];
    const [padL, padR] = normPad2(paddingX);
    const [padT, padB] = normPad2(paddingY);

    const state = {
        widthPx,
        lineHeightPx,
        paddingX: [padL, padR],
        paddingY: [padT, padB],
        textScale,
        anchor,
        offsetPx: [...offsetPx],
        factor,
        textColor,
        lines: Array.isArray(lines) ? lines : [lines],
        rectCSS: {
            x: 0,
            y: 0,
            w: 0,
            h: 0
        },
        background,
        bgColor,
        radius,
        border,
        minHeightPx
    };

    function layout() {
        const s = getUiScale();
        const eff = state.factor * s;

        const innerH = Math.max(1, state.lines.length) * state.lineHeightPx
             + state.paddingY[0] + state.paddingY[1];

        const minH = state.background ? (state.minHeightPx ?? 0) : 0;
        const hPx = state.background ? Math.max(minH, innerH) : innerH;

        const widthCSS = Math.round(renderer.domElement.clientWidth);
        const heightCSS = Math.round(renderer.domElement.clientHeight);

        const baseW = (typeof state.widthPx === 'function')
         ? state.widthPx(widthCSS)
         : state.widthPx;

        const wS = baseW * eff;
        const hS = hPx * eff;

        const [ox, oy] = state.offsetPx;
        let x = ox,
        y = oy;
        if (state.anchor.includes('right'))
            x = widthCSS - wS - ox;
        if (state.anchor.includes('bottom'))
            y = heightCSS - hS - oy;

        state.rectCSS = {
            x,
            y,
            w: wS,
            h: hS
        };
    }

    async function setLines(next, {
        color = state.textColor,
        scale = state.textScale
    } = {}) {
        state.lines = Array.isArray(next) ? next : [next];
        state.textColor = color;
        state.textScale = scale;
    }

    return {
        state,
        layout,
        setLines
    };
}

function roundRect(ctx, x, y, w, h, r = 12) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ─── 전역 블록 + 렌더 루틴 ─────────────────────────────────────────
let titleBlock, infoBlock, camBlock;

function stackInfoBelowTitle(gap = 10) {
    if (!titleBlock || !infoBlock)
        return;
    const y = Math.round(titleBlock.state.rectCSS.y + titleBlock.state.rectCSS.h + gap);
    infoBlock.state.offsetPx = [infoBlock.state.offsetPx[0], y];
    infoBlock.layout();
}

async function redrawOverlay() {
    if (!font)
        return;

    titleBlock?.layout();
    stackInfoBelowTitle(10);
    camBlock?.layout();

    resizeOverlayCanvases();

    // 배경(2D)
    const drawPanel = (b) => {
        if (!b || !b.state.background)
            return;
        const { x, y, w, h } = b.state.rectCSS;
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
    const cw = bgCanvas.width,
    ch = bgCanvas.height;
    bgCtx.clearRect(0, 0, cw, ch);
    drawPanel(titleBlock);
    drawPanel(infoBlock);
    drawPanel(camBlock);

    // 텍스트(WebGL) — CSS px 좌표 그대로 (DPR 곱 X)
    const blocks = [titleBlock, infoBlock, camBlock].filter(Boolean);
    let first = true;
    for (const b of blocks) {
        const st = b.state;
        const eff = st.factor * getUiScale();

        const px = (v) => Math.round(v * eff);
        const toPx = (v) => Math.round(v);

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

        for (const line of st.lines) {
            await font.draw(line, {
                ...drawOpts,
                x: startX,
                y
            });
            drawOpts.clear = false;
            y += lineStep;
        }
        first = false;
    }
}

// ─── 공개 API ──────────────────────────────────────────────────────
export async function initHUD(_renderer, _camera, _scene, options = {}) {
    const { infoInitialLines } = options;
    renderer = _renderer;
    camera = _camera;
    scene = _scene;

    await ensureFont();

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    titleBlock = createHudBlock({
        widthPx: (vw) => clamp(vw * 0.42, 420, 600),
        lines: '마인크래프트 천구 시뮬레이터',
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
        widthPx: (vw) => clamp(vw * 0.22, 260, 420),
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
        widthPx: (vw) => clamp(vw * 0.27, 260, 480),
        lines: ['zoom : -', 'pos  : -'],
        background: false,
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
    if (!renderer)
        return;
    resizeOverlayCanvases();

    titleBlock?.layout();
    stackInfoBelowTitle(10);
    camBlock?.layout();

    if (font) {
        try {
            font.DPR = 1;
        } catch {}
        font.resize();
    }
    redrawOverlay();
}

export async function updateInfoLines(lines, opts = {}) {
    if (!infoBlock)
        return;
    await infoBlock.setLines(lines, opts);
    titleBlock?.layout();
    stackInfoBelowTitle(10);
    await redrawOverlay();
}

export async function updateCamStatus(lines, {
    color = '#000000'
} = {}) {
    if (!camBlock)
        return;
    await camBlock.setLines(lines, {
        color,
        scale: CAM_TEXT_SCALE
    });
    camBlock.layout();
    await redrawOverlay();
}
