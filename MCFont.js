// MCFont.js  (전체 교체)
export class MCFontRenderer {
  constructor({ canvas, basePath = './images/font' } = {}) {
    this.canvas = canvas;
    this.basePath = basePath.replace(/\/$/, '');

    this.gl = null;
    this.program = null;
    this.loc = {};
    this.vbo = null;
    this.vao = null;
    this.DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    this.ascii = null;
    this.glyphs = new Map();
    this.quoteAlt = {};
  }

  async init() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
    });
    if (!gl) throw new Error('WebGL2 required');
    this.gl = gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const vs = `#version 300 es
precision mediump float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUV;
uniform vec2 uRes;
out vec2 vUV;
void main(){
  vec2 p = aPos / uRes * 2.0 - 1.0;
  p.y = -p.y;
  gl_Position = vec4(p, 0.0, 1.0);
  vUV = aUV;
}`;
    const fs = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec4 uColor;
in vec2 vUV;
out vec4 outColor;
void main(){
  float a = texture(uTex, vUV).a;
  outColor = vec4(uColor.rgb, a * uColor.a);
}`;

    this.program = this._makeProgram(vs, fs);
    this.loc.uRes   = gl.getUniformLocation(this.program, 'uRes');
    this.loc.uColor = gl.getUniformLocation(this.program, 'uColor');
    this.loc.uTex   = gl.getUniformLocation(this.program, 'uTex');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    this.ascii = await this._loadAtlas(`${this.basePath}/default8.png`, 8, 8, true);
    this.resize();
  }

  resize() {
    const cw = Math.round(this.canvas.clientWidth);
    const ch = Math.round(this.canvas.clientHeight);
    if (cw <= 0 || ch <= 0 || !this.gl) return;

    const W = Math.round(cw * this.DPR);
    const H = Math.round(ch * this.DPR);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  // ★ x,y(픽셀 좌표), valign('top'|'middle'|'bottom'), clear(true/false) 추가
  async draw(
    text,
    {
      color = '#ffffff',
      align = 'left',      // left | center | right  (수평 정렬)
      valign = 'top',      // top  | middle | bottom (수직 정렬)
      x = 0,               // 캔버스 픽셀 좌표 (좌상단 기준)
      y = 0,
      clear = true,

      // 폰트 스케일/모드
      scale = 2,
      shadow = true,

      // spacing
      ds = 1.5, spaceMul = 0.5, spacingMul = 1.0,

      // mode/baseline
      mode = 'auto',
      baseline = 'ascii',
      lockLineH = true,

      // kerning-ish
      glyphTrackPx = 2,
      asciiAfterGlyphPadPx = 2.5,
    } = {}
  ) {
    if (!this.ascii) return;

    const gl = this.gl;
    const rgb = this._hexToRgb(color);
    const dp = (n) => Math.round(n * scale);
    const grid = 16;

    let defaultOnly;
    if (mode === 'default') defaultOnly = true;
    else if (mode === 'glyph') defaultOnly = false;
    else if (mode === 'mixed') defaultOnly = null;
    else {
      defaultOnly = true;
      for (const ch of text) { if (ch.codePointAt(0) > 0x7F) { defaultOnly = false; break; } }
    }

    const need = new Set();
    if (defaultOnly === false || mode === 'glyph') need.add('00');
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (defaultOnly === false || mode === 'glyph') {
        const hi = ((c >>> 8) & 0xFF).toString(16).padStart(2,'0').toUpperCase();
        need.add(hi);
      } else if (defaultOnly === null && c > 0x7F) {
        const hi = ((c >>> 8) & 0xFF).toString(16).padStart(2,'0').toUpperCase();
        need.add(hi);
      }
    }
    await this._ensureGlyphPacks(need);

    const asciiPack = this.ascii;
    const glyph00   = this.glyphs.get('00');

    const hasGlyph =
      mode === 'glyph' ||
      (mode === 'mixed' && [...text].some(ch => ch.codePointAt(0) > 0x7F)) ||
      (mode === 'auto'  && defaultOnly === false);

    const lineH = lockLineH ? dp(16)
      : (defaultOnly === true ? dp(Math.max(8 * ds, 16)) : dp(16));

    let refCenter;
    if (baseline === 'ascii') {
      refCenter = asciiPack.vmet.centerRow * (hasGlyph ? 2.0 : ds);
    } else if (baseline === 'glyph') {
      refCenter = (glyph00 ? glyph00.vmet.centerRow : asciiPack.vmet.centerRow * 2.0);
    } else {
      refCenter = hasGlyph
        ? (glyph00 ? glyph00.vmet.centerRow : asciiPack.vmet.centerRow * 2.0)
        : (asciiPack.vmet.centerRow * ds);
    }

    const spans = [];
    let penX = 0;
    let prevNonSpaceKind = null;
    let dqCount = 0, sqCount = 0;

    const pushAscii = (code) => {
      if (defaultOnly === null && prevNonSpaceKind === 'glyph' && asciiAfterGlyphPadPx > 0) {
        penX += Math.round(scale * asciiAfterGlyphPadPx);
      }
      let pack = asciiPack;
      const cx = code % grid, cy = (code / grid) | 0;
      let u0 = (cx * 8) / pack.w, v0 = (cy * 8) / pack.h;
      let u1 = ((cx + 1) * 8) / pack.w, v1 = ((cy + 1) * 8) / pack.h;

      if (defaultOnly !== false) {
        if (code === 34) { dqCount++; if (dqCount % 2 === 1 && this.quoteAlt[34]) { pack = this.quoteAlt[34]; u0=0;v0=0;u1=1;v1=1; } }
        else if (code === 39) { sqCount++; if (sqCount % 2 === 1 && this.quoteAlt[39]) { pack = this.quoteAlt[39]; u0=0;v0=0;u1=1;v1=1; } }
      }

      const myCenter = asciiPack.vmet.centerRow * ds;
      const yShift = Math.round(dp(refCenter - myCenter));
      spans.push({ pack, x: penX, y: yShift, w: dp(8 * ds), h: dp(8 * ds), u0, v0, u1, v1 });

      penX += Math.round(dp((asciiPack.adv[code] ?? 9) * ds) * spacingMul);
      prevNonSpaceKind = 'ascii';
    };

    const pushGlyph = (code) => {
      if (glyphTrackPx > 0 && prevNonSpaceKind === 'glyph') {
        penX += Math.round(scale * glyphTrackPx);
      }
      const hi = ((code >>> 8) & 0xFF).toString(16).padStart(2,'0').toUpperCase();
      const pack = this.glyphs.get(hi) || glyph00 || asciiPack;
      const lo = code & 0xFF;
      const cx = lo % grid, cy = (lo / grid) | 0;
      const u0 = (cx * 16) / pack.w, v0 = (cy * 16) / pack.h;
      const u1 = ((cx + 1) * 16) / pack.w, v1 = ((cy + 1) * 16) / pack.h;
      const myCenter = pack.vmet.centerRow * 1.0;
      const yShift = Math.round(dp(refCenter - myCenter));
      spans.push({ pack, x: penX, y: yShift, w: dp(16), h: dp(16), u0, v0, u1, v1 });

      penX += Math.round(dp((pack.adv[lo] ?? 17)) * spacingMul);
      prevNonSpaceKind = 'glyph';
    };

    for (let i = 0; i < text.length; i++) {
      const code = text.codePointAt(i);
      if (code === 32) {
        if (defaultOnly === null) {
          const isDefault = (cp) => cp != null && cp <= 0x7F;
          let prev = null, next = null;
          for (let j = i - 1; j >= 0; j--) { const c2 = text.codePointAt(j); if (c2 !== 32) { prev = c2; break; } }
          for (let j = i + 1; j < text.length; j++) { const c2 = text.codePointAt(j); if (c2 !== 32) { next = c2; break; } }
          const bothDefault = isDefault(prev) && isDefault(next);
          if (bothDefault) {
            const advDefaultSpace = (asciiPack.adv[32] ?? 9);
            penX += Math.round(dp(advDefaultSpace * ds) * spaceMul);
          } else {
            const advGlyphSpace = (glyph00 ? (glyph00.adv[32] ?? 17) : 17);
            penX += Math.round(dp(advGlyphSpace) * spaceMul);
          }
        } else if (defaultOnly === true) {
          penX += Math.round(dp((asciiPack.adv[32] ?? 9) * ds) * spaceMul);
        } else {
          const advGlyphSpace = (glyph00 ? (glyph00.adv[32] ?? 17) : 17);
          penX += Math.round(dp(advGlyphSpace) * spaceMul);
        }
        prevNonSpaceKind = null;
        continue;
      }
      if (defaultOnly === true) pushAscii(code);
      else if (defaultOnly === false) pushGlyph(code);
      else { if (code <= 0x7F) pushAscii(code); else pushGlyph(code); }
    }

    // ★ 좌표 기반 배치 (좌상단 기준 x,y + 정렬)
    let baseX = Math.round(x);
    if (align === 'center') baseX = Math.round(x - penX / 2);
    else if (align === 'right') baseX = Math.round(x - penX);

    let baseY;
    if (valign === 'middle') baseY = Math.round(y - lineH / 2);
    else if (valign === 'bottom') baseY = Math.round(y - lineH);
    else baseY = Math.round(y); // 'top'

    // Batch by texture
    const runs = [];
    let cur = null;
    for (const s of spans) {
      if (!cur || cur.pack !== s.pack) { cur = { pack: s.pack, list: [] }; runs.push(cur); }
      cur.list.push(s);
    }

    if (clear) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.program);
    gl.uniform2f(this.loc.uRes, this.canvas.width, this.canvas.height);

    const drawRun = (run, colorArr, ox, oy) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, run.pack.tex);
      gl.uniform1i(this.loc.uTex, 0);
      gl.uniform4f(this.loc.uColor, colorArr[0], colorArr[1], colorArr[2], colorArr[3]);

      const verts = new Float32Array(run.list.length * 6 * 4);
      let p = 0;
      for (const q of run.list) {
        const x0 = baseX + ox + q.x, y0 = baseY + oy + q.y;
        const x1 = x0 + q.w, y1 = y0 + q.h;
        verts.set([
          x0, y0, q.u0, q.v0,
          x1, y0, q.u1, q.v0,
          x0, y1, q.u0, q.v1,
          x0, y1, q.u0, q.v1,
          x1, y0, q.u1, q.v0,
          x1, y1, q.u1, q.v1
        ], p);
        p += 24;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 4);
    };

    const rgbArr = this._hexToRgb(color).concat(1);
    if (shadow) for (const r of runs) drawRun(r, [0.266,0.266,0.266,1], Math.round(1*scale), Math.round(1*scale));
    for (const r of runs) drawRun(r, rgbArr, 0, 0);
  }

  async _ensureGlyphPacks(set) {
    const jobs = [];
    for (const hi of set) {
      if (!this.glyphs.get(hi)) {
        jobs.push((async () => {
          const p = await this._loadAtlas(`${this.basePath}/glyph_${hi}.png`, 16, 16, false);
          this.glyphs.set(hi, p);
        })());
      }
    }
    if (jobs.length) await Promise.all(jobs);
  }

  async _loadAtlas(url, tileW, tileH, isAscii) {
    const img = await this._loadImage(url);
    const src = document.createElement('canvas');
    src.width = img.width;
    src.height = img.height;
    const ctx = src.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);

    if (isAscii && tileW === 8 && tileH === 8) this._tweakAsciiComma(ctx);

    const tex  = this._createTexture(src);
    const scan = this._scanAlpha(src);
    const adv  = this._buildAdvance(scan, tileW, tileH);
    const vmet = this._buildVerticalMetrics(scan, tileW, tileH);
    const pack = { tex, w: src.width, h: src.height, scan, adv, vmet };

    if (isAscii && tileW === 8 && tileH === 8) this._buildAsciiQuoteAlternates(ctx);
    return pack;
  }

  _loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Failed to load ' + url));
      img.src = url;
    });
  }

  _createTexture(source) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return tex;
  }

  _scanAlpha(source) {
    const cvs = document.createElement('canvas');
    cvs.width = source.width;
    cvs.height = source.height;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    const id = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
    const alpha = new Uint8Array(cvs.width * cvs.height);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = id[p];
    return { alpha, width: cvs.width, height: cvs.height };
  }

  _tweakAsciiComma(ctx) {
    const tileW = 8, tileH = 8, grid = 16;
    const code = 44;
    const cx = code % grid, cy = (code / grid) | 0;
    const x0 = cx * tileW, y0 = cy * tileH;
    const imgData = ctx.getImageData(x0, y0, tileW, tileH);
    const src = new Uint8ClampedArray(imgData.data);
    const dst = imgData.data;
    const moveRows = [5, 6];
    for (const py of moveRows) {
      for (let px = tileW - 2; px >= 0; px--) {
        const si = (py * tileW + px) * 4;
        const di = (py * tileW + (px + 1)) * 4;
        const a = src[si + 3];
        if (a > 0) {
          dst[di]   = src[si];
          dst[di+1] = src[si+1];
          dst[di+2] = src[si+2];
          dst[di+3] = src[si+3];
          dst[si] = dst[si+1] = dst[si+2] = dst[si+3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, x0, y0);
  }

  _buildAsciiQuoteAlternates(ctx) {
    const tileW = 8, tileH = 8, grid = 16;
    const makeAltPack = (code, shiftsPerRow) => {
      const cx = code % grid, cy = (code / grid) | 0;
      const x0 = cx * tileW, y0 = cy * tileH;
      const srcData = ctx.getImageData(x0, y0, tileW, tileH).data;

      const dst = document.createElement('canvas');
      dst.width = tileW; dst.height = tileH;
      const dctx = dst.getContext('2d', { willReadFrequently: true });
      const out = dctx.createImageData(tileW, tileH);
      const pixels = out.data;

      for (let y = 0; y < tileH; y++) {
        const shift = shiftsPerRow[y] || 0;
        if (shift === 0) {
          for (let x = 0; x < tileW; x++) {
            const si = (y * tileW + x) * 4;
            const di = si;
            pixels[di]   = srcData[si];
            pixels[di+1] = srcData[si+1];
            pixels[di+2] = srcData[si+2];
            pixels[di+3] = srcData[si+3];
          }
        } else if (shift < 0) {
          for (let x = 1; x < tileW; x++) {
            const si = (y * tileW + x) * 4;
            const di = (y * tileW + (x + shift)) * 4;
            pixels[di]   = srcData[si];
            pixels[di+1] = srcData[si+1];
            pixels[di+2] = srcData[si+2];
            pixels[di+3] = srcData[si+3];
          }
        } else {
          for (let x = tileW - 2; x >= 0; x--) {
            const si = (y * tileW + x) * 4;
            const di = (y * tileW + (x + shift)) * 4;
            pixels[di]   = srcData[si];
            pixels[di+1] = srcData[si+1];
            pixels[di+2] = srcData[si+2];
            pixels[di+3] = srcData[si+3];
          }
        }
      }

      dctx.putImageData(out, 0, 0);
      const tex = this._createTexture(dst);
      return { tex, w: tileW, h: tileH };
    };

    const shifts = [-1, -1, +1, 0, 0, 0, 0, 0];
    this.quoteAlt[34] = makeAltPack(34, shifts);
    this.quoteAlt[39] = makeAltPack(39, shifts);
  }

  _buildAdvance(scan, tileW, tileH) {
    const grid = 16;
    const adv = new Uint16Array(256);
    for (let idx = 0; idx < 256; idx++) {
      const cx = idx % grid, cy = (idx / grid) | 0;
      const x0 = cx * tileW, x1 = x0 + tileW - 1;
      const y0 = cy * tileH, y1 = y0 + tileH - 1;
      let left = x0, right = x1;
      for (; left <= x1; left++) if (this._colHasOpaque(scan, left, y0, y1)) break;
      for (; right >= x0; right--) if (this._colHasOpaque(scan, right, y0, y1)) break;
      if (right < left) { adv[idx] = tileW; continue; }
      const visible = (right - left + 1);
      adv[idx] = visible + 1;
    }
    return adv;
  }

  _buildVerticalMetrics(scan, tileW, tileH) {
    const grid = 16;
    let sumCenter = 0, count = 0;
    for (let idx = 0; idx < 256; idx++) {
      const cx = idx % grid, cy = (idx / grid) | 0;
      const x0 = cx * tileW, x1 = x0 + tileW - 1;
      const y0 = cy * tileH, y1 = y0 + tileH - 1;
      let top = -1, bottom = -1;
      outerTop: for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (scan.alpha[y * scan.width + x] > 0) { top = y; break outerTop; }
        }
      }
      outerBottom: for (let y = y1; y >= y0; y--) {
        for (let x = x0; x <= x1; x++) {
          if (scan.alpha[y * scan.width + x] > 0) { bottom = y; break outerBottom; }
        }
      }
      if (top >= 0 && bottom >= 0) { sumCenter += ((top + bottom) / 2 - y0); count++; }
    }
    const centerRow = count ? (sumCenter / count) : (tileH / 2);
    return { centerRow, tileH };
  }

  _colHasOpaque(scan, x, y0, y1) {
    const { alpha, width } = scan;
    for (let y = y0; y <= y1; y++) if (alpha[y * width + x] > 0) return true;
    return false;
  }

  _makeProgram(vsSrc, fsSrc) {
  const gl = this.gl;
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || 'unknown';
      gl.deleteShader(sh);
      throw new Error('Shader compile failed: ' + log);
    }
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || 'unknown';
    gl.deleteProgram(p);
    throw new Error('Program link failed: ' + log);
  }
  return p;
}

  _hexToRgb(hex) {
    const n = hex.replace('#', '');
    return [
      parseInt(n.slice(0, 2), 16) / 255,
      parseInt(n.slice(2, 4), 16) / 255,
      parseInt(n.slice(4, 6), 16) / 255
    ];
  }
}
