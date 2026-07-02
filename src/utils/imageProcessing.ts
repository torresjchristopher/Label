/**
 * Pre-processes an HTML5 Canvas for OCR analysis.
 * Converts the image to grayscale and applies threshold binarization to maximize
 * contrast between printed text and background label artwork.
 */
export function preprocessCanvasForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = canvas.width;
  processedCanvas.height = canvas.height;
  
  const ctx = processedCanvas.getContext('2d');
  if (!ctx) return canvas;
  
  // Draw original frame
  ctx.drawImage(canvas, 0, 0);
  
  try {
    const imgData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
    const d = imgData.data;
    
    // Grayscale transformation using BT.601 luminance weights
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Binarize: threshold at 128
      const val = gray > 128 ? 255 : 0;
      d[i] = val;     // Red
      d[i + 1] = val; // Green
      d[i + 2] = val; // Blue
    }
    
    ctx.putImageData(imgData, 0, 0);
    return processedCanvas;
  } catch (e) {
    console.warn("Canvas pre-processing fallback:", e);
    return canvas;
  }
}
