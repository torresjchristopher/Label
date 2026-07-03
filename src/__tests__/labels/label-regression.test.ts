import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env as transformersEnv, pipeline } from '@xenova/transformers';
import { describe, expect, it } from 'vitest';
import type { ColaApplication, FailureReasonCode } from '../../types';
import { verifyLabelText } from '../../utils/verification';

interface LabelRegressionCase {
  id: string;
  imagePath: string;
  expectedStatus: 'PASS' | 'FAIL';
  expectedFailureCodes?: FailureReasonCode[];
  application: ColaApplication;
}

interface LabelRegressionManifest {
  cases: LabelRegressionCase[];
}

const MODEL_ID = 'Xenova/trocr-base-printed';
const MANIFEST_PATH =
  process.env.LABEL_REGRESSION_MANIFEST ??
  'testdata/label-regression/manifest.json';

function readManifest(): LabelRegressionManifest {
  const fullPath = resolve(process.cwd(), MANIFEST_PATH);
  if (!existsSync(fullPath)) {
    throw new Error(
      `Missing label regression manifest at ${fullPath}. ` +
        'Create it from testdata/label-regression/manifest.example.json.'
    );
  }
  const parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as LabelRegressionManifest;
  if (!parsed.cases?.length) {
    throw new Error('Label regression manifest must contain at least one case.');
  }
  return parsed;
}

function configureLabelRegressionOcr() {
  const localOnly = process.env.LABEL_REGRESSION_LOCAL_ONLY !== 'false';
  const localModelPath = resolve(process.cwd(), 'public', 'models');
  const remoteHost = process.env.VITE_TRANSFORMERS_MODEL_BASE_URL?.trim();

  transformersEnv.allowRemoteModels = !localOnly;
  transformersEnv.allowLocalModels = true;
  transformersEnv.localModelPath = localModelPath;
  if (remoteHost) {
    transformersEnv.remoteHost = remoteHost.endsWith('/')
      ? remoteHost
      : `${remoteHost}/`;
  }

  if (
    localOnly &&
    !existsSync(resolve(localModelPath, MODEL_ID, 'config.json'))
  ) {
    throw new Error(
      `Local OCR model assets not found under ${resolve(localModelPath, MODEL_ID)}. ` +
        'Run npm run models:download && npm run models:validate first.'
    );
  }

  return { localOnly };
}

function extractGeneratedText(output: unknown): string {
  if (Array.isArray(output)) {
    return output
      .map(entry =>
        typeof entry === 'object' &&
        entry !== null &&
        'generated_text' in entry
          ? String((entry as { generated_text?: string }).generated_text ?? '')
          : ''
      )
      .join('\n');
  }

  if (
    typeof output === 'object' &&
    output !== null &&
    'generated_text' in output
  ) {
    return String((output as { generated_text?: string }).generated_text ?? '');
  }

  return '';
}

describe('golden label image regression', () => {
  it(
    'classifies uploaded labels according to manifest expectations',
    async () => {
      const manifest = readManifest();
      const { localOnly } = configureLabelRegressionOcr();

      const ocr = await pipeline('image-to-text', MODEL_ID, {
        quantized: true,
        local_files_only: localOnly,
      });

      for (const testCase of manifest.cases) {
        const imageFile = resolve(process.cwd(), testCase.imagePath);
        if (!existsSync(imageFile)) {
          throw new Error(
            `Image file not found for case ${testCase.id}: ${imageFile}`
          );
        }

        const output = await ocr(imageFile, {
          max_new_tokens: 200,
          num_beams: 2,
        });
        const ocrText = extractGeneratedText(output);

        const result = verifyLabelText(
          testCase.application,
          ocrText,
          Date.now()
        );
        const status = result.overallPassed ? 'PASS' : 'FAIL';
        if (status !== testCase.expectedStatus) {
          console.error(
            `[label-regression] case=${testCase.id} expected=${testCase.expectedStatus} actual=${status} ` +
              `codes=${result.failureReasons.map(reason => reason.code).join(',')} ` +
              `ocr="${ocrText.slice(0, 220).replace(/\s+/g, ' ')}"`
          );
        }
        expect(status, `status mismatch for ${testCase.id}`).toBe(
          testCase.expectedStatus
        );

        if (testCase.expectedFailureCodes?.length) {
          const codes = result.failureReasons.map(reason => reason.code);
          for (const expectedCode of testCase.expectedFailureCodes) {
            expect(codes, `missing code ${expectedCode} for ${testCase.id}`).toContain(
              expectedCode
            );
          }
        }
      }
    },
    1_200_000
  );
});
