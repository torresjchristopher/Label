import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const ortBundlePath = resolve(
  repoRoot,
  'node_modules',
  'onnxruntime-web',
  'dist',
  'ort-web.min.js'
);
const appPath = resolve(repoRoot, 'src', 'App.tsx');

const ortBundle = readFileSync(ortBundlePath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');

const metrics = {
  evalCount: (ortBundle.match(/eval\(/g) ?? []).length,
  newFunctionCount: (ortBundle.match(/new Function\(/g) ?? []).length,
  webAssemblyCount: (ortBundle.match(/WebAssembly/g) ?? []).length,
  blobCount: (ortBundle.match(/blob:/g) ?? []).length,
  workerCount: (ortBundle.match(/Worker/g) ?? []).length,
  inlineStyleJsxCount: (appSource.match(/style=\{\{/g) ?? []).length,
};

const cspFindings = [];
if (metrics.evalCount > 0 || metrics.newFunctionCount > 0) {
  cspFindings.push(
    "script-src requires 'unsafe-eval' for current onnxruntime-web bundle."
  );
}
if (metrics.webAssemblyCount > 0) {
  cspFindings.push(
    "script-src should include 'wasm-unsafe-eval' (or browser-equivalent policy allowances for WASM compilation)."
  );
}
if (metrics.blobCount > 0 || metrics.workerCount > 0) {
  cspFindings.push("worker-src must allow blob: (worker-src 'self' blob:).");
}
if (metrics.inlineStyleJsxCount > 0) {
  cspFindings.push(
    "style-src requires 'unsafe-inline' unless inline JSX style attributes are refactored."
  );
}

console.log('CSP compatibility analysis');
console.log(JSON.stringify({ metrics, cspFindings }, null, 2));

