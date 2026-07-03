import type { FailureReason, VerificationContextType, VerificationResult } from '../types';

export interface ProductContextInput {
  brandName: string;
  classType: string;
  abv: string;
  volume: string;
  producer: string;
  countryOfOrigin: string;
}

export const BASELINE_CONTEXT_ID = 'baseline::no-application-fields';

function normalizeContextField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildVerificationContext(input: ProductContextInput): {
  contextId: string;
  contextType: VerificationContextType;
} {
  const fields = [
    input.brandName,
    input.classType,
    input.abv,
    input.volume,
    input.producer,
    input.countryOfOrigin,
  ].map(normalizeContextField);

  const hasAnyField = fields.some(Boolean);
  if (!hasAnyField) {
    return { contextId: BASELINE_CONTEXT_ID, contextType: 'baseline' };
  }

  return {
    contextType: 'application',
    contextId: `application::${fields.join('|')}`,
  };
}

export function shouldResetContext(
  activeContextId: string | null,
  nextContextId: string
): boolean {
  return activeContextId !== null && activeContextId !== nextContextId;
}

export function withLowConfidenceReason(
  result: VerificationResult,
  lowConfidenceThreshold = 0.2
): VerificationResult {
  const confidence = result.ocrConfidence;
  if (confidence === undefined || confidence >= lowConfidenceThreshold) {
    return result;
  }

  const alreadyPresent = result.failureReasons.some(
    reason => reason.code === 'LOW_CONFIDENCE'
  );
  if (alreadyPresent) {
    return result;
  }

  const reason: FailureReason = {
    code: 'LOW_CONFIDENCE',
    message: `OCR confidence ${confidence.toFixed(2)} is below threshold ${lowConfidenceThreshold.toFixed(2)}.`,
  };

  return {
    ...result,
    failureReasons: [reason, ...result.failureReasons],
  };
}
