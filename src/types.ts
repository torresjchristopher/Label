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
}
