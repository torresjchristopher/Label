import { verifyLabelText } from './utils/verification';
import type { ColaApplication } from './types';

// Standard government warning
const STANDARD_WARNING = 
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

// Test applications with variations
const testApplications: ColaApplication[] = [
  {
    id: 'test-1',
    applicationNumber: 'COLA-TEST-001',
    brandName: 'OLD TOM DISTILLERY',
    classType: 'Kentucky Straight Bourbon Whiskey',
    abv: '45% Alc./Vol. (90 Proof)',
    volume: '750 mL',
    producer: 'Old Tom Distillery Co, Frankfort, KY',
    countryOfOrigin: 'United States',
    warningStatement: STANDARD_WARNING,
    status: 'PENDING',
    applicantName: 'Test Applicant',
    submitDate: '2026-07-02'
  },
  {
    id: 'test-2',
    applicationNumber: 'COLA-TEST-002',
    brandName: "STONE'S THROW BREWING",
    classType: 'India Pale Ale (IPA)',
    abv: '6.8% Alc./Vol.',
    volume: '12 FL. OZ.',
    producer: 'Stone\'s Throw Brewing Co, Seattle, WA',
    countryOfOrigin: 'United States',
    warningStatement: STANDARD_WARNING,
    status: 'PENDING',
    applicantName: 'Test Applicant',
    submitDate: '2026-07-02'
  },
  {
    id: 'test-3',
    applicationNumber: 'COLA-TEST-003',
    brandName: 'CHATEAU BORDEAUX',
    classType: 'Bordeaux Red Wine',
    abv: '13.5% Alc. by Vol.',
    volume: '750 mL',
    producer: 'Chateau Bordeaux SA, Bordeaux, France',
    countryOfOrigin: 'France',
    warningStatement: STANDARD_WARNING,
    status: 'PENDING',
    applicantName: 'Test Applicant',
    submitDate: '2026-07-02'
  },
  {
    id: 'test-4',
    applicationNumber: 'COLA-TEST-004',
    brandName: 'GUINNESS DRAUGHT',
    classType: 'Stout / Dark Beer',
    abv: '4.2% Alc./Vol.',
    volume: '14.9 FL. OZ.',
    producer: 'Guinness & Co, Dublin, Ireland',
    countryOfOrigin: 'Ireland',
    warningStatement: STANDARD_WARNING,
    status: 'PENDING',
    applicantName: 'Test Applicant',
    submitDate: '2026-07-02'
  },
  {
    id: 'test-5',
    applicationNumber: 'COLA-TEST-005',
    brandName: 'JACK DANIELS',
    classType: 'Tennessee Sour Mash Whiskey',
    abv: '40% Alc./Vol. (80 Proof)',
    volume: '750 mL',
    producer: 'Jack Daniel Distillery, Lynchburg, TN',
    countryOfOrigin: 'United States',
    warningStatement: STANDARD_WARNING,
    status: 'PENDING',
    applicantName: 'Test Applicant',
    submitDate: '2026-07-02'
  }
];

// Simulated OCR results (different variations of labels)
const ocrResults = [
  // Perfect match
  `OLD TOM DISTILLERY
Kentucky Straight Bourbon Whiskey
45% Alc./Vol. (90 Proof)
750 mL
Bottled by Old Tom Distillery Co, Frankfort, KY
Product of USA
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.`,
  
  // Fuzzy brand match (Stone's vs STONE'S)
  `Stone's Throw Brewing
India Pale Ale (IPA)
6.8% Alc./Vol.
12 FL. OZ.
Brewed and bottled by Stone's Throw Brewing Co, Seattle, WA
Product of USA
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.`,
  
  // ABV mismatch
  `CHATEAU BORDEAUX
Appellation Bordeaux Contrôlée
2021 Red Wine
14.2% ALC. BY VOL.
750 ML
Bottled by Chateau Bordeaux SA, Bordeaux, France
Product of France
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.`,
  
  // Casing error on warning
  `GUINNESS DRAUGHT
Stout / Dark Beer
4.2% Alc./Vol.
14.9 FL. OZ.
Brewed and bottled by Guinness & Co, Dublin, Ireland
Product of Ireland
Government Warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.`,
  
  // Missing warning text
  `JACK DANIELS OLD NO. 7
Tennessee Sour Mash Whiskey
40% Alc./Vol. (80 Proof)
750 mL
Produced by Jack Daniel Distillery, Lynchburg, TN
Product of USA
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery.`,
];

// Performance test function
export function runPerformanceTest(iterations: number = 100): {
  times: number[];
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: number;
  results: Array<{ appId: string; ocrTime: number; passed: boolean }>;
} {
  const times: number[] = [];
  const results: Array<{ appId: string; ocrTime: number; passed: boolean }> = [];
  let successCount = 0;

  for (let i = 0; i < iterations; i++) {
    // Pick random app and OCR result
    const app = testApplications[i % testApplications.length];
    const ocr = ocrResults[i % ocrResults.length];

    // Measure verification time
    const startTime = performance.now();
    const result = verifyLabelText(app, ocr, startTime);
    const endTime = performance.now();

    const elapsed = endTime - startTime;
    times.push(elapsed);
    results.push({
      appId: app.id,
      ocrTime: elapsed,
      passed: result.overallPassed
    });

    if (result.processingTimeMs > 0) {
      successCount++;
    }
  }

  // Calculate statistics
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.50)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];

  return {
    times,
    mean,
    stdDev,
    min: times[0],
    max: times[times.length - 1],
    p50,
    p95,
    p99,
    successRate: (successCount / iterations) * 100,
    results
  };
}

// Export for use in tests
export default runPerformanceTest;
