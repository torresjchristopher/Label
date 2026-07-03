import { describe, expect, it } from 'vitest';
import { verifyLabelText } from '../../utils/verification';
import {
  abvMismatchText,
  baseApplication,
  perfectLabelText,
  warningMissingWordsText,
} from '../fixtures';

describe('golden-set integration checks', () => {
  it('accepts a known-good label sample', () => {
    const result = verifyLabelText(baseApplication, perfectLabelText, Date.now());
    expect(result.overallPassed).toBe(true);
    expect(result.warningStatement.status).toBe('MATCH');
  });

  it('rejects ABV mismatch sample', () => {
    const result = verifyLabelText(baseApplication, abvMismatchText, Date.now());
    expect(result.overallPassed).toBe(false);
    expect(result.failureReasons.map(reason => reason.code)).toContain('ABV_MISMATCH');
  });

  it('rejects warning wording mismatch sample', () => {
    const result = verifyLabelText(
      baseApplication,
      warningMissingWordsText,
      Date.now()
    );
    expect(result.overallPassed).toBe(false);
    expect(result.warningStatement.status).toBe('MISMATCH');
    expect(result.failureReasons.map(reason => reason.code)).toContain(
      'WARNING_TEXT_MISMATCH'
    );
  });
});

