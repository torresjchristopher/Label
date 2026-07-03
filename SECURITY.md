# Security Notes

## Data handling model

- Label images and OCR text are processed in-browser in the current implementation path.
- The app does not require a backend database for normal scan/verification usage.
- Audit CSV export is user-initiated and stays on the reviewer workstation unless manually shared.

## OCR model egress controls

The OCR pipeline supports explicit egress hardening through environment configuration:

- `VITE_TRANSFORMERS_LOCAL_ONLY=true`
  - Disables remote model loading (`env.allowRemoteModels=false`).
  - Requires local model assets to be available under `/models/`.
- `VITE_TRANSFORMERS_MODEL_BASE_URL=<approved-host>`
  - Overrides default model host to an approved internal mirror when remote loading is allowed.

Use these controls in restricted environments to align runtime behavior with outbound-traffic policy.

This repository now enforces `VITE_TRANSFORMERS_LOCAL_ONLY=true` for production builds by default.

Local-only builds must include these assets under `public/models/Xenova/trocr-base-printed/`:

- `config.json`
- `generation_config.json`
- `preprocessor_config.json`
- `special_tokens_map.json`
- `tokenizer.json`
- `tokenizer_config.json`
- `vocab.json`
- `merges.txt`
- `onnx/encoder_model_quantized.onnx`
- `onnx/decoder_model_merged_quantized.onnx`
- `onnx/decoder_with_past_model_quantized.onnx`

Validate with:

```bash
npm run models:validate
```

Provisioning helper:

```bash
npm run models:download
```

`models:download` accepts `MODEL_ASSET_BASE_URL` for approved internal mirrors.

## Logging policy

- OCR logs in production are reduced to non-content metadata (pass number, confidence, character count).
- OCR text snippets are not emitted in production logs.

## CSP compatibility (runtime validation)

Run:

```bash
npm run csp:validate
```

Current runtime compatibility profile requires:

- `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'`
- `worker-src 'self' blob:`
- `style-src 'self' 'unsafe-inline'` (current UI uses inline JSX style attributes)

If your organization enforces stricter CSP (for example, no `unsafe-eval` or no `unsafe-inline`), the current runtime path is not compatible without additional refactors/upstream runtime changes.

## Dependency and quality enforcement

- Quality gates run in GitHub Actions (`.github/workflows/quality.yml`) for lint/build/unit/integration/batch/KPI checks.
- Keep dependency upgrades and security patches current; resolve critical/high advisories before release.

## Current advisory status

- The transitive `protobufjs` advisory chain is remediated by forcing a patched version via npm overrides:
  - `overrides.protobufjs = 8.6.5`
- `npm audit --omit=dev` now reports zero known vulnerabilities for production dependencies.
- Keep this override in place until upstream `onnxruntime-web` / `@xenova/transformers` pull in a patched range natively.
