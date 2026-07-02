/**
 * Pre-processes an HTML5 Canvas for Tesseract.js OCR analysis.
 * 
 * Pipeline:
 * 1. Upscale small images (Tesseract needs ~300 DPI equivalent)
 * 2. Convert to grayscale using luminance weights
 * 3. Apply adaptive local threshold binarization (black text on white background)
 * 4. Output as high-contrast binary image ideal for OCR character segmentation
 */
export function preprocessCanvasForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const processedCanvas = document.createElement('canvas');
  
  // Step 1: Upscale small images — Tesseract accuracy drops sharply below ~600px width
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
