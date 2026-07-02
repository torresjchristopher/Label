/**
 * Structured label field extractor.
 *
 * Parses raw OCR text from alcohol bottle labels into typed, validated fields
 * with per-field confidence scores. This replaces raw-text-only finalization
 * and provides a structured result regardless of whether application form
 * fields have been pre-filled.
 *
 * Fields extracted:
 *  - brand      : Best-effort first prominent line (brand/name)
 *  - abv        : Alcohol-by-volume numeric value
 *  - volume     : Net contents amount + unit
 *  - governmentWarningPresent : Whether the mandatory 27 CFR 16.21 warning exists
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedField<T = string> {
  /** Parsed value, or null if not found. */
  value: T | null;
  /** Confidence in [0, 1] for this field. */
  confidence: number;
  /** The raw substring matched in the OCR text. */
  rawMatch: string | null;
}

export interface ExtractedVolumeValue {
  amount: number;
  unit: string;
  /** Normalised to millilitres for comparison. */
  normalizedMl: number;
}

export interface ExtractedLabelFields {
  brand: ExtractedField<string>;
  abv: ExtractedField<number>;
  volume: ExtractedField<ExtractedVolumeValue>;
  governmentWarningPresent: ExtractedField<boolean>;
  /** Composite confidence: average of present-field confidences. */
  overallConfidence: number;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Normalise OCR number strings – corrects common character OCR swaps like
 * letter 'O' → digit '0', 'l'/'I' → '1'.
 */
export function normalizeOcrNumberString(raw: string): string {
  return raw
    .replace(/[oO](?=\d|\.)/g, '0')  // leading O before digits/dot
    .replace(/(?<=\d)[oO]/g, '0')     // trailing O after digits
    .replace(/(?<=\d)[lI]/g, '1')     // l/I after digits
    .replace(/(?<=[1-9])\s+(?=\d)/g, ''); // remove spaces inside numbers
}

/**
 * US fluid ounce to millilitre conversion factor (1 fl oz = 29.5735 mL).
 * Reference: NIST Handbook 44 Appendix C.
 */
const ML_PER_FLUID_OUNCE = 29.5735;

/** Convert a volume amount + unit to millilitres. Returns null if unknown unit. */
export function toMl(amount: number, unit: string): number | null {
  const u = unit.toLowerCase().replace(/\s+/g, '');
  if (u === 'ml') return amount;
  if (u === 'l' || u === 'liter' || u === 'liters' || u === 'litre' || u === 'litres') return amount * 1000;
  if (u === 'cl') return amount * 10;
  if (u === 'floz' || u === 'fl.oz' || u === 'fluidounce' || u === 'fluidounces') return amount * ML_PER_FLUID_OUNCE;
  return null;
}

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

/**
 * Extract ABV percentage from OCR text.
 * Handles patterns like: "45%", "6.8% Alc./Vol.", "40 PROOF", "14.2% ALC. BY VOL."
 */
export function extractAbv(ocrText: string): ExtractedField<number> {
  const cleaned = normalizeOcrNumberString(ocrText);

  // Primary: explicit % sign
  const pctRegex = /(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:alc|vol|by|a\/v)?/gi;
  const pctMatches = [...cleaned.matchAll(pctRegex)];

  for (const m of pctMatches) {
    const val = parseFloat(m[1]);
    if (val >= 0.5 && val <= 99.9) {
      return {
        value: val,
        confidence: 0.95,
        rawMatch: m[0].trim(),
      };
    }
  }

  // Secondary: "X proof" → ABV = proof / 2
  const proofRegex = /(\d{2,3}(?:\.\d{1,2})?)\s*proof\b/gi;
  const proofMatches = [...cleaned.matchAll(proofRegex)];
  for (const m of proofMatches) {
    const proof = parseFloat(m[1]);
    if (proof >= 1 && proof <= 200) {
      return {
        value: proof / 2,
        confidence: 0.8,
        rawMatch: m[0].trim(),
      };
    }
  }

  // Tertiary: "X alc" or "X alc/vol" without explicit %
  const alcRegex = /(\d{1,2}(?:\.\d{1,2})?)\s*(?:alc|alcohol)\b/gi;
  const alcMatches = [...cleaned.matchAll(alcRegex)];
  for (const m of alcMatches) {
    const val = parseFloat(m[1]);
    if (val >= 0.5 && val <= 99.9) {
      return {
        value: val,
        confidence: 0.7,
        rawMatch: m[0].trim(),
      };
    }
  }

  return { value: null, confidence: 0, rawMatch: null };
}

/**
 * Extract net contents (volume) from OCR text.
 * Handles: "750 mL", "12 FL. OZ.", "1.75 L", "50 cl"
 */
export function extractVolume(ocrText: string): ExtractedField<ExtractedVolumeValue> {
  const cleaned = normalizeOcrNumberString(ocrText);

  const volRegex =
    /(\d+(?:\.\d+)?)\s*(ml|cl|l\b|liters?|litres?|fl\.?\s*oz\.?|fluid\s*ounces?)/gi;

  const matches = [...cleaned.matchAll(volRegex)];
  for (const m of matches) {
    const amount = parseFloat(m[1]);
    const unit = m[2].replace(/\s+/g, '').toLowerCase().replace(/\./, '');
    if (amount <= 0) continue;

    const normalizedMl = toMl(amount, unit);
    if (normalizedMl === null) continue;

    return {
      value: { amount, unit: m[2].trim(), normalizedMl },
      confidence: 0.95,
      rawMatch: m[0].trim(),
    };
  }

  return { value: null, confidence: 0, rawMatch: null };
}

/**
 * Detect whether the mandatory government health warning is present on the label.
 * Checks for both the full "GOVERNMENT WARNING:" header and key required phrases.
 */
export function extractGovernmentWarning(ocrText: string): ExtractedField<boolean> {
  const lower = ocrText.toLowerCase();

  const hasHeader = /government\s+warning\s*:/i.test(ocrText);
  const requiredPhrases = [
    'surgeon general',
    'pregnancy',
    'birth defects',
    'impairs your ability',
  ];
  const phraseHits = requiredPhrases.filter(p => lower.includes(p)).length;

  if (hasHeader && phraseHits >= 3) {
    return { value: true, confidence: 0.95, rawMatch: 'GOVERNMENT WARNING (full)' };
  }
  if (hasHeader && phraseHits >= 1) {
    return { value: true, confidence: 0.7, rawMatch: 'GOVERNMENT WARNING (partial)' };
  }
  if (phraseHits >= 2) {
    return { value: true, confidence: 0.55, rawMatch: 'Warning phrases detected' };
  }

  return { value: false, confidence: 0.9, rawMatch: null };
}

/**
 * Extract the most likely brand name from OCR text.
 *
 * Strategy: scan lines for the first "prominent" line that:
 *  - Has 3+ chars and at least one alpha word ≥ 3 chars
 *  - Is NOT a warning / ABV / volume / producer / country line
 *  - Prefers ALL-CAPS lines (common for brand headers)
 */
export function extractBrand(ocrText: string): ExtractedField<string> {
  const skipPatterns = [
    /warning/i,
    /surgeon\s+general/i,
    /government/i,
    /\d+\s*%/,
    /\d+\s*(?:ml|l\b|fl)/i,
    /bottled\s+by|distilled\s+by|brewed|produced\s+by|imported\s+by/i,
    /product\s+of/i,
    /^\s*\d+\s*$/,
  ];

  const lines = ocrText
    .split(/\n/)
    .map(l => l.trim().replace(/[^\w\s''\-&.]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(
      l =>
        l.length >= 3 &&
        /[a-zA-Z]{3,}/.test(l) &&
        !skipPatterns.some(re => re.test(l))
    );

  if (lines.length === 0) return { value: null, confidence: 0, rawMatch: null };

  // Prefer ALL-CAPS lines as brand headers
  const capsLine = lines.find(l => l === l.toUpperCase() && /[A-Z]{3,}/.test(l));
  const brand = capsLine ?? lines[0];

  return {
    value: brand,
    confidence: capsLine ? 0.85 : 0.6,
    rawMatch: brand,
  };
}

// ---------------------------------------------------------------------------
// Composite extractor
// ---------------------------------------------------------------------------

/**
 * Extract all structured fields from raw OCR text.
 * Returns an `ExtractedLabelFields` object with per-field confidence scores
 * and a composite `overallConfidence`.
 */
export function extractLabelFields(ocrText: string): ExtractedLabelFields {
  const brand = extractBrand(ocrText);
  const abv = extractAbv(ocrText);
  const volume = extractVolume(ocrText);
  const governmentWarningPresent = extractGovernmentWarning(ocrText);

  // Compute overall confidence as the mean of fields that have a non-null value
  const fields = [brand, abv, volume, governmentWarningPresent];
  const presentFields = fields.filter(f => f.value !== null);
  const overallConfidence =
    presentFields.length > 0
      ? presentFields.reduce((s, f) => s + f.confidence, 0) / presentFields.length
      : 0;

  return { brand, abv, volume, governmentWarningPresent, overallConfidence };
}
