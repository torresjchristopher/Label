import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = process.cwd();
const modelRoot = resolve(root, 'public', 'models', 'Xenova', 'trocr-base-printed');
const modelId = 'Xenova/trocr-base-printed';
const baseUrlEnv = process.env.MODEL_ASSET_BASE_URL?.trim();
const hfBase = baseUrlEnv
  ? baseUrlEnv.replace(/\/+$/, '')
  : `https://huggingface.co/${modelId}/resolve/main`;

const files = [
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

mkdirSync(modelRoot, { recursive: true });

async function downloadFile(relPath) {
  const outPath = join(modelRoot, relPath);
  const outDir = dirname(outPath);
  mkdirSync(outDir, { recursive: true });

  if (existsSync(outPath) && statSync(outPath).size > 0) {
    console.log(`skip ${relPath} (already exists)`);
    return;
  }

  const url = `${hfBase}/${relPath}?download=true`;
  console.log(`download ${relPath}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${relPath} (${res.status}) from ${url}`);
  }

  await pipeline(res.body, createWriteStream(outPath));
}

for (const file of files) {
  await downloadFile(file);
}

console.log(`Local model assets downloaded to ${modelRoot}`);
