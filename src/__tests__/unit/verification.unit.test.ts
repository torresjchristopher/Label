import { describe, expect, it } from 'vitest';
import {
  BASELINE_CONTEXT_ID,
  buildVerificationContext,
  shouldResetContext,
  withLowConfidenceReason,
} from '../../utils/audit';
import { verifyLabelText } from '../../utils/verification';
import {
  abvMismatchText,
  baseApplication,
  perfectLabelText,
  warningHeaderCasingText,
} from '../fixtures';

describe('verification failure reason codes', () => {
  it('records ABV mismatch as a machine-readable failure code', () => {
    const result = verifyLabelText(baseApplication, abvMismatchText, Date.now());
    expect(result.failureReasons.map(reason => reason.code)).toContain('ABV_MISMATCH');
  });

  it('records warning header casing issue as WARNING_HEADER_CASE', () => {
    const result = verifyLabelText(
      baseApplication,
      warningHeaderCasingText,
      Date.now()
    );
    expect(result.failureReasons.map(reason => reason.code)).toContain(
      'WARNING_HEADER_CASE'
    );
  });

  it('adds LOW_CONFIDENCE when OCR confidence is below threshold', () => {
    const result = verifyLabelText(baseApplication, perfectLabelText, Date.now());
    const withConfidence = withLowConfidenceReason(
      { ...result, ocrConfidence: 0.1 },
      0.2
    );
    expect(withConfidence.failureReasons.map(reason => reason.code)).toContain(
      'LOW_CONFIDENCE'
    );
  });
});

describe('verification context model', () => {
  it('uses baseline context when application fields are empty', () => {
    const context = buildVerificationContext({
      brandName: '',
      classType: '',
      abv: '',
      volume: '',
      producer: '',
      countryOfOrigin: '',
    });

    expect(context.contextType).toBe('baseline');
    expect(context.contextId).toBe(BASELINE_CONTEXT_ID);
  });

  it('does not reset when normalized fields are unchanged', () => {
    const a = buildVerificationContext({
      brandName: ' Old Tom Distillery ',
      classType: 'Kentucky Straight Bourbon Whiskey',
      abv: '45% Alc./Vol. (90 Proof)',
      volume: '750 mL',
      producer: 'Old Tom Distillery Co, Frankfort, KY',
      countryOfOrigin: 'United States',
    });
    const b = buildVerificationContext({
      brandName: 'old tom distillery',
      classType: 'Kentucky   Straight   Bourbon   Whiskey',
      abv: '45% Alc./Vol. (90 Proof)',
      volume: '750 mL',
      producer: 'Old Tom Distillery Co, Frankfort, KY',
      countryOfOrigin: 'United States',
    });

    expect(shouldResetContext(a.contextId, b.contextId)).toBe(false);
  });
});

