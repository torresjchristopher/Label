import { STANDARD_GOVERNMENT_WARNING } from '../database';
import type { ColaApplication } from '../types';

export const baseApplication: ColaApplication = {
  id: 'test-app-001',
  applicationNumber: 'COLA-TEST-001',
  brandName: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol. (90 Proof)',
  volume: '750 mL',
  producer: 'Old Tom Distillery Co, Frankfort, KY',
  countryOfOrigin: 'United States',
  warningStatement: STANDARD_GOVERNMENT_WARNING,
  status: 'PENDING',
  applicantName: 'Test',
  submitDate: '2026-07-02',
};

export const perfectLabelText = `
OLD TOM DISTILLERY
Kentucky Straight Bourbon Whiskey
45% Alc./Vol. (90 Proof)
750 mL
Bottled by Old Tom Distillery Co, Frankfort, KY
Product of USA
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
`;

export const warningHeaderCasingText = `
OLD TOM DISTILLERY
Kentucky Straight Bourbon Whiskey
45% Alc./Vol. (90 Proof)
750 mL
Bottled by Old Tom Distillery Co, Frankfort, KY
Product of USA
Government Warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
`;

export const warningMissingWordsText = `
OLD TOM DISTILLERY
Kentucky Straight Bourbon Whiskey
45% Alc./Vol. (90 Proof)
750 mL
Bottled by Old Tom Distillery Co, Frankfort, KY
Product of USA
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery.
`;

export const abvMismatchText = `
OLD TOM DISTILLERY
Kentucky Straight Bourbon Whiskey
40% Alc./Vol. (80 Proof)
750 mL
Bottled by Old Tom Distillery Co, Frankfort, KY
Product of USA
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
`;

