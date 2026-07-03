import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const modelDir = resolve(
  root,
  'public',
  'models',
  'Xenova',
  'trocr-base-printed'
);

const requiredFiles = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'merges.txt',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
  'onnx/decoder_with_past_model_quantized.onnx',
];

if (!existsSync(modelDir) || !statSync(modelDir).isDirectory()) {
  console.error(
    `Missing local OCR model directory: ${modelDir}\n` +
      'Expected local-only model assets at public/models/Xenova/trocr-base-printed/.'
  );
  process.exit(1);
}

const missing = requiredFiles.filter(
  fileName => !existsSync(join(modelDir, fileName))
);
if (missing.length > 0) {
  console.error(
    `Missing required local model metadata files in ${modelDir}:\n` +
      missing.map(name => `- ${name}`).join('\n')
  );
  process.exit(1);
}

console.log(`Local model assets validated: ${modelDir}`);
