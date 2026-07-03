/**
 * OCR Service — Transformer.js-first implementation.
 *
 * Provides a clean `runOcr()` interface over the Xenova/trocr-base-printed model with:
 * - Confidence estimation from result characteristics
 * - Configurable confidence threshold gating
 * - Multi-pass retry with alternate preprocessing variants
 * - Per-pass timeout to prevent scanner hangs
 */
import { env as transformersEnv, pipeline } from '@xenova/transformers';
import {
  createPreprocessingVariants,
  preprocessedCanvasToImage,
} from './imageProcessing';

// ---------------------------------------------------------------------------
// Thresholds (tune these to adjust aggressiveness of retry and acceptance)
// ---------------------------------------------------------------------------

/** Confidence score [0–1] above which we accept the result without retrying. */
export const OCR_CONFIDENCE_THRESHOLD = 0.6;

/** Confidence score below which the result is considered unusable. */
export const OCR_LOW_CONFIDENCE_THRESHOLD = 0.2;

/** Minimum extracted text length for a result to be considered valid. */
export const OCR_MIN_TEXT_LENGTH = 10;

/** Maximum passes to try before returning the best seen result. */
export const MAX_OCR_PASSES = 3;

/** Per-pass OCR inference timeout in milliseconds. */
export const OCR_PASS_TIMEOUT_MS = 30_000;
const TROCR_MODEL_ID = 'Xenova/trocr-base-printed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OcrResult {
  /** Best OCR text found across all passes. */
  text: string;
  /** Estimated confidence in [0, 1]. */
  confidence: number;
  /** Which preprocessing pass produced this result (1-indexed). */
  pass: number;
}

// ---------------------------------------------------------------------------
// Pipeline lifecycle
// ---------------------------------------------------------------------------

/**
 * Initialise the Transformer.js TrOCR pipeline.
 * Call this once when the scanner becomes active; pass the returned instance
 * to `runOcr()`. Caller is responsible for lifecycle (keep ref, set to null
 * when camera/scanner is closed to allow GC).
 */
function configureTransformersEnvironment() {
  const localOnlyFlag = import.meta.env.VITE_TRANSFORMERS_LOCAL_ONLY;
  // Secure default: production builds are local-only unless explicitly set to "false".
  const localOnly =
    localOnlyFlag === 'true' ||
    (localOnlyFlag !== 'false' && import.meta.env.PROD);
  const modelBaseUrl = import.meta.env.VITE_TRANSFORMERS_MODEL_BASE_URL?.trim();
  const localModelPath = `${import.meta.env.BASE_URL}models/`;

  if (modelBaseUrl) {
    transformersEnv.remoteHost = modelBaseUrl.endsWith('/')
      ? modelBaseUrl
      : `${modelBaseUrl}/`;
  }

  transformersEnv.allowRemoteModels = !localOnly;
  transformersEnv.allowLocalModels = true;

  if (localOnly) {
    transformersEnv.localModelPath = localModelPath;
  }

  return { localOnly, localModelPath };
}

async function assertLocalModelAssetsAvailable(localModelPath: string) {
  const configUrl = `${localModelPath}${TROCR_MODEL_ID}/config.json`;
  const res = await fetch(configUrl, { method: 'GET', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      `Local-only OCR is enabled, but model assets were not found at ${configUrl}. ` +
        'Provide local model files under public/models/ or set an approved internal mirror.'
    );
  }
}

export async function initOcrPipeline(
  onProgress?: (pct: number) => void
): Promise<ReturnType<typeof pipeline>> {
  const { localOnly, localModelPath } = configureTransformersEnvironment();
  if (localOnly) {
    await assertLocalModelAssetsAvailable(localModelPath);
  }

  return pipeline('image-to-text', TROCR_MODEL_ID, {
    // quantized: trades ~5-10% accuracy for ~4× smaller model size (~40 MB vs ~175 MB).
    // For compliance use cases needing maximum accuracy, set to false (requires more bandwidth
    // and memory, and increases first-load time).
    quantized: true,
    local_files_only:
      import.meta.env.VITE_TRANSFORMERS_LOCAL_ONLY === 'true' ||
      (import.meta.env.VITE_TRANSFORMERS_LOCAL_ONLY !== 'false' &&
        import.meta.env.PROD),
    progress_callback: onProgress
      ? (p: number) => onProgress(Math.round(p))
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// Confidence estimation
// ---------------------------------------------------------------------------

/**
 * Estimate OCR result confidence from text characteristics.
 * Returns a value in [0, 1]; higher is better.
 *
 * Heuristics used:
 *  1. Word count up to 50 words (40% weight)
 *  2. Presence of alcohol-label keyword patterns (40% weight)
 *  3. Plausible average word length 3–12 chars (20% weight)
 */
export function estimateOcrConfidence(text: string): number {
  if (!text || text.trim().length < OCR_MIN_TEXT_LENGTH) return 0;

  const words = text.trim().split(/\s+/).filter(Boolean);

  // Factor 1 – word volume
  const wordScore = Math.min(words.length / 50, 1.0) * 0.4;

  // Factor 2 – domain keyword presence
  const lower = text.toLowerCase();
  const patternMatches = [
    /\d+(?:\.\d+)?\s*%/.test(lower),               // ABV percentage
    /\d+\s*(?:ml|l\b|fl\.?\s*oz)/i.test(lower),    // Volume
    /government\s+warning/i.test(lower),             // Warning statement
    /(?:alc|vol|proof)\b/i.test(lower),              // Alcohol terms
    /(?:distill|brew|winer|beer|wine|spirit|whiskey|whisky|vodka|rum|tequila|gin)/i.test(lower), // Product type
  ].filter(Boolean).length;
  const keywordScore = (patternMatches / 5) * 0.4;

  // Factor 3 – average word length sanity
  const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  const lenScore = avgLen >= 3 && avgLen <= 12 ? 0.2 : 0;

  return Math.min(wordScore + keywordScore + lenScore, 1.0);
}

// ---------------------------------------------------------------------------
// Core OCR runner
// ---------------------------------------------------------------------------

/**
 * Run a single OCR inference pass on the given image element.
 * @internal Use `runOcr` for the full multi-pass pipeline.
 */
async function runSinglePass(
  image: HTMLImageElement,
  pipelineInstance: Awaited<ReturnType<typeof pipeline>>,
  opts: { maxNewTokens: number; numBeams: number }
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callable = pipelineInstance as unknown as (img: HTMLImageElement, opts: Record<string, unknown>) => Promise<unknown>;
  const result = await callable(image, {
    max_new_tokens: opts.maxNewTokens,
    num_beams: opts.numBeams,
  });

  if (Array.isArray(result)) {
    return result.map((r: { generated_text?: string }) => r.generated_text ?? '').join('\n');
  }
  return (result as { generated_text?: string })?.generated_text ?? '';
}

/**
 * Run OCR on `sourceCanvas` using up to `MAX_OCR_PASSES` preprocessing variants.
 *
 * Strategy:
 *  Pass 1 – generous tokens + beams (best quality, most compute)
 *  Pass 2 – moderate settings (faster, different preprocessing)
 *  Pass 3 – fast low-beam pass (last-resort fallback)
 *
 * Returns the result with the highest estimated confidence.
 * If all passes fail, returns `{ text: '', confidence: 0, pass: 0 }`.
 */
export async function runOcr(
  sourceCanvas: HTMLCanvasElement,
  pipelineInstance: Awaited<ReturnType<typeof pipeline>>
): Promise<OcrResult> {
  const variants = createPreprocessingVariants(sourceCanvas);

  const passConfigs: Array<{ maxNewTokens: number; numBeams: number }> = [
    { maxNewTokens: 200, numBeams: 4 },
    { maxNewTokens: 150, numBeams: 2 },
    { maxNewTokens: 100, numBeams: 1 },
  ];

  let bestResult: OcrResult = { text: '', confidence: 0, pass: 0 };

  for (let i = 0; i < Math.min(variants.length, MAX_OCR_PASSES); i++) {
    const passNum = i + 1;
    const variantCanvas = variants[i];
    const imgEl = preprocessedCanvasToImage(variantCanvas);
    const cfg = passConfigs[i] ?? passConfigs[passConfigs.length - 1];

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`OCR pass ${passNum} timed out`)),
          OCR_PASS_TIMEOUT_MS
        )
      );

      const text = await Promise.race([
        runSinglePass(imgEl, pipelineInstance, cfg),
        timeoutPromise,
      ]);

      const confidence = estimateOcrConfidence(text);
      if (import.meta.env.DEV) {
        console.log(
          `[OCR] pass ${passNum}: confidence=${confidence.toFixed(2)} len=${text.length}`
        );
      }

      if (confidence > bestResult.confidence) {
        bestResult = { text, confidence, pass: passNum };
      }

      // Accept early if confidence is good enough
      if (confidence >= OCR_CONFIDENCE_THRESHOLD) {
        break;
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn(`[OCR] pass ${passNum} failed:`, err);
      }
    }
  }

  return bestResult;
}
