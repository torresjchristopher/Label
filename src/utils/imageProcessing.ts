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
  
  // Draw original high-res frame
  ctx.drawImage(canvas, 0, 0);
  
  try {
    const imgData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
    const d = imgData.data;
    
    // Contrast boost & grayscale conversion to maximize character edge contrast
    const contrastFactor = 1.4; // 40% contrast boost
    for (let i = 0; i < d.length; i += 4) {
      // Grayscale calculation
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Contrast stretch
      const adjusted = Math.min(255, Math.max(0, (gray - 128) * contrastFactor + 128));
      
      d[i] = adjusted;     // Red
      d[i + 1] = adjusted; // Green
      d[i + 2] = adjusted; // Blue
    }
    
    ctx.putImageData(imgData, 0, 0);
    return processedCanvas;
  } catch (e) {
    console.warn("Canvas pre-processing fallback:", e);
    return canvas;
  }
}
