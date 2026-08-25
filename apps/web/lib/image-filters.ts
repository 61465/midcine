// Pure client-side image filters — operate on Canvas ImageData in the browser.
// No server calls. Used as post-processing on top of the Cornerstone3D viewport.

export interface FilterConfig {
  sharpen: { enabled: boolean; intensity: number }; // 0-100
  edge: { enabled: boolean; threshold: number }; // 0-255
  emboss: { enabled: boolean };
  gamma: { enabled: boolean; value: number }; // 0.1-3.0
  histEq: { enabled: boolean };
  smooth: { enabled: boolean; radius: number }; // 1-3
  pseudo: { enabled: boolean; map: 'jet' | 'hot' | 'plasma' | 'viridis' };
  vignette: { enabled: boolean; strength: number }; // 0-1
  clarity: { enabled: boolean; strength: number }; // 0-1
  bone: { enabled: boolean; threshold: number }; // 0-255
  invert: { enabled: boolean };
}

export const DEFAULT_FILTERS: FilterConfig = {
  sharpen: { enabled: false, intensity: 50 },
  edge: { enabled: false, threshold: 60 },
  emboss: { enabled: false },
  gamma: { enabled: false, value: 1.0 },
  histEq: { enabled: false },
  smooth: { enabled: false, radius: 1 },
  pseudo: { enabled: false, map: 'jet' },
  vignette: { enabled: false, strength: 0.4 },
  clarity: { enabled: false, strength: 0.5 },
  bone: { enabled: false, threshold: 180 },
  invert: { enabled: false },
};

const COLORMAPS: Record<
  string,
  (v: number) => [number, number, number]
> = {
  jet: (v) => {
    const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 3)));
    const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 2)));
    const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * v - 1)));
    return [r * 255, g * 255, b * 255];
  },
  hot: (v) => {
    const r = Math.min(1, v * 3);
    const g = Math.max(0, Math.min(1, v * 3 - 1));
    const b = Math.max(0, Math.min(1, v * 3 - 2));
    return [r * 255, g * 255, b * 255];
  },
  plasma: (v) => [
    Math.max(0, Math.min(255, 40 + v * 220)),
    Math.max(0, Math.min(255, 10 + v * v * 220)),
    Math.max(0, Math.min(255, 200 - v * 180)),
  ],
  viridis: (v) => [
    Math.max(0, Math.min(255, 68 + v * 187)),
    Math.max(0, Math.min(255, 1 + v * 231)),
    Math.max(0, Math.min(255, 84 + (1 - v) * 60)),
  ],
};

function copy(id: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
}

function convolve3x3(src: ImageData, kernel: number[], divisor = 1, bias = 0): ImageData {
  const w = src.width;
  const h = src.height;
  const out = new ImageData(w, h);
  const s = src.data;
  const d = out.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * w + (x + kx)) * 4;
          const kv = kernel[k++]!;
          r += s[idx]! * kv;
          g += s[idx + 1]! * kv;
          b += s[idx + 2]! * kv;
        }
      }
      const oi = (y * w + x) * 4;
      d[oi] = Math.max(0, Math.min(255, r / divisor + bias));
      d[oi + 1] = Math.max(0, Math.min(255, g / divisor + bias));
      d[oi + 2] = Math.max(0, Math.min(255, b / divisor + bias));
      d[oi + 3] = s[oi + 3]!;
    }
  }
  return out;
}

function sobel(src: ImageData, threshold: number): ImageData {
  const w = src.width;
  const h = src.height;
  const out = new ImageData(w, h);
  const s = src.data;
  const d = out.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const gx =
        -s[((y - 1) * w + (x - 1)) * 4]! - 2 * s[(y * w + (x - 1)) * 4]! - s[((y + 1) * w + (x - 1)) * 4]! +
        s[((y - 1) * w + (x + 1)) * 4]! + 2 * s[(y * w + (x + 1)) * 4]! + s[((y + 1) * w + (x + 1)) * 4]!;
      const gy =
        -s[((y - 1) * w + (x - 1)) * 4]! - 2 * s[((y - 1) * w + x) * 4]! - s[((y - 1) * w + (x + 1)) * 4]! +
        s[((y + 1) * w + (x - 1)) * 4]! + 2 * s[((y + 1) * w + x) * 4]! + s[((y + 1) * w + (x + 1)) * 4]!;
      const m = Math.hypot(gx, gy);
      const on = m > threshold ? 255 : 0;
      d[idx] = on;
      d[idx + 1] = on;
      d[idx + 2] = on;
      d[idx + 3] = s[idx + 3]!;
    }
  }
  return out;
}

function gamma(src: ImageData, g: number): ImageData {
  const out = copy(src);
  const d = out.data;
  const inv = 1 / Math.max(0.05, g);
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, inv));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]!]!;
    d[i + 1] = lut[d[i + 1]!]!;
    d[i + 2] = lut[d[i + 2]!]!;
  }
  return out;
}

function histEqualize(src: ImageData): ImageData {
  const out = copy(src);
  const d = out.data;
  const hist = new Uint32Array(256);
  const lum = new Uint8Array(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const l = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
    lum[j] = l;
    hist[l]!++;
  }
  const cdf = new Uint32Array(256);
  cdf[0] = hist[0]!;
  for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1]! + hist[i]!;
  const total = lum.length;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round((cdf[i]! / total) * 255);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = lut[lum[j]!]!;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  return out;
}

function boxBlur(src: ImageData, radius: number): ImageData {
  const w = src.width;
  const h = src.height;
  const out = new ImageData(w, h);
  const s = src.data;
  const d = out.data;
  const r = Math.max(1, Math.min(5, radius));
  const area = (r * 2 + 1) ** 2;
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let ky = -r; ky <= r; ky++) {
        for (let kx = -r; kx <= r; kx++) {
          const i = ((y + ky) * w + (x + kx)) * 4;
          sr += s[i]!;
          sg += s[i + 1]!;
          sb += s[i + 2]!;
        }
      }
      const oi = (y * w + x) * 4;
      d[oi] = sr / area;
      d[oi + 1] = sg / area;
      d[oi + 2] = sb / area;
      d[oi + 3] = s[oi + 3]!;
    }
  }
  return out;
}

function pseudoColor(src: ImageData, map: keyof typeof COLORMAPS): ImageData {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  const fn = COLORMAPS[map]!;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.299 * s[i]! + 0.587 * s[i + 1]! + 0.114 * s[i + 2]!) / 255;
    const [r, g, b] = fn(lum);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = s[i + 3]!;
  }
  return out;
}

function vignette(src: ImageData, strength: number): ImageData {
  const out = copy(src);
  const w = src.width;
  const h = src.height;
  const d = out.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.hypot(cx, cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.hypot(x - cx, y - cy) / maxD;
      const f = Math.max(0, 1 - dist * strength * 1.4);
      const i = (y * w + x) * 4;
      d[i] = d[i]! * f;
      d[i + 1] = d[i + 1]! * f;
      d[i + 2] = d[i + 2]! * f;
    }
  }
  return out;
}

function clarity(src: ImageData, strength: number): ImageData {
  const blurred = boxBlur(src, 2);
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const b = blurred.data;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, s[i]! + (s[i]! - b[i]!) * strength));
    d[i + 1] = Math.max(0, Math.min(255, s[i + 1]! + (s[i + 1]! - b[i + 1]!) * strength));
    d[i + 2] = Math.max(0, Math.min(255, s[i + 2]! + (s[i + 2]! - b[i + 2]!) * strength));
    d[i + 3] = s[i + 3]!;
  }
  return out;
}

function boneMarker(src: ImageData, threshold: number): ImageData {
  const out = copy(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    if (lum > threshold) {
      d[i] = 255;
      d[i + 1] = 240;
      d[i + 2] = 120;
    }
  }
  return out;
}

function invert(src: ImageData): ImageData {
  const out = copy(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]!;
    d[i + 1] = 255 - d[i + 1]!;
    d[i + 2] = 255 - d[i + 2]!;
  }
  return out;
}

export function applyFilters(src: ImageData, cfg: FilterConfig): ImageData {
  let cur = src;
  if (cfg.gamma.enabled) cur = gamma(cur, cfg.gamma.value);
  if (cfg.histEq.enabled) cur = histEqualize(cur);
  if (cfg.smooth.enabled) cur = boxBlur(cur, cfg.smooth.radius);
  if (cfg.sharpen.enabled) {
    const i = cfg.sharpen.intensity / 100;
    const k = [0, -i, 0, -i, 1 + 4 * i, -i, 0, -i, 0];
    cur = convolve3x3(cur, k, 1);
  }
  if (cfg.clarity.enabled) cur = clarity(cur, cfg.clarity.strength);
  if (cfg.emboss.enabled)
    cur = convolve3x3(cur, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 128);
  if (cfg.edge.enabled) cur = sobel(cur, cfg.edge.threshold);
  if (cfg.pseudo.enabled) cur = pseudoColor(cur, cfg.pseudo.map);
  if (cfg.bone.enabled) cur = boneMarker(cur, cfg.bone.threshold);
  if (cfg.vignette.enabled) cur = vignette(cur, cfg.vignette.strength);
  if (cfg.invert.enabled) cur = invert(cur);
  return cur;
}

export function hasAnyFilter(cfg: FilterConfig): boolean {
  return Object.values(cfg).some((v) => (v as any).enabled === true);
}
