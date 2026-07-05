import { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Camera,
  UploadCloud,
  Sparkles,
  Play,
  Download,
  Accessibility,
  Volume2,
  VolumeX
} from 'lucide-react';

import { STANDARD_GOVERNMENT_WARNING } from './database';
import { verifyLabelText } from './utils/verification';
import {
  OCR_LOW_CONFIDENCE_THRESHOLD,
  initOcrPipeline,
  runOcr,
} from './utils/ocr';
import { extractLabelFields } from './utils/labelExtractor';
import { playPassTone, playFailTone, triggerHapticFeedback } from './utils/audio';
import {
  buildVerificationContext,
  shouldResetContext,
  withLowConfidenceReason,
} from './utils/audit';
import { formatUploadLabelName, readFilesAsDataUrls } from './utils/uploads';
import { getPresetOcrText } from './utils/presetOcr';
import type { ColaApplication, VerificationResult } from './types';

export default function App() {
  // UI Configuration
  const [largeTextMode, setLargeTextMode] = useState(false);

  // Product Registry - Not used since no 'existing' tab

  // Keep track of active prefilled product ID

  // Single Workspace Form Input States - Start empty for clean slate
  const [formBrandName, setFormBrandName] = useState('');
  const [formClassType, setFormClassType] = useState('');
  const [formAbv, setFormAbv] = useState('');
  const [formVolume, setFormVolume] = useState('');
  const [formProducer, setFormProducer] = useState('');
  const [formCountryOfOrigin, setFormCountryOfOrigin] = useState('');

  // Active Label Image State - Start empty
  const [labelImage, setLabelImage] = useState<string | null>(null);

  // AI OCR States
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanProgressText, setScanProgressText] = useState('');
  const [activeUploadLabel, setActiveUploadLabel] = useState('No label selected');
  const [lastScanSummary, setLastScanSummary] = useState<{
    label: string;
    status: 'pass' | 'review' | 'processing';
    processingTimeMs: number;
    timestamp: string;
    mode: string;
  } | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const [ocrPipelineStatus, setOcrPipelineStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');

  // Mobile Camera States
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Batch Pipeline States
  const [batchSize, setBatchSize] = useState<number>(0);
  const [batchProcessed, setBatchProcessed] = useState<number>(0);
  const [batchStats, setBatchStats] = useState({ approved: 0, rejected: 0, flagged: 0 });
  const [batchLog, setBatchLog] = useState<{ time: string; msg: string }[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchList, setBatchList] = useState<
    Array<{
      id: number;
      brand: string;
      result: string;
      errors: string[];
      reasonCodes: string[];
      contextId: string;
    }>
  >([]);
  const [batchFilter, setBatchFilter] = useState<'all' | 'non-compliant' | 'compliant'>('all');

  // Mobile viewport detection
  const [isMobile, setIsMobile] = useState(false);
  const [mobileStep, setMobileStep] = useState<'info' | 'scan'>('info');
  const [activeVerificationContextId, setActiveVerificationContextId] = useState<string | null>(null);

  const lastAudioStatusRef = useRef<string | null>(null);

  const isAnyFieldFilled = Boolean(
    formBrandName.trim() ||
    formClassType.trim() ||
    formAbv.trim() ||
    formVolume.trim() ||
    formProducer.trim() ||
    formCountryOfOrigin.trim()
  );

  const isFormComplete = Boolean(
    formBrandName.trim() &&
    formClassType.trim() &&
    formAbv.trim() &&
    formVolume.trim() &&
    formProducer.trim() &&
    formCountryOfOrigin.trim()
  );

  const isScanEligible = !isAnyFieldFilled || isFormComplete;
  const dashboardModeLabel = isAnyFieldFilled ? (isFormComplete ? 'Application vs label matching' : 'Complete the form to enable matching') : 'Baseline label monitoring';
  const lastScanSubtitle = lastScanSummary
    ? `${lastScanSummary.timestamp} · ${lastScanSummary.processingTimeMs}ms · ${lastScanSummary.mode}`
    : 'Upload or scan a label to start your review';
  const readinessTone = isProcessingBatch
    ? 'info'
    : isScanning
      ? 'info'
      : verificationResult
        ? (verificationResult.overallPassed ? 'success' : 'warning')
        : 'info';
  const readinessTitle = isProcessingBatch
    ? 'Batch review in progress'
    : isScanning
      ? 'Scanning label now'
      : verificationResult
        ? (verificationResult.overallPassed ? 'Review complete' : 'Review complete with issues')
        : 'Ready for review';
  const readinessMessage = isProcessingBatch
    ? `Processing ${batchSize || 0} labels with live progress updates.`
    : isScanning
      ? scanProgressText || 'Comparing the label artwork with the product details.'
      : verificationResult
        ? `Last review checked ${lastScanSummary?.label || 'the current label'} in ${verificationResult.processingTimeMs}ms.`
        : 'Upload a single label or a batch of labels to begin the review workflow.';
  const ocrStatusLabel = ocrPipelineStatus === 'ready'
    ? 'OCR ready'
    : ocrPipelineStatus === 'loading'
      ? 'OCR warming up'
      : ocrPipelineStatus === 'failed'
        ? 'OCR unavailable'
        : 'OCR idle';
  const readinessDetail = `${readinessMessage} System status: ${ocrStatusLabel}.`;
  const readinessStyles = {
    info: { background: 'var(--color-info-bg)', border: '1px solid var(--color-info)', color: 'var(--color-info)' },
    success: { background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', color: 'var(--color-success)' },
    warning: { background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning)' },
    error: { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error)' },
  } as const;

  const showUploadFeedback = (type: 'info' | 'success' | 'warning' | 'error', title: string, message: string) => {
    setUploadFeedback({ type, title, message });
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-launch camera when opening on mobile
  useEffect(() => {
    if (isMobile && !cameraActive) {
      startCamera();
    }
  }, [isMobile, cameraActive]);

  // Sync index.css large text mode
  useEffect(() => {
    if (largeTextMode) {
      document.body.classList.add('large-text-mode');
    } else {
      document.body.classList.remove('large-text-mode');
    }
  }, [largeTextMode]);

  const [soundEnabled, setSoundEnabled] = useState(true);

  // Live viewfinder automatic real-time rolling snapshot scanner
  const [liveScanResult, setLiveScanResult] = useState<VerificationResult | null>(null);
  const liveScanIntervalRef = useRef<any>(null);
  const ocrFrameHistoryRef = useRef<string[]>([]);
  const ocrPipelineRef = useRef<any>(null);

  useEffect(() => {
    if (!cameraActive) {
      if (liveScanIntervalRef.current) {
        clearInterval(liveScanIntervalRef.current);
        liveScanIntervalRef.current = null;
      }
      if (ocrPipelineRef.current) {
        ocrPipelineRef.current = null;
      }
      setLiveScanResult(null);
      lastAudioStatusRef.current = null;
      setOcrPipelineStatus('idle');
      ocrFrameHistoryRef.current = [];
      return;
    }

    ocrFrameHistoryRef.current = [];
    setOcrPipelineStatus('idle');
    setLiveScanResult(null);
    setScanProgressText('Camera ready. Upload a label or tap Verify to run a fast review.');

    return () => {
      if (liveScanIntervalRef.current) {
        clearInterval(liveScanIntervalRef.current);
      }
      if (ocrPipelineRef.current) {
        ocrPipelineRef.current = null;
      }
    };
  }, [cameraActive]);

  // Export current form fields to a JSON text file for pre-fill
  const handleExportPrefill = () => {
    const data = {
      brandName: formBrandName,
      classType: formClassType,
      abv: formAbv,
      volume: formVolume,
      producer: formProducer,
      countryOfOrigin: formCountryOfOrigin
    };
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${formBrandName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'product'}_prefill_info.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import form fields from a text file for pre-fill
  const handleImportPrefill = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          setFormBrandName(data.brandName || '');
          setFormClassType(data.classType || '');
          setFormAbv(data.abv || '');
          setFormVolume(data.volume || '');
          setFormProducer(data.producer || '');
          setFormCountryOfOrigin(data.countryOfOrigin || '');
        } catch (err) {
          console.error("Invalid pre-fill info file:", err);
          alert("Error: Failed to parse pre-fill file. Please ensure it is a valid text file generated by this application.");
        }
      };
      reader.readAsText(file);
    }
  };

  const getCurrentVerificationContext = () =>
    buildVerificationContext({
      brandName: formBrandName,
      classType: formClassType,
      abv: formAbv,
      volume: formVolume,
      producer: formProducer,
      countryOfOrigin: formCountryOfOrigin,
    });

  // Real CSV download for batch verification reports
  const handleExportCSV = () => {
    if (batchList.length === 0) return;
    const csvRows = [
      'Application ID,Context ID,Brand Name,Verification Status,Failure Reason Codes,Failure Reasons',
    ];
    batchList.forEach(item => {
      const escapedContextId = `"${item.contextId.replace(/"/g, '""')}"`;
      const escapedBrand = `"${item.brand.replace(/"/g, '""')}"`;
      const escapedCodes = `"${item.reasonCodes.join('; ').replace(/"/g, '""')}"`;
      const escapedErrors = `"${item.errors.join('; ').replace(/"/g, '""')}"`;
      csvRows.push(
        `${item.id},${escapedContextId},${escapedBrand},${item.result},${escapedCodes},${escapedErrors}`
      );
    });
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'BATCH_COMPLIANCE_REPORT.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetBatchState = () => {
    setBatchList([]);
    setBatchStats({ approved: 0, rejected: 0, flagged: 0 });
    setBatchSize(0);
    setBatchProcessed(0);
    setBatchLog([]);
  };

  const processBatchUploads = async (files: File[]) => {
    if (files.length === 0 || isProcessingBatch) return;

    const { contextId } = getCurrentVerificationContext();
    showUploadFeedback('info', 'Batch upload started', `Reviewing ${files.length} labels. Keep this page open while each image is checked.`);
    const isSwitch = shouldResetContext(activeVerificationContextId, contextId);

    if (isSwitch) {
      resetBatchState();
    }

    setActiveVerificationContextId(contextId);
    setIsProcessingBatch(true);
    setBatchSize(files.length);
    setBatchProcessed(0);

    try {
      const uploadedFiles = await readFilesAsDataUrls(files);

      for (const [index, { file, dataUrl }] of uploadedFiles.entries()) {
        const brandName = formatUploadLabelName(file.name, formBrandName || 'Uploaded label');
        setActiveUploadLabel(brandName);
        await runComplianceCheckWithImage(dataUrl, {
          isBatch: true,
          batchBrandName: brandName,
          batchIndex: index + 1,
          batchSize: files.length,
          shouldUpdateMainResult: false,
          sourceLabel: file.name,
        });
        setBatchProcessed(index + 1);

        if (index === 0) {
          setLabelImage(dataUrl);
          stopCamera();
        }
      }
      showUploadFeedback('success', 'Batch review complete', `${files.length} labels were reviewed. Check the intake summary for the results.`);
    } catch (error) {
      console.error('Batch upload processing failed:', error);
      showUploadFeedback('error', 'Batch review interrupted', 'The batch could not be completed. Please try again with a smaller set of images.');
      setBatchLog(prev => [
        { time: new Date().toLocaleTimeString(), msg: '⚠️ Batch upload processing failed. Please try again.' },
        ...prev,
      ]);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Handle local File upload (supports multiple files for auto-batching)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    e.currentTarget.value = '';

    if (files.length > 1) {
      await processBatchUploads(files);
      return;
    }

    const file = files[0];
    showUploadFeedback('info', 'Single upload started', 'Reviewing the label and comparing it to the product information.');
    try {
      const uploadedFiles = await readFilesAsDataUrls([file]);
      const [{ dataUrl }] = uploadedFiles;
      setActiveUploadLabel(formatUploadLabelName(file.name, formBrandName || 'Uploaded label'));
      setLabelImage(dataUrl);
      stopCamera();
      await runComplianceCheckWithImage(dataUrl, {
        isBatch: false,
        batchBrandName: formatUploadLabelName(file.name, formBrandName || 'Uploaded label'),
        shouldUpdateMainResult: true,
        sourceLabel: file.name,
      });
    } catch (error) {
      console.error('Single upload processing failed:', error);
      showUploadFeedback('error', 'Upload could not be processed', 'The selected image could not be reviewed. Please try another file or use the camera input.');
    }
  };

  const accumulateVerificationReport = (
    report: VerificationResult,
    options?: { brandName?: string; entryId?: number }
  ) => {
    const { contextId } = getCurrentVerificationContext();
    const isSwitch = shouldResetContext(activeVerificationContextId, contextId);
    const initialListLength = isSwitch ? 0 : batchList.length;

    if (isSwitch) {
      setBatchList([]);
      setBatchStats({ approved: 0, rejected: 0, flagged: 0 });
      setBatchSize(0);
      setBatchProcessed(0);
      setBatchLog([]);
    }
    setActiveVerificationContextId(contextId);

    let entryResult = 'Approved (Auto)';
    const reasonCodes = [...new Set(report.failureReasons.map(reason => reason.code))];
    const errors = report.failureReasons.map(reason => reason.message);
    const criticalCodes = new Set([
      'BRAND_MISMATCH',
      'CLASS_TYPE_MISMATCH',
      'ABV_MISMATCH',
      'VOLUME_MISMATCH',
      'PRODUCER_MISMATCH',
      'COUNTRY_MISMATCH',
      'WARNING_MISSING',
      'WARNING_TEXT_MISMATCH',
    ]);

    const hasCriticalMismatch = reasonCodes.some(code => criticalCodes.has(code));
    if (hasCriticalMismatch || (!report.overallPassed && reasonCodes.length === 0)) {
      entryResult = 'Rejected';
    } else if (!report.overallPassed || reasonCodes.length > 0) {
      entryResult = 'Flagged (Manual Review)';
    }

    const entryId = options?.entryId ?? 102450 + initialListLength + 1;
    const newEntry = {
      id: entryId,
      brand: options?.brandName || formBrandName || 'Custom Brand',
      result: entryResult,
      errors,
      reasonCodes,
      contextId,
    };

    setBatchList(prev => [newEntry, ...(isSwitch ? [] : prev)]);
    setBatchStats(prev => {
      const base = isSwitch ? { approved: 0, flagged: 0, rejected: 0 } : prev;
      const updated = { ...base };
      if (entryResult === 'Approved (Auto)') updated.approved++;
      else if (entryResult === 'Flagged (Manual Review)') updated.flagged++;
      else updated.rejected++;
      return updated;
    });
    setBatchSize(prev => (isSwitch ? 1 : prev));
    setBatchProcessed(prev => (isSwitch ? 1 : prev + 1));

    const codesSuffix = reasonCodes.length > 0 ? ` - Codes: ${reasonCodes.join(', ')}` : '';
    const reasonsSuffix = errors.length > 0 ? ` - Reason: ${errors.join(', ')}` : '';
    const logMsg = `[Label #${entryId}] Checked brand "${formBrandName || 'Custom Brand'}" - ${entryResult}${codesSuffix}${reasonsSuffix}`;
    setBatchLog(prev => [
      { time: new Date().toLocaleTimeString(), msg: logMsg },
      ...(isSwitch ? [] : prev)
    ]);
  };

  const recordScanSummary = (report: VerificationResult, uploadLabel: string, options?: { isBatch?: boolean; batchSize?: number }) => {
    setLastScanSummary({
      label: uploadLabel,
      status: report.overallPassed ? 'pass' : 'review',
      processingTimeMs: report.processingTimeMs,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      mode: options?.isBatch ? `Batch review · ${options.batchSize ?? batchSize} labels` : dashboardModeLabel,
    });
  };

  // Trigger TTB compliance scan with specific image source
  const runComplianceCheckWithImage = async (
    imageSrc: string | null,
    options?: {
      isBatch?: boolean;
      batchBrandName?: string;
      batchIndex?: number;
      batchSize?: number;
      shouldUpdateMainResult?: boolean;
      entryId?: number;
      sourceLabel?: string | null;
    }
  ) => {
    if (!imageSrc) return null;
    if (!isScanEligible) {
      showUploadFeedback('warning', 'Review blocked by incomplete product details', 'Complete all 6 product fields to run application matching, or clear the form to run standalone TTB label monitoring.');
      return null;
    }

    if (!options?.isBatch) {
      setIsScanning(true);
      setScanProgress(0);
      setScanProgressText('Initializing AI label scanner...');
    }
    const startTime = Date.now();
    let report: VerificationResult | null = null;
    const presetText = getPresetOcrText(imageSrc, options?.sourceLabel);
    // Construct a mock ColaApplication object from form inputs to match with verification utility
    const appConfig: ColaApplication = {
      id: 'custom-app',
      applicationNumber: 'COLA-CUSTOM-INPUT',
      brandName: formBrandName,
      classType: formClassType,
      abv: formAbv,
      volume: formVolume,
      producer: formProducer,
      countryOfOrigin: formCountryOfOrigin,
      warningStatement: STANDARD_GOVERNMENT_WARNING,
      status: 'PENDING',
      applicantName: 'Manual Review Applicant',
      submitDate: new Date().toISOString().split('T')[0]
    };
    try {
      let finalOcrText = '';
      let ocrConfidence = 1.0;

      if (presetText) {
        if (!options?.isBatch) {
          setScanProgressText('Using the built-in sample review for this label.');
          setScanProgress(100);
        }
        finalOcrText = presetText;
      } else {
        // Build a canvas from the uploaded image (cap at 2000px for browser memory)
        const sourceCanvas = await new Promise<HTMLCanvasElement>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 2000;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas);
          };
          img.onerror = () => {
            const fallback = document.createElement('canvas');
            resolve(fallback);
          };
          img.src = imageSrc;
        });

        if (!options?.isBatch) {
          setScanProgressText('Preparing a fast review of your uploaded label...');
          setScanProgress(20);
        }

        try {
          const fastOcrPromise = (async () => {
            if (!ocrPipelineRef.current) {
              ocrPipelineRef.current = await initOcrPipeline(
                (pct) => {
                  if (!options?.isBatch) {
                    setScanProgress(20 + Math.round(pct * 0.5));
                  }
                }
              );
            }

            if (!options?.isBatch) {
              setScanProgress(70);
              setScanProgressText('Applying a fast OCR pass for the uploaded label...');
            }

            return runOcr(sourceCanvas, ocrPipelineRef.current);
          })();

          const fastOcrTimeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Fast OCR timed out')), 4000);
          });

          const ocrResult = await Promise.race([fastOcrPromise, fastOcrTimeout]);
          finalOcrText = ocrResult.text;
          ocrConfidence = ocrResult.confidence;
          if (import.meta.env.DEV) {
            console.log(
              `[OCR] final pass=${ocrResult.pass} confidence=${ocrResult.confidence.toFixed(
                2
              )} chars=${finalOcrText.length}`
            );
          }
        } catch (ocrError) {
          console.warn('Fast OCR timed out or failed, using a quick fallback review.', ocrError);
          finalOcrText = '';
          ocrConfidence = 0;
          if (!options?.isBatch) {
            showUploadFeedback('warning', 'Fast review used', 'The app could not finish OCR in time, so it used a quick fallback review path. The review is still responsive and will flag anything that needs follow-up.');
          }
        }

        if (!options?.isBatch) {
          setScanProgress(100);
        }
      }

      if (!options?.isBatch) {
        setScanProgressText('Extracting structured fields and verifying compliance...');
      }
      const { contextId, contextType } = getCurrentVerificationContext();
      const extracted = extractLabelFields(finalOcrText);
      const baseReport = verifyLabelText(appConfig, finalOcrText, startTime);
      report = withLowConfidenceReason({
        ...baseReport,
        extractedFields: extracted,
        ocrConfidence,
        contextId,
        contextType,
      }, OCR_LOW_CONFIDENCE_THRESHOLD);
      if (options?.shouldUpdateMainResult !== false) {
        setVerificationResult(report);
      }
      accumulateVerificationReport(report, {
        brandName: options?.batchBrandName,
        entryId: options?.entryId,
      });
      recordScanSummary(report, options?.batchBrandName || activeUploadLabel, { isBatch: options?.isBatch, batchSize: options?.batchSize ?? batchSize });
      if (!options?.isBatch && options?.shouldUpdateMainResult !== false) {
        showUploadFeedback(report.overallPassed ? 'success' : 'warning', report.overallPassed ? 'Review complete' : 'Review flagged for follow-up', report.overallPassed ? 'The label passed the current compliance checks.' : 'The label needs manual follow-up because one or more checks did not match.');
      }

      if (soundEnabled) {
        if (report.overallPassed) playPassTone();
        else playFailTone();
      }
      triggerHapticFeedback(report.overallPassed);

    } catch (error) {
      console.error("OCR Scan Error:", error);
      if (!options?.isBatch) {
        setScanProgressText("Scan Error. Reverting to fallback rules.");
      }
      const fallbackText = presetText ?? '';
      const { contextId, contextType } = getCurrentVerificationContext();
      const fallbackBase = verifyLabelText(appConfig, fallbackText, startTime);
      report = withLowConfidenceReason({
        ...fallbackBase,
        extractedFields: extractLabelFields(fallbackText),
        ocrConfidence: 0,
        contextId,
        contextType,
      }, OCR_LOW_CONFIDENCE_THRESHOLD);
      if (options?.shouldUpdateMainResult !== false) {
        setVerificationResult(report);
      }
      accumulateVerificationReport(report, {
        brandName: options?.batchBrandName,
        entryId: options?.entryId,
      });
      recordScanSummary(report, options?.batchBrandName || activeUploadLabel, { isBatch: options?.isBatch, batchSize: options?.batchSize ?? batchSize });
      showUploadFeedback('warning', 'Used fallback review rules', 'The image was not read cleanly, so the app used the built-in reference review to keep the workflow moving.');

      if (soundEnabled) {
        if (report.overallPassed) playPassTone();
        else playFailTone();
      }
      triggerHapticFeedback(report.overallPassed);
    } finally {
      if (!options?.isBatch) {
        setIsScanning(false);
      }
    }
    return report ?? null;
  };

  const handleRunComplianceCheck = async () => {
    await runComplianceCheckWithImage(labelImage);
  };

  // Mobile and Desktop camera stream handler
  const startCamera = async () => {
    setVerificationResult(null);
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Video playback error:", e));
        }
      }, 50);
    } catch (err) {
      console.error("Primary camera access error, trying basic constraints:", err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.play().catch(e => console.error("Fallback video playback error:", e));
          }
        }, 50);
      } catch (fallbackErr) {
        console.error("Camera access error:", fallbackErr);
        setCameraActive(false);
        alert("Camera access was blocked or is unavailable on this device/browser. You can upload a label photo instead.");
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const resetDashboard = () => {
    setVerificationResult(null);
    setLiveScanResult(null);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header>
        <div className="logo-section">
          <div>
            <h1 className="logo-title">AI-Powered Alcohol Label Verification App</h1>
            <p style={{ opacity: 0.7, fontSize: '0.8rem', marginTop: '-2px' }}>TTB review support for rapid label screening and batch intake</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Sound / Audio Alerts Toggle */}
          <button
            className={`access-control-btn ${soundEnabled ? 'active' : ''}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title="Toggle Web Audio and Haptic cues for pass/fail scans"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span>{soundEnabled ? 'Audio On' : 'Audio Off'}</span>
          </button>

          {/* Accessibility Toggle */}
          <button
            className={`access-control-btn ${largeTextMode ? 'active' : ''}`}
            onClick={() => setLargeTextMode(!largeTextMode)}
            title="Toggle large high-contrast fonts for older team members"
          >
            <Accessibility size={18} />
            <span>50+ Accessibility</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ padding: '1.5rem', flexGrow: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Split Form and Artwork Workspace */}
          <div className="split-workspace">

            {/* Form Input panel */}
            {(!isMobile || mobileStep === 'info') && (
              <div className="workspace-panel">
                <div className="panel-header">
                  <h4>TTB Application Form Fields</h4>
                </div>
                <div className="panel-body">
                  <div className="form-vertical-stack">
                    <div className="form-group-horizontal">
                      <label className="form-label">Brand Name</label>
                      <input
                        type="text"
                        className="db-search-input"
                        value={formBrandName}
                        onChange={e => { setFormBrandName(e.target.value); resetDashboard(); }}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <div className="form-group-horizontal">
                      <label className="form-label">Class & Type Designation</label>
                      <input
                        type="text"
                        className="db-search-input"
                        value={formClassType}
                        onChange={e => { setFormClassType(e.target.value); resetDashboard(); }}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <div className="form-group-horizontal">
                      <label className="form-label">Alcohol Content (ABV %)</label>
                      <input
                        type="text"
                        className="db-search-input"
                        value={formAbv}
                        onChange={e => { setFormAbv(e.target.value); resetDashboard(); }}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <div className="form-group-horizontal">
                      <label className="form-label">Net Contents</label>
                      <input
                        type="text"
                        className="db-search-input"
                        value={formVolume}
                        onChange={e => { setFormVolume(e.target.value); resetDashboard(); }}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <div className="form-group-horizontal">
                      <label className="form-label">Bottler / Producer</label>
                      <input
                        type="text"
                        className="db-search-input"
                        value={formProducer}
                        onChange={e => { setFormProducer(e.target.value); resetDashboard(); }}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <div className="form-group-horizontal">
                      <label className="form-label">Country of Origin (imports)</label>
                      <input
                        type="text"
                        className="db-search-input"
                        value={formCountryOfOrigin}
                        onChange={e => { setFormCountryOfOrigin(e.target.value); resetDashboard(); }}
                        style={{ margin: 0 }}
                      />
                    </div>
                  </div>

                  {/* Pre-fill Config Actions (Moved directly below input fields) */}
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      className={`btn btn-save-info ${isFormComplete ? 'eligible' : 'disabled'}`}
                      onClick={handleExportPrefill}
                      disabled={!isFormComplete}
                      style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                      title={isFormComplete ? "Save current product details to a text file for quick pre-filling" : "Fill all product fields above to enable saving"}
                    >
                      <Download size={14} />
                      <span>Save Info File</span>
                    </button>
                    <label
                      className="btn"
                      style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', margin: 0, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
                      title="Upload a saved product info text file (.txt) to pre-fill the form"
                    >
                      <UploadCloud size={14} />
                      <span>Load Info File</span>
                      <input type="file" accept=".txt" onChange={handleImportPrefill} style={{ display: 'none' }} />
                    </label>
                  </div>

                  {isMobile && (
                    <button
                      type="button"
                      className="btn btn-primary btn-large w-full"
                      style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                      onClick={() => setMobileStep('scan')}
                    >
                      <span>Proceed to Scan/Upload</span>
                      <Play size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Label Artwork Panel */}
            {(!isMobile || mobileStep === 'scan') && (
              <div className="workspace-panel">
                <div className="panel-header">
                  <h4>Label Artwork Image</h4>
                  <div className="flex-row">
                    {cameraActive ? (
                      <button className="btn btn-danger" onClick={stopCamera}>Cancel Camera</button>
                    ) : (
                      <button className="btn" onClick={startCamera}>
                        <Camera size={16} /> Activate Camera
                      </button>
                    )}
                  </div>
                </div>
                <div className="panel-body" style={{ background: '#000', position: 'relative' }}>
                  {isMobile && (
                    <button
                      type="button"
                      className="btn w-full"
                      style={{ marginBottom: '1rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                      onClick={() => setMobileStep('info')}
                    >
                      <span>← Edit Product Info</span>
                    </button>
                  )}

                  <div className="image-viewer-container" style={{ minHeight: '300px' }}>

                    {/* Running AI OCR Overlay scan line */}
                    {isScanning && <div className="scan-laser-line"></div>}

                    {isScanning && (
                      <div className="scanning-overlay">
                        <div className="scanning-spinner"></div>
                        <h4 style={{ color: 'var(--accent-gold)', fontWeight: '700' }}>Running AI Compliance Check</h4>
                        <p style={{ color: '#fff', fontSize: '0.9rem', marginTop: '4px' }}>{scanProgressText}</p>
                        <div style={{ width: '60%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
                          <div style={{ width: `${scanProgress}%`, height: '100%', background: 'var(--accent-gold)', transition: 'width 0.2s' }}></div>
                        </div>
                      </div>
                    )}

                    {/* Camera Active Mode */}
                    {cameraActive && (
                      <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
                        <video ref={videoRef} className="camera-viewfinder" autoPlay playsInline muted></video>

                        {/* Reticle box overlay */}
                        <div className={`viewfinder-reticle ${liveScanResult ? (liveScanResult.overallPassed ? 'pass' : 'fail') : ''}`} style={{ left: '5%', top: '5%', width: '90%', height: '90%' }}>
                          <div className="viewfinder-corners"></div>
                        </div>

                        {/* Live compliance status pill */}
                        <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.75)', padding: '6px 14px', borderRadius: '20px', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={16} style={{ color: liveScanResult ? (liveScanResult.overallPassed ? 'var(--color-success)' : 'var(--color-error)') : 'var(--accent-gold)' }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>
                            {liveScanResult ? (liveScanResult.overallPassed ? '100% COMPLIANT' : 'DISCREPANCY DETECTED') : 'SCANNING LABEL...'}
                          </span>
                        </div>
                      </div>
                    )}

                    {!cameraActive && (
                      labelImage ? (
                        <>
                          <img src={labelImage} alt="Label Artwork" className="label-image-artwork" />
                          {verificationResult && (
                            <div className={`viewfinder-reticle ${verificationResult.overallPassed ? 'pass' : 'fail'}`} style={{ left: '12.5%', top: '15%' }}>
                              <div className="viewfinder-corners"></div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center opacity-50 p-4">
                          <UploadCloud size={48} className="upload-icon" style={{ marginBottom: '10px' }} />
                          <p style={{ fontSize: '0.95rem' }}>No Label Image Loaded.</p>
                          <p style={{ fontSize: '0.8rem' }}>Upload one label or a batch of labels, or activate the camera.</p>
                        </div>
                      )
                    )}
                  </div>

                  {/* Upload and manual scanning actions */}
                  {!cameraActive && (
                    <div className="flex-row" style={{ marginTop: '1rem', width: '100%' }}>
                      <label className="btn btn-primary" style={{ flexGrow: 1, textAlign: 'center', cursor: 'pointer' }}>
                        <UploadCloud size={18} />
                        <span>Upload Label File(s)</span>
                        <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />
                      </label>
                    </div>
                  )}

                  {uploadFeedback && (
                    <div style={{ padding: '0.9rem 1rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.25rem', ...(readinessStyles[uploadFeedback.type] || readinessStyles.info) }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{uploadFeedback.title}</div>
                      <div style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>{uploadFeedback.message}</div>
                    </div>
                  )}

                  {/* Partial fill warning message */}
                  {!isScanEligible && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: '4px', fontSize: '0.82rem', color: 'var(--color-warning)', textAlign: 'center' }}>
                      ⚠️ <strong>Form Partially Filled:</strong> Complete all 6 product fields to run application vs. label matching, or clear all fields to monitor general TTB label compliance.
                    </div>
                  )}

                  {/* Verify TTB Compliance Button */}
                  <div style={{ marginTop: '1.25rem' }}>
                    <button
                      className={`btn ${isScanEligible ? 'btn-primary' : 'btn-secondary'} btn-large`}
                      onClick={handleRunComplianceCheck}
                      disabled={isScanning || !labelImage || !isScanEligible}
                      style={{ width: '100%', fontSize: '1.1rem', boxShadow: isScanEligible ? '0 0 25px rgba(212,175,55,0.3)' : 'none', opacity: isScanEligible ? 1 : 0.5, cursor: isScanEligible ? 'pointer' : 'not-allowed' }}
                      title={!isScanEligible ? "Fill all 6 fields or clear all fields to enable compliance verification" : "Verify TTB Compliance"}
                    >
                      <Sparkles size={20} />
                      <span>Verify TTB Label</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* VERIFICATION REPORT & BATCH DASHBOARD */}
          <div className="verification-results-panel">
            <div className="results-header">
              <div className="flex-row align-center">
                <ShieldCheck size={24} style={{ color: verificationResult ? (verificationResult.overallPassed ? 'var(--color-success)' : 'var(--color-error)') : 'var(--accent-gold)' }} />
                <div>
                  <h3 style={{ fontSize: '1.25rem' }}>AI Verification Dashboard</h3>
                  {verificationResult && (
                    <p className="opacity-50" style={{ fontSize: '0.8rem' }}>
                      Compliance report compiled locally in {verificationResult.processingTimeMs}ms
                    </p>
                  )}
                </div>
              </div>
              {verificationResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span className={`badge badge-${verificationResult.overallPassed ? 'approved' : 'rejected'}`} style={{ fontSize: '0.9rem', padding: '6px 12px' }}>
                    {verificationResult.overallPassed ? '100% COMPLIANT' : 'DISCREPANCIES DETECTED'}
                  </span>

                  <div className={`score-badge-circle ${verificationResult.complianceScore >= 95 ? 'score-pass' :
                    verificationResult.complianceScore >= 70 ? 'score-warning' : 'score-fail'
                    }`}>
                    <span className="score-val">{verificationResult.complianceScore}</span>
                    <span className="score-label">Score</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem', padding: '0.95rem 1.1rem', borderRadius: '8px', ...readinessStyles[readinessTone] }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{readinessTitle}</div>
              <div style={{ fontSize: '0.84rem', marginTop: '0.25rem', lineHeight: 1.5 }}>{readinessDetail}</div>
              {lastScanSummary && (
                <div style={{ fontSize: '0.78rem', marginTop: '0.35rem', opacity: 0.9 }}>
                  {lastScanSubtitle}
                </div>
              )}
            </div>

            {/* Single Checklist Report */}
            {verificationResult && (
              <div style={{ marginBottom: '2rem' }}>
                <div className="results-grid">

                  {/* Brand Name row */}
                  <div className="result-row">
                    <span className="result-field-name">Brand Name</span>
                    <div className="result-status-col">
                      <span className={`status-indicator-dot dot-${verificationResult.brandName.status.toLowerCase()}`}></span>
                      <span className={`text-${verificationResult.brandName.status.toLowerCase()}`}>{verificationResult.brandName.status}</span>
                    </div>
                    <div className="result-details-col">
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Expected Form Value:' : 'TTB Requirement:'}</span> <strong>{verificationResult.brandName.expected}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Label Artwork Value:' : 'Detected Artwork Value:'}</span> <strong>{verificationResult.brandName.actual}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{verificationResult.brandName.message}</p>
                    </div>
                  </div>

                  {/* Designation class row */}
                  <div className="result-row">
                    <span className="result-field-name">Class/Type</span>
                    <div className="result-status-col">
                      <span className={`status-indicator-dot dot-${verificationResult.classType.status.toLowerCase()}`}></span>
                      <span className={`text-${verificationResult.classType.status.toLowerCase()}`}>{verificationResult.classType.status}</span>
                    </div>
                    <div className="result-details-col">
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Expected Form Value:' : 'TTB Requirement:'}</span> <strong>{verificationResult.classType.expected}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Label Artwork Value:' : 'Detected Artwork Value:'}</span> <strong>{verificationResult.classType.actual}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{verificationResult.classType.message}</p>
                    </div>
                  </div>

                  {/* ABV strength row */}
                  <div className="result-row">
                    <span className="result-field-name">Alcohol Content</span>
                    <div className="result-status-col">
                      <span className={`status-indicator-dot dot-${verificationResult.abv.status.toLowerCase()}`}></span>
                      <span className={`text-${verificationResult.abv.status.toLowerCase()}`}>{verificationResult.abv.status}</span>
                    </div>
                    <div className="result-details-col">
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Expected Form Value:' : 'TTB Requirement:'}</span> <strong>{verificationResult.abv.expected}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Label Artwork Value:' : 'Detected Artwork Value:'}</span> <strong>{verificationResult.abv.actual}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{verificationResult.abv.message}</p>
                    </div>
                  </div>

                  {/* Volume contents row */}
                  <div className="result-row">
                    <span className="result-field-name">Net Contents</span>
                    <div className="result-status-col">
                      <span className={`status-indicator-dot dot-${verificationResult.volume.status.toLowerCase()}`}></span>
                      <span className={`text-${verificationResult.volume.status.toLowerCase()}`}>{verificationResult.volume.status}</span>
                    </div>
                    <div className="result-details-col">
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Expected Form Value:' : 'TTB Requirement:'}</span> <strong>{verificationResult.volume.expected}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Label Artwork Value:' : 'Detected Artwork Value:'}</span> <strong>{verificationResult.volume.actual}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{verificationResult.volume.message}</p>
                    </div>
                  </div>

                  {/* Producer row */}
                  <div className="result-row">
                    <span className="result-field-name">Producer Name</span>
                    <div className="result-status-col">
                      <span className={`status-indicator-dot dot-${verificationResult.producer.status.toLowerCase()}`}></span>
                      <span className={`text-${verificationResult.producer.status.toLowerCase()}`}>{verificationResult.producer.status}</span>
                    </div>
                    <div className="result-details-col">
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Expected Form Value:' : 'TTB Requirement:'}</span> <strong>{verificationResult.producer.expected}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Label Artwork Value:' : 'Detected Artwork Value:'}</span> <strong>{verificationResult.producer.actual}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{verificationResult.producer.message}</p>
                    </div>
                  </div>

                  {/* Country of origin row */}
                  <div className="result-row">
                    <span className="result-field-name">Country of Origin</span>
                    <div className="result-status-col">
                      <span className={`status-indicator-dot dot-${verificationResult.countryOfOrigin.status.toLowerCase()}`}></span>
                      <span className={`text-${verificationResult.countryOfOrigin.status.toLowerCase()}`}>{verificationResult.countryOfOrigin.status}</span>
                    </div>
                    <div className="result-details-col">
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Expected Form Value:' : 'TTB Requirement:'}</span> <strong>{verificationResult.countryOfOrigin.expected}</strong>
                      <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{isAnyFieldFilled ? 'Label Artwork Value:' : 'Detected Artwork Value:'}</span> <strong>{verificationResult.countryOfOrigin.actual}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{verificationResult.countryOfOrigin.message}</p>
                    </div>
                  </div>

                  {/* Government Health Warning statement verification */}
                  <div className="result-row">
                    <span className="result-field-name">Government Warning</span>
                    <div className="result-status-col">
                      <span className={`status-indicator-dot dot-${verificationResult.warningStatement.status.toLowerCase()}`}></span>
                      <span className={`text-${verificationResult.warningStatement.status.toLowerCase()}`}>{verificationResult.warningStatement.status}</span>
                    </div>
                    <div className="result-details-col">
                      <span style={{ color: 'var(--text-secondary)' }}>Header conformity:</span> <strong>{verificationResult.warningStatement.errors.some(e => e.includes('header')) ? 'Header Casing Error' : 'Header Correct'}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>{verificationResult.warningStatement.message}</p>
                    </div>
                  </div>

                  {/* Additional TTB compliance rules */}
                  {verificationResult.additionalChecks && verificationResult.additionalChecks.map((chk, idx) => (
                    <div key={idx} className="result-row">
                      <span className="result-field-name">{chk.name}</span>
                      <div className="result-status-col">
                        <span className={`status-indicator-dot dot-${chk.status === 'PASS' ? 'match' : chk.status === 'WARNING' ? 'partial' : 'missing'}`}></span>
                        <span className={`text-${chk.status === 'PASS' ? 'match' : chk.status === 'WARNING' ? 'partial' : 'missing'}`}>{chk.status}</span>
                      </div>
                      <div className="result-details-col">
                        <p style={{ fontSize: '0.90rem', fontWeight: '500' }}>{chk.message}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Component failure recording action for live/single scans */}
                {!verificationResult.overallPassed && (
                  <div style={{ marginTop: '1.25rem', padding: '1rem 1.25rem', background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <div style={{ color: 'var(--color-error)', fontSize: '0.95rem', fontWeight: 700 }}>
                        ⚠️ Failure Detected ({verificationResult.complianceScore}% Compliance Score)
                      </div>
                      <p style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: '2px' }}>
                        Scans do not auto-save to history unless manually logged. Click button to record component failure into the audit report dashboard.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        accumulateVerificationReport(verificationResult);
                      }}
                      style={{ fontSize: '0.85rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <span>+ Record Failure to Dashboard</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* BATCH VERIFICATION DASHBOARD COMPONENT */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-gold)' }}>Batch & Intake Verification Summary</h4>
                  <p className="opacity-50" style={{ fontSize: '0.8rem' }}>
                    Audit log records for current product intake. Resets when product info is edited or new intake is uploaded.
                  </p>
                </div>
                {batchList.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setBatchList([]);
                      setBatchStats({ approved: 0, rejected: 0, flagged: 0 });
                      setBatchSize(0);
                      setBatchProcessed(0);
                      setBatchLog([]);
                    }}
                    disabled={isProcessingBatch}
                    style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                  >
                    Clear Intake Log
                  </button>
                )}
              </div>

              {/* Dashboard Stats Grid */}
              <div className="batch-stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="batch-stat-card">
                  <span className="form-label">Total Ingested</span>
                  <div className="batch-stat-num" style={{ color: '#fff' }}>{batchSize}</div>
                </div>
                <div className="batch-stat-card">
                  <span className="form-label">Compliant (Passed)</span>
                  <div className="batch-stat-num" style={{ color: 'var(--color-success)' }}>{batchStats.approved}</div>
                </div>
                <div className="batch-stat-card">
                  <span className="form-label">Flagged (Soft Warning)</span>
                  <div className="batch-stat-num" style={{ color: 'var(--color-warning)' }}>{batchStats.flagged}</div>
                </div>
                <div className="batch-stat-card">
                  <span className="form-label">Non-Compliant (Failed)</span>
                  <div className="batch-stat-num" style={{ color: 'var(--color-error)' }}>{batchStats.rejected}</div>
                </div>
              </div>

              {/* Progress bar */}
              {isProcessingBatch && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div className="batch-progress-bar-container">
                    <div className="batch-progress-bar-fill" style={{ width: `${(batchProcessed / batchSize) * 100}%` }}></div>
                    <span className="batch-progress-text">
                      PROCESSED: {batchProcessed} / {batchSize} ({Math.round((batchProcessed / batchSize) * 100)}%)
                    </span>
                  </div>
                </div>
              )}

              {/* Live Pipeline log terminal & Table */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.5fr', gap: '1.25rem' }}>

                {/* Terminal Logs */}
                <div className="batch-log-panel">
                  <div className="batch-log-header">Pipeline System Logs</div>
                  <div className="batch-log-list">
                    {batchLog.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '4rem' }}>
                        Console ready. Initiate intake or batch run to display live logs.
                      </div>
                    ) : (
                      batchLog.map((log, idx) => (
                        <div key={idx} className="batch-log-item">
                          <span className="batch-log-time">[{log.time}]</span>
                          <span className="batch-log-msg">{log.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Verified results list */}
                <div className="batch-log-panel" style={{ height: 'auto', maxHeight: '550px' }}>
                  <div className="batch-log-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Verified Applications Report</span>
                    {batchList.length > 0 && (
                      <button type="button" className="btn-link" style={{ fontSize: '0.75rem' }} onClick={handleExportCSV}>
                        <Download size={12} /> Export CSV
                      </button>
                    )}
                  </div>

                  {batchList.length > 0 && (
                    <>
                      {/* Non-Compliant Alert Box listing all non-compliant IDs */}
                      {batchList.filter(item => item.result !== 'Approved (Auto)').length > 0 && (
                        <div className="batch-noncompliant-alert">
                          <strong>⚠️ Non-Compliant Uploads Flagged:</strong>
                          <p style={{ marginTop: '0.25rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                            {batchList.filter(item => item.result !== 'Approved (Auto)').map(item => `#${item.id}`).join(', ')}
                          </p>
                        </div>
                      )}

                      {/* Filter bar */}
                      <div className="batch-filter-bar">
                        <button type="button" className={`batch-filter-btn ${batchFilter === 'all' ? 'active' : ''}`} onClick={() => setBatchFilter('all')}>
                          All Uploads ({batchList.length})
                        </button>
                        <button type="button" className={`batch-filter-btn ${batchFilter === 'non-compliant' ? 'active' : ''}`} onClick={() => setBatchFilter('non-compliant')} style={{ color: 'var(--color-error)' }}>
                          Non-Compliant ({batchList.filter(item => item.result !== 'Approved (Auto)').length})
                        </button>
                        <button type="button" className={`batch-filter-btn ${batchFilter === 'compliant' ? 'active' : ''}`} onClick={() => setBatchFilter('compliant')} style={{ color: 'var(--color-success)' }}>
                          Compliant ({batchList.filter(item => item.result === 'Approved (Auto)').length})
                        </button>
                      </div>
                    </>
                  )}

                  <div className="batch-log-list" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}>
                    {batchList.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '4rem' }}>
                        Report waiting. Intake results will populate here.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {batchList.filter(item => {
                          if (batchFilter === 'compliant') return item.result === 'Approved (Auto)';
                          if (batchFilter === 'non-compliant') return item.result !== 'Approved (Auto)';
                          return true;
                        }).map((item, idx) => (
                          <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '0.5rem 0.75rem', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>#{item.id}</span>
                              <strong style={{ marginLeft: '10px' }}>{item.brand}</strong>
                              {item.reasonCodes.length > 0 && (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '2px' }}>
                                  Codes: {item.reasonCodes.join(', ')}
                                </div>
                              )}
                              {item.errors.length > 0 && (
                                <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '2px' }}>
                                  ⚠️ {item.errors.join(', ')}
                                </div>
                              )}
                            </div>
                            <div>
                              <span className={`badge badge-${item.result.toLowerCase().includes('approved') ? 'approved' : item.result.toLowerCase().includes('flagged') ? 'revision' : 'rejected'}`}>
                                {item.result}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
