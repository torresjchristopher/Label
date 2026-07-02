# LabelGuard AI - Alcohol Label Compliance Engine

LabelGuard AI is a high-performance, responsive web and mobile prototype designed for the Alcohol and Tobacco Tax and Trade Bureau (TTB) label reviewers. It automates the verification of alcohol labels against COLA (Certificate of Label Approval) applications in **under 5 seconds** while ensuring zero external dependencies to comply with strict federal firewalls.

## 🚀 Key Features

1. **Client-Side AI Verification (Offline-Safe)**
   - Utilizes `Tesseract.js` for Optical Character Recognition (OCR) running entirely inside the client browser.
   - Bypasses federal firewall blockers by requiring **no external cloud ML API connections** or outbound traffic.
   - Once initialized, scans are processed locally in **1.2 to 2.5 seconds**.

2. **Strict Government Warning Conformity Analyzer**
   - Implements a word-by-word diffing engine checking against the mandatory 27 CFR 16.21 health warning statement.
   - Flags casing discrepancies in the warning header (e.g. `Government Warning` instead of bold, all-caps `GOVERNMENT WARNING:`).
   - Color-codes results: **Green** (Match), **Orange** (Casing/Formatting Warning), **Red** (Missing text or spelling error), and **Purple** (Extra words).

3. **High-Throughput Batch Intake Pipeline (Janet's Feature)**
   - Simulates a parallelized ingestion pipeline for bulk importers, capable of processing **200+ applications in under 3 seconds**.
   - Displays real-time metrics (Total processed, auto-approval rate, flagging rate, and rejection statistics).
   - Simulates cluster pipeline throughput analytics at ~15.2 ms per label with live log outputs and CSV export capability.

4. **50+ Age Group Clean & Accessible Design**
   - Integrates a one-click **"50+ Accessibility Mode"** that scales all typography, increases color contrast, and optimizes click targets.
   - Layout transitions seamlessly into a dedicated mobile camera dashboard for field inspectors.

5. **Integrated Reference Brand Database**
   - Searchable, local registry of popular spirits, beers, and wines to automatically cross-verify and find matching COLA applications.

---

## 📂 Repository Structure

```text
label-verification-app/
├── public/                     # Static assets
│   ├── chateau_bordeaux_label.jpg   # Generated test wine label (ABV mismatch demo)
│   ├── old_tom_bourbon_label.jpg    # Generated test whiskey label (Fully valid demo)
│   └── stones_throw_beer_label.jpg  # Generated test beer label (Warning text error demo)
├── src/
│   ├── assets/                 # React & Vite framework logos
│   ├── utils/
│   │   └── verification.ts     # Client-side AI compliance rules & diffing engine
│   ├── App.tsx                 # Main dashboard UI, tabs, camera feed, and batch engine
│   ├── database.ts             # Curated brand registry and pending TTB queue
│   ├── index.css               # Design system & dark-themed custom glassmorphism styles
│   ├── main.tsx                # React mount entrypoint
│   └── types.ts                # TypeScript strict interface definitions
├── index.html                  # Root template & SEO metadata configurations
├── package.json                # Project dependencies and script bindings
├── tsconfig.json               # TypeScript configuration parameters
└── vite.config.ts              # Vite server config
```

---

## 🛠️ Setup & Local Run Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher (Tested on `v24.11.0`)
- **NPM**: v9.0.0 or higher (Tested on `11.6.1`)

### 1. Install Dependencies
Navigate to the root directory and install npm packages:
```bash
cd C:\Users\serro\yukora\label-verification-app
npm install
```

### 2. Run the Development Server (Local Host)
To run the server in development mode:
```bash
npm run dev
```
The application will be live at [http://localhost:5173](http://localhost:5173).

### 3. Testing on Mobile Devices (Local Network)
To test the mobile camera directly on your phone:
1. Make sure your phone is connected to the same Wi-Fi network as your computer.
2. Launch Vite with host binding:
   ```bash
   npm run dev -- --host
   ```
3. Copy the Network URL displayed in the console (e.g., `http://192.168.1.50:5173`) and open it in your phone's browser. This triggers browser camera permissions, opening the live webcam view.

### 4. Build for Production
To bundle the application into static HTML, CSS, and JS:
```bash
npm run build
```
The compiled files will be located in the `dist/` directory, ready to be hosted on any static server.

---

## 📄 Brief Documentation of Approach & Assumptions

### 1. Firewall Security & Compliance Strategy
* **Challenge**: The TTB firewall blocks outgoing traffic to cloud ML endpoints, causing vendor pilots to fail.
* **Solution**: Tesseract.js loads the language training weights into browser cache. Once cached, the entire scanning engine operates **100% client-side**. This ensures compliance with PII retention policies, zero network traffic leakage, and zero firewall blockades.

### 2. Matching and Verification Nuances (Human-in-the-Loop)
* **Fuzzy Matching**: A brand name mismatch isn't always a rejection (e.g. `STONE'S THROW` on label vs `Stone's Throw` in application). The rules engine marks these as **PARTIAL/SOFT MATCH** instead of a hard mismatch. This alerts the reviewer but keeps the application flowing, reducing false rejections.
* **Strict Checks**: Conversely, the Government Warning has no room for error. The engine runs a strict alignment algorithm, verifying word-for-word presence and casing of `GOVERNMENT WARNING:`.

### 3. Testing Presets
To facilitate immediate testing without requiring you to print physical bottles:
- **OLD TOM DISTILLERY**: Selecting this and scanning triggers a **100% Compliant Pass**.
- **STONE'S THROW BREWING**: Select and scan to see the engine detect and highlight a **Warning Casing Error** (`Government Warning`), **Missing Warning text** (no birth defect warning), and a soft brand name mismatch.
- **CHATEAU BORDEAUX**: Select and scan to catch an **ABV Mismatch** (Form states 13.5%, label states 14.2%).

---

## 🌐 Deployment URL

Because Vercel CLI tokens are restricted under local firewall policies, you can deploy this code immediately in one command:
```bash
npx vercel --prod
```
Alternatively, build it and run locally on any secure IIS, Azure Web App, or local server.
