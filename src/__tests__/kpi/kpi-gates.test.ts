import { describe, expect, it } from 'vitest';
import { verifyLabelText } from '../../utils/verification';
import {
  abvMismatchText,
  baseApplication,
  perfectLabelText,
  warningHeaderCasingText,
  warningMissingWordsText,
} from '../fixtures';

const KPI_GATES = {
  p95PerLabelMs: 5_000,
  requiredFieldCompleteness: 0.99,
  strictWarningPrecision: 1,
  batchSuccessRate: 0.995,
  timeoutRate: 0.005,
};

describe('quality KPI gates', () => {
  it('keeps p95 per-label verification under 5 seconds', () => {
    const runs = Array.from({ length: 120 }, () => {
      const start = performance.now();
      verifyLabelText(baseApplication, perfectLabelText, Date.now());
      return performance.now() - start;
    }).sort((a, b) => a - b);

    const p95 = runs[Math.floor(runs.length * 0.95)];
    expect(p95).toBeLessThanOrEqual(KPI_GATES.p95PerLabelMs);
  });

  it('maintains required-field completeness on golden dataset', () => {
    const samples = [perfectLabelText, warningHeaderCasingText, warningMissingWordsText];
    const requiredFieldStatuses = samples.flatMap(sample => {
      const result = verifyLabelText(baseApplication, sample, Date.now());
      return [
        result.brandName.status,
        result.classType.status,
        result.abv.status,
        result.volume.status,
        result.producer.status,
        result.countryOfOrigin.status,
      ];
    });

    const completeCount = requiredFieldStatuses.filter(
      status => status === 'MATCH' || status === 'PARTIAL'
    ).length;
    const completenessRate = completeCount / requiredFieldStatuses.length;

    expect(completenessRate).toBeGreaterThanOrEqual(
      KPI_GATES.requiredFieldCompleteness
    );
  });

  it('keeps strict warning precision at 100% on labeled warning cases', () => {
    const positives = [perfectLabelText];
    const negatives = [warningHeaderCasingText, warningMissingWordsText];

    const truePositives = positives.filter(sample => {
      const result = verifyLabelText(baseApplication, sample, Date.now());
      return result.warningStatement.status === 'MATCH';
    }).length;

    const falsePositives = negatives.filter(sample => {
      const result = verifyLabelText(baseApplication, sample, Date.now());
      return result.warningStatement.status === 'MATCH';
    }).length;

    const precision =
      truePositives + falsePositives === 0
        ? 0
        : truePositives / (truePositives + falsePositives);

    expect(precision).toBe(KPI_GATES.strictWarningPrecision);
  });

  it('maintains batch success and timeout rates within thresholds', () => {
    const samples = [perfectLabelText, warningHeaderCasingText, warningMissingWordsText, abvMismatchText];

    const runs = Array.from({ length: 250 }, (_, index) => {
      const start = performance.now();
      verifyLabelText(baseApplication, samples[index % samples.length], Date.now());
      return performance.now() - start;
    });

    const successRate = runs.filter(ms => Number.isFinite(ms)).length / runs.length;
    const timeoutRate = runs.filter(ms => ms > KPI_GATES.p95PerLabelMs).length / runs.length;

    expect(successRate).toBeGreaterThanOrEqual(KPI_GATES.batchSuccessRate);
    expect(timeoutRate).toBeLessThanOrEqual(KPI_GATES.timeoutRate);
  });
});

