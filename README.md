# AI-Powered Alcohol Label Verification App

This browser-based tool supports TTB-style alcohol label review workflows. It identifies, normalizes, and compares label text against compliance requirements and, when full form data is provided, against application values.

The current implementation is **Transformer.js-first** (`@xenova/transformers`, TrOCR) with multi-pass image preprocessing, confidence gating, structured field extraction, and rule-based compliance checks.

---

## What the App Does

### Core review flow
1. Reviewer opens an application context (or leaves it blank for baseline monitoring).
2. Reviewer uploads label artwork or uses live camera.
3. App runs OCR + extraction + compliance checks.
4. App returns pass/fail signals, detailed mismatches, and audit log entries for failures.

### Two operating modes
| Mode | Trigger | Behavior |
|---|---|---|
| **Baseline compliance monitoring** | All product form fields empty | Validates mandatory label elements and strict Government Warning conformity. |
| **Application-vs-label matching** | Product form fields fully provided | Compares label data to application values (brand, class/type, ABV, volume, producer, origin) with normalization and strict mismatch signaling. |

### Form gating behavior
| Form state | Scanner behavior |
|---|---|
| No fields filled | Baseline monitoring enabled |
| Partially filled (1-5 fields) | Compliance action disabled with warning |
| All required fields filled | Full application discrepancy matching enabled |

---

## Architecture Summary

```text
Camera/Upload
  -> Multi-pass preprocessing
  -> Transformer.js TrOCR (confidence-gated retries)
  -> Structured field extraction
  -> Compliance verification rules
  -> Audit log + CSV export
```

### OCR and preprocessing
- **OCR engine:** `Xenova/trocr-base-printed` via `@xenova/transformers`
- **Passes:** up to 3 preprocessing variants per scan
- **Confidence thresholds:** accept at `>= 0.6`, low-confidence flag `< 0.2`
- **Per-pass timeout:** `30,000 ms`

### Structured extraction
- Brand
- ABV
- Volume (normalized volume support)
- Government warning presence

### Compliance checks
- Brand name matching (with normalization tolerance where appropriate)
- Class/type designation
- ABV
- Net contents
- Producer statement
- Country of origin (imports)
- Strict Government Warning analysis (header + wording checks)
- Additional checks:
  - Sulfite declaration (wine)
  - Importer designation (imports)
  - State-of-distillation signal (whisky guidance)

---

## Security and Federal Environment Fit

- **No required cloud OCR API calls** in normal operation; OCR and compliance run client-side.
- **No backend database** in this prototype path; operational data is session-local in browser context.
- **No external API keys** required for core scanning flow.
- Designed for restricted network environments where outbound ML endpoints may be blocked.

### Egress-hardening options
- `VITE_TRANSFORMERS_LOCAL_ONLY=true` disables remote model downloads and requires local model files under `/models/`.
- `VITE_TRANSFORMERS_MODEL_BASE_URL=<approved-host>` routes model fetches to an approved mirror host.
- See `.env.example` and `SECURITY.md` for deployment guidance.

Production builds in this repository are configured to local-only mode by default via `.env.production` and deploy workflow env.

### Required local model asset layout (for local-only mode)
```text
public/models/Xenova/trocr-base-printed/
  config.json
  generation_config.json
  preprocessor_config.json
  special_tokens_map.json
  tokenizer.json
  tokenizer_config.json
  vocab.json
  merges.txt
  onnx/
    encoder_model_quantized.onnx
    decoder_model_merged_quantized.onnx
    decoder_with_past_model_quantized.onnx
```

Validate before deploy:
```bash
npm run models:validate
```

Provision local assets (one-time, downloads required model files):
```bash
npm run models:download
npm run models:validate
```

---

## Implementation-Derived Performance Metrics (Corrected)

> The previous report mixed simulated and real OCR timing units and included unsupported ROI/capacity claims.  
> This section only lists metrics directly supported by current code behavior.

| Metric | Current value | Source |
|---|---:|---|
| Live camera scan cadence | 1 scan every **3.0 s** | `setInterval(..., 3000)` in `App.tsx` |
| Batch upload processing rate | Depends on device/OCR throughput and the number of uploaded labels | `processBatchUploads` in `App.tsx` |
| Batch intake support | Multi-file upload flow for importer-style label batches | `handleFileChange` in `App.tsx` |
| OCR max retry passes | **3** | `MAX_OCR_PASSES` in `ocr.ts` |
| OCR per-pass timeout | **30 s** | `OCR_PASS_TIMEOUT_MS` in `ocr.ts` |
| OCR accept confidence threshold | **0.6** | `OCR_CONFIDENCE_THRESHOLD` in `ocr.ts` |
| OCR low-confidence threshold | **0.2** | `OCR_LOW_CONFIDENCE_THRESHOLD` in `ocr.ts` |

### Important interpretation note
- Batch timing above reflects the **multi-file intake flow** used for dashboard throughput UX.
- It is **not** the same as real end-to-end OCR timing for 200 real images.
- Real-world latency/accuracy KPIs should be produced from CI benchmark jobs over golden datasets.

---

## KPI Targets for Quality Gates

These are target gates for production hardening:

- p95 end-to-end per label: `<= 5.0s`
- required-field completeness on golden dataset: `>= 99.0%`
- strict warning-check precision: `100%`
- batch success rate: `>= 99.5%`
- timeout rate: `<= 0.5%`

---

## Testing Strategy (CI-Oriented)

1. Unit tests
   - preprocessing
   - confidence gating / retry selection
   - extraction and normalization logic
2. Golden-set integration tests
   - curated labels with expected structured outputs
3. Synthetic stress tests
   - blur, noise, skew, glare, contrast shifts
4. Batch tests
   - high-volume image scenarios (e.g., 200-300 labels)
5. KPI gate checks
   - fail workflow when thresholds are missed
6. Golden label image regression
   - local-model OCR against real uploaded label images
   - expected pass/fail assertions from a manifest file

The CI implementation is in `.github/workflows/quality.yml` and runs:
- `npm run lint`
- `npm run build`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:batch`
- `npm run test:kpi`

Deployment also enforces local-only model presence by running `npm run models:validate` before build.

### Golden image regression suite (for your 5-10 labels)

1. Place images in a repo folder (example: `testdata/label-regression/images/`).
2. Update `testdata/label-regression/manifest.json` with one entry per image:
   - `imagePath`
   - full `application` object
   - `expectedStatus` (`PASS` or `FAIL`)
3. Run locally:
   ```bash
   npm run models:download
   npm run models:validate
   npm run test:labels
   ```
4. Run in GitHub Actions:
   - workflow: `.github/workflows/label-regression.yml`
   - triggers manually (`workflow_dispatch`) or when regression inputs change.

---

## Repository Structure

```text
src/
  App.tsx                    # Main UI, scanner flow, dashboard, and batch uploads
  types.ts                   # Shared interfaces and verification result types
  database.ts                # Demo application data and canonical warning text
  utils/
    imageProcessing.ts       # OCR preprocessing variants
    ocr.ts                   # Transformer.js OCR + confidence gating
    labelExtractor.ts        # Structured extraction from OCR text
    verification.ts          # Compliance rule engine and warning diff logic
```

---

## Setup

### Prerequisites
- Node.js 18+
- npm 9+

### Install
```bash
npm install
```

### Optional security configuration
```bash
cp .env.example .env.local
```
Then set `VITE_TRANSFORMERS_LOCAL_ONLY=true` in restricted-network deployments.

### Run
```bash
npm run dev
```

### Build
```bash
npm run build
```

For local-only OCR testing, run model provisioning first:
```bash
npm run models:download
npm run models:validate
```

---

## Links

- Live app: https://torresjchristopher.github.io/Label/
- Repository: https://github.com/torresjchristopher/Label
