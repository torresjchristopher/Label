/**
 * Pre-processes an HTML5 Canvas for Transformer.js TrOCR analysis.
 *
 * Pipeline:
 * 1. Upscale small images to at least 800px wide for reliable OCR
 * 2. Convert to grayscale using luminance weights
 * 3. Apply adaptive local threshold binarization (black text on white background)
 * 4. Output as high-contrast binary image ideal for OCR character segmentation
 */
export function preprocessCanvasForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const processedCanvas = document.createElement('canvas');
  
  // Step 1: Upscale small images — TrOCR accuracy improves above ~800px width
  let scale = 1;
  if (canvas.width < 800) {
    scale = Math.ceil(800 / canvas.width);
  }
  
  processedCanvas.width = canvas.width * scale;
  processedCanvas.height = canvas.height * scale;
  
  const ctx = processedCanvas.getContext('2d');
  if (!ctx) return canvas;
  
  // Use nearest-neighbor for upscaling to preserve sharp edges
  ctx.imageSmoothingEnabled = scale > 1 ? false : true;
  ctx.drawImage(canvas, 0, 0, processedCanvas.width, processedCanvas.height);
  
  try {
    const imgData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
    const d = imgData.data;
    const w = processedCanvas.width;
    const h = processedCanvas.height;
    
    // Step 2: Convert to grayscale
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < d.length; i += 4) {
      const idx = i / 4;
      gray[idx] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    
    // Step 3: Adaptive local threshold binarization
    // Uses a sliding window mean to determine local threshold per pixel.
    // This handles uneven lighting, shadows, and curved bottle surfaces
    // much better than a global threshold.
    const blockSize = Math.max(15, Math.round(Math.min(w, h) / 20) | 1); // odd block size
    const C = 10; // bias constant — pixels must be C darker than local mean to be "text"
    
    // Compute integral image for fast local mean calculation
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += gray[y * w + x];
        integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
      }
    }
    
    const halfBlock = Math.floor(blockSize / 2);
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Window bounds (clamped to image edges)
        const x1 = Math.max(0, x - halfBlock);
        const y1 = Math.max(0, y - halfBlock);
        const x2 = Math.min(w - 1, x + halfBlock);
        const y2 = Math.min(h - 1, y + halfBlock);
        
        const area = (x2 - x1 + 1) * (y2 - y1 + 1);
        
        // Sum of pixels in window via integral image
        const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)]
                  - integral[y1 * (w + 1) + (x2 + 1)]
                  - integral[(y2 + 1) * (w + 1) + x1]
                  + integral[y1 * (w + 1) + x1];
        
        const localMean = sum / area;
        const pixelVal = gray[y * w + x];
        
        // Pixel is "text" (black) if it's darker than local mean minus bias
        const output = pixelVal < (localMean - C) ? 0 : 255;
        
        const i = (y * w + x) * 4;
        d[i] = output;
        d[i + 1] = output;
        d[i + 2] = output;
        d[i + 3] = 255;
      }
    }
    
    ctx.putImageData(imgData, 0, 0);
    return processedCanvas;
  } catch (e) {
    console.warn("Canvas pre-processing fallback:", e);
    return canvas;
  }
}

// ---------------------------------------------------------------------------
// Contrast normalisation and denoise helpers
// ---------------------------------------------------------------------------

/**
 * Apply histogram stretch and mild box-blur denoise to a grayscale pixel array.
 *
 * Steps:
 *  1. Histogram stretching: remap [p5, p95] → [0, 255]
 *  2. 3×3 box-blur for noise suppression
 */
function applyContrastAndDenoise(
  gray: Uint8Array,
  w: number,
  h: number
): Uint8Array {
  // 1. Histogram-based percentile stretch (avoids sorting the full pixel array)
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  const total = w * h;
  const p5Target = Math.floor(total * 0.05);
  const p95Target = Math.floor(total * 0.95);
  let p5 = 0;
  let p95 = 255;
  let cumulative = 0;
  for (let t = 0; t < 256; t++) {
    cumulative += hist[t];
    if (cumulative <= p5Target) p5 = t;
    if (cumulative <= p95Target) p95 = t;
  }
  const range = p95 - p5 || 1;

  const stretched = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    stretched[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - p5) / range) * 255)));
  }

  // 2. 3×3 box-blur
  const blurred = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            sum += stretched[ny * w + nx];
            count++;
          }
        }
      }
      blurred[y * w + x] = Math.round(sum / count);
    }
  }

  return blurred;
}

/**
 * Heuristic deskew: rotate the canvas by a small angle if needed.
 *
 * Uses projection profile analysis on a downsampled (≤300px wide) grayscale
 * version of the image for performance — the angle that produces the sharpest
 * horizontal projection (maximum variance of row sums) is selected.
 * Search range is ±5° in 1° steps.
 */
export function deskewCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Downsample to ≤300px wide for fast projection analysis
  const deskewScale = Math.min(1, 300 / canvas.width);
  const dw = Math.round(canvas.width * deskewScale);
  const dh = Math.round(canvas.height * deskewScale);
  const downCanvas = document.createElement('canvas');
  downCanvas.width = dw;
  downCanvas.height = dh;
  const downCtx = downCanvas.getContext('2d');
  if (!downCtx) return canvas;
  downCtx.drawImage(canvas, 0, 0, dw, dh);

  const imgData = downCtx.getImageData(0, 0, dw, dh);
  const d = imgData.data;
  const w = dw;
  const h = dh;

  // Build grayscale for projection
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i += 4) {
    gray[i / 4] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  let bestAngle = 0;
  let bestVariance = -1;

  for (let angleDeg = -5; angleDeg <= 5; angleDeg++) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = w / 2;
    const cy = h / 2;

    const rowSums = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = Math.round((x - cx) * cos + (y - cy) * sin + cx);
        const ny = Math.round(-(x - cx) * sin + (y - cy) * cos + cy);
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          rowSums[y] += gray[ny * w + nx] < 128 ? 1 : 0;
        }
      }
    }

    const mean = rowSums.reduce((s, v) => s + v, 0) / h;
    const variance = rowSums.reduce((s, v) => s + (v - mean) ** 2, 0) / h;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle = angleDeg;
    }
  }

  if (bestAngle === 0) return canvas;

  const rotated = document.createElement('canvas');
  rotated.width = w;
  rotated.height = h;
  const rCtx = rotated.getContext('2d');
  if (!rCtx) return canvas;

  rCtx.translate(w / 2, h / 2);
  rCtx.rotate((bestAngle * Math.PI) / 180);
  rCtx.drawImage(canvas, -w / 2, -h / 2);
  rCtx.setTransform(1, 0, 0, 1, 0, 0);

  return rotated;
}

/**
 * Create a high-contrast preprocessed canvas using contrast normalisation +
 * denoise + Otsu global threshold. Used as the third retry pass for low-light
 * or glare-affected bottle images.
 */
export function preprocessCanvasHighContrast(
  canvas: HTMLCanvasElement
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;

  const ctx = out.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(canvas, 0, 0);

  try {
    const imgData = ctx.getImageData(0, 0, out.width, out.height);
    const d = imgData.data;
    const w = out.width;
    const h = out.height;

    const gray = new Uint8Array(w * h);
    for (let i = 0; i < d.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }

    const enhanced = applyContrastAndDenoise(gray, w, h);

    // Otsu global threshold
    const hist = new Uint32Array(256);
    for (const v of enhanced) hist[v]++;
    const total = w * h;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let bestThresh = 128;
    let bestVar = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) ** 2;
      if (between > bestVar) {
        bestVar = between;
        bestThresh = t;
      }
    }

    for (let i = 0; i < enhanced.length; i++) {
      const v = enhanced[i] < bestThresh ? 0 : 255;
      const idx = i * 4;
      d[idx] = v;
      d[idx + 1] = v;
      d[idx + 2] = v;
      d[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    return out;
  } catch {
    return canvas;
  }
}

/**
 * Create multiple preprocessing variants of a source canvas for multi-pass OCR.
 *
 * Variant 1 – Raw scale-up: minimal preprocessing (best for clean, well-lit labels)
 * Variant 2 – Deskew + adaptive threshold: for curved/tilted labels
 * Variant 3 – High contrast + Otsu threshold: for low-light or glare-affected images
 *
 * @returns Array of canvases ordered from least to most aggressive preprocessing
 */
export function createPreprocessingVariants(
  canvas: HTMLCanvasElement
): HTMLCanvasElement[] {
  // Variant 1: scale up to ≥800px width, keep colour (TrOCR handles colour well)
  const v1 = document.createElement('canvas');
  const scale = canvas.width < 800 ? Math.ceil(800 / canvas.width) : 1;
  v1.width = canvas.width * scale;
  v1.height = canvas.height * scale;
  const ctx1 = v1.getContext('2d');
  if (ctx1) {
    ctx1.imageSmoothingEnabled = scale > 1 ? false : true;
    ctx1.drawImage(canvas, 0, 0, v1.width, v1.height);
  }

  // Variant 2: deskew + adaptive binarization
  const deskewed = deskewCanvas(canvas);
  const v2 = preprocessCanvasForOcr(deskewed);

  // Variant 3: high-contrast Otsu threshold
  const v3 = preprocessCanvasHighContrast(canvas);

  return [v1, v2, v3];
}

/**
 * Convert a preprocessed canvas to an HTMLImageElement for use with the
 * TrOCR pipeline (which accepts HTMLImageElement input).
 *
 * Loading an image from a data URL is asynchronous — the returned element
 * must not be handed to the OCR pipeline until it has actually finished
 * decoding, otherwise the model may run against a blank/zero-dimension
 * image. This is most likely to bite on large, high-resolution photos
 * (e.g. studio-lit label photography) where encode/decode takes longer,
 * so the race is lost far more often than with small demo images.
 */
export function preprocessedCanvasToImage(
  canvas: HTMLCanvasElement
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = (err) => reject(err instanceof Error ? err : new Error('Failed to load preprocessed image'));
    img.src = canvas.toDataURL('image/png');
  });
}

/**
 * Crop a canvas to the given rectangle and return a new canvas.
 */
export function cropCanvas(source: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w));
  out.height = Math.max(1, Math.round(h));
  const ctx = out.getContext('2d');
  if (ctx) ctx.drawImage(source, x, y, w, h, 0, 0, out.width, out.height);
  return out;
}

/**
 * Segment a preprocessed (binary/high-contrast) canvas into text line crops.
 * Returns an array of canvases (top-to-bottom). Uses horizontal projection
 * profile on the luminance channel to find candidate text rows.
 */
export function segmentTextLines(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const w = canvas.width;
  const h = canvas.height;
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch {
    return [];
  }

  const d = imgData.data;
  const rowSums = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // treat darker pixels as text (value 0 in binary output)
      const luminance = d[idx];
      if (luminance < 128) sum += 1;
    }
    rowSums[y] = sum;
  }

  // Smooth rowSums with a small window to merge thin gaps
  const smooth = new Float32Array(h);
  const k = 3;
  for (let y = 0; y < h; y++) {
    let s = 0;
    let cnt = 0;
    for (let dy = -k; dy <= k; dy++) {
      const ny = y + dy;
      if (ny >= 0 && ny < h) {
        s += rowSums[ny];
        cnt++;
      }
    }
    smooth[y] = s / Math.max(1, cnt);
  }

  // Threshold: consider a row as text if it has more than 0.5% of width as dark pixels
  const threshold = Math.max(1, w * 0.005);
  const regions: Array<{ y1: number; y2: number }> = [];
  let inRegion = false;
  let start = 0;
  for (let y = 0; y < h; y++) {
    if (smooth[y] >= threshold) {
      if (!inRegion) {
        inRegion = true;
        start = y;
      }
    } else {
      if (inRegion) {
        inRegion = false;
        regions.push({ y1: Math.max(0, start - 2), y2: Math.min(h - 1, y + 2) });
      }
    }
  }
  if (inRegion) regions.push({ y1: Math.max(0, start - 2), y2: h - 1 });

  // Merge very small regions into neighbors
  const merged: Array<{ y1: number; y2: number }> = [];
  for (const r of regions) {
    if (merged.length === 0) merged.push(r);
    else {
      const prev = merged[merged.length - 1];
      const gap = r.y1 - prev.y2;
      if (gap <= 6) {
        prev.y2 = r.y2; // merge
      } else {
        merged.push(r);
      }
    }
  }

  // Convert regions to bounding boxes with horizontal padding based on detected text width
  const outCanvases: HTMLCanvasElement[] = [];
  for (const r of merged) {
    const y1 = Math.max(0, r.y1 - 2);
    const y2 = Math.min(h - 1, r.y2 + 2);
    // compute left/right bounds by scanning columns for dark pixels within y range
    let left = w, right = 0;
    for (let y = y1; y <= y2; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const lum = d[idx];
        if (lum < 128) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (left > right) {
      // fallback to full width slice
      left = 0;
      right = w - 1;
    }
    const pad = Math.round(Math.min(30, (right - left) * 0.1));
    const x1 = Math.max(0, left - pad);
    const x2 = Math.min(w - 1, right + pad);
    const cropW = x2 - x1 + 1;
    const cropH = y2 - y1 + 1;
    if (cropW > 8 && cropH > 6) {
      outCanvases.push(cropCanvas(canvas, x1, y1, cropW, cropH));
    }
  }

  return outCanvases;
}
