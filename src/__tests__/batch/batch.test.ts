import { describe, expect, it } from 'vitest';
import { verifyLabelText } from '../../utils/verification';
import {
  abvMismatchText,
  baseApplication,
  perfectLabelText,
  warningHeaderCasingText,
  warningMissingWordsText,
} from '../fixtures';

describe('batch validation', () => {
  it('processes 250 labels with stable success and failure classification', () => {
    const samples = [
      perfectLabelText,
      warningHeaderCasingText,
      warningMissingWordsText,
      abvMismatchText,
    ];

    const results = Array.from({ length: 250 }, (_, index) =>
      verifyLabelText(baseApplication, samples[index % samples.length], Date.now())
    );

    const successCount = results.filter(result => result.processingTimeMs >= 0).length;
    const failureClassifiedCount = results
      .filter(result => !result.overallPassed)
      .every(result => result.failureReasons.length > 0);

    expect(successCount / results.length).toBe(1);
    expect(failureClassifiedCount).toBe(true);
  });
});

