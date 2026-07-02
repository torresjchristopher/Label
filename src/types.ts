export type ProductType = 'beer' | 'wine' | 'spirits';

export interface AlcoholProduct {
  id: string;
  brandName: string;
  classType: string;
  abv: string;
  volume: string;
  producer: string;
  countryOfOrigin: string;
  type: ProductType;
}

export interface ColaApplication {
  id: string;
  applicationNumber: string;
  brandName: string;
  classType: string;
  abv: string;
  volume: string;
  producer: string;
  countryOfOrigin: string;
  warningStatement: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  labelUrl?: string;
  applicantName: string;
  submitDate: string;
  comments?: string;
}

export interface FieldVerification {
  status: 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'MISSING';
  expected: string;
  actual: string;
  message: string;
}

export interface WarningVerification {
  status: 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'MISSING';
  expected: string;
  actual: string;
  message: string;
  errors: string[];
  diffWords?: Array<{ word: string; status: 'match' | 'missing' | 'added' | 'casing_error' }>;
}

export interface AdditionalCheck {
  name: string;
  status: 'PASS' | 'WARNING' | 'INFO';
  message: string;
}

// ---------------------------------------------------------------------------
// OCR result types
// ---------------------------------------------------------------------------

/** Result from the Transformer.js OCR service. */
export interface OcrResult {
  text: string;
  confidence: number;
  pass: number;
}

/** A single structured label field with its confidence and raw match string. */
export interface ExtractedField<T = string> {
  value: T | null;
  confidence: number;
  rawMatch: string | null;
}

export interface ExtractedVolumeValue {
  amount: number;
  unit: string;
  normalizedMl: number;
}

/** Structured fields extracted from OCR text for alcohol bottle labels. */
export interface ExtractedLabelFields {
  brand: ExtractedField<string>;
  abv: ExtractedField<number>;
  volume: ExtractedField<ExtractedVolumeValue>;
  governmentWarningPresent: ExtractedField<boolean>;
  overallConfidence: number;
}

// ---------------------------------------------------------------------------
// Verification result
// ---------------------------------------------------------------------------

export interface VerificationResult {
  brandName: FieldVerification;
  classType: FieldVerification;
  abv: FieldVerification;
  volume: FieldVerification;
  warningStatement: WarningVerification;
  producer: FieldVerification;
  countryOfOrigin: FieldVerification;
  overallPassed: boolean;
  ocrRawText: string;
  processingTimeMs: number;
  additionalChecks: AdditionalCheck[];
  complianceScore: number;
  /** Structured fields extracted from OCR text (populated by the scan pipeline). */
  extractedFields?: ExtractedLabelFields;
  /** OCR confidence score from the Transformer.js pipeline pass. */
  ocrConfidence?: number;
}

