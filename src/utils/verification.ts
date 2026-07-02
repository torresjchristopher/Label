import type { ColaApplication, VerificationResult, FieldVerification, WarningVerification } from '../types';

// Helper to normalize strings for comparison (removes punctuation, excess spacing, lowercases)
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to calculate similarity score (removed unused function)

// Helper to check if a string contains another (fuzzy substring)
function fuzzyContains(haystack: string, needle: string): boolean {
  const normHaystack = normalize(haystack);
  const normNeedle = normalize(needle);
  
  if (normHaystack.includes(normNeedle)) return true;
  
  // If not exact substring, check if at least 75% of the needle's words are in the haystack
  const needleWords = normNeedle.split(' ').filter(w => w.length > 2);
  if (needleWords.length === 0) return false;
  
  let matches = 0;
  for (const word of needleWords) {
    if (normHaystack.includes(word)) {
      matches++;
    }
  }
  return matches / needleWords.length >= 0.75;
}

export function verifyLabelText(app: ColaApplication, ocrText: string, startTime: number): VerificationResult {
  const normOcrLower = ocrText.toLowerCase();
  
  // 1. BRAND NAME VERIFICATION
  let brandStatus: FieldVerification['status'] = 'MISMATCH';
  let brandMsg = 'Brand name not found on the label.';
  
  const expectedBrand = app.brandName;
  const ocrHasBrandExact = ocrText.includes(expectedBrand);
  const ocrHasBrandLower = normOcrLower.includes(expectedBrand.toLowerCase());
  
  if (ocrHasBrandExact) {
    brandStatus = 'MATCH';
    brandMsg = 'Brand name matches exactly.';
  } else if (ocrHasBrandLower) {
    brandStatus = 'PARTIAL';
    brandMsg = 'Brand name matches, but casing differs (acceptable TTB discrepancy).';
  } else if (fuzzyContains(ocrText, expectedBrand)) {
    brandStatus = 'PARTIAL';
    brandMsg = 'Brand name matches fuzzily. Please confirm visually.';
  }
  
  const brandVerification: FieldVerification = {
    status: brandStatus,
    expected: expectedBrand,
    actual: ocrText.match(new RegExp(expectedBrand.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'))?.[0] || 'Not detected',
    message: brandMsg
  };

  // 2. CLASS/TYPE VERIFICATION
  let classStatus: FieldVerification['status'] = 'MISMATCH';
  let classMsg = 'Class/Type designation not found on label.';
  
  const expectedClass = app.classType;
  const ocrHasClassExact = ocrText.includes(expectedClass);
  const ocrHasClassLower = normOcrLower.includes(expectedClass.toLowerCase());
  
  if (ocrHasClassExact) {
    classStatus = 'MATCH';
    classMsg = 'Class/Type matches exactly.';
  } else if (ocrHasClassLower) {
    classStatus = 'PARTIAL';
    classMsg = 'Class/Type matches, but casing differs.';
  } else if (fuzzyContains(ocrText, expectedClass)) {
    classStatus = 'PARTIAL';
    classMsg = 'Class/Type matches fuzzily (e.g. contains key terms).';
  }
  
  const classVerification: FieldVerification = {
    status: classStatus,
    expected: expectedClass,
    actual: ocrText.match(new RegExp(expectedClass.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'))?.[0] || 'Not detected',
    message: classMsg
  };

  // 3. ABV (ALCOHOL BY VOLUME) VERIFICATION
  let abvStatus: FieldVerification['status'] = 'MISMATCH';
  let abvMsg = 'ABV statement not found or incorrect.';
  let detectedAbv = 'Not detected';
  
  // Normalize ABV representation, e.g. "45%" or "13.5%"
  const expectedAbvVal = app.abv.match(/\d+(?:\.\d+)?/)?.[0] || '';
  
  // Search for ABV in OCR text: e.g. "45% alc", "13.5% alc", "45% alc./vol", "45% vol"
  const abvRegex = /(\d+(?:\.\d+)?)\s*%\s*(?:alc|vol|abv|by\s*vol)?/i;
  const abvMatch = normOcrLower.match(abvRegex);
  
  if (abvMatch) {
    detectedAbv = abvMatch[0].toUpperCase();
    const actualAbvVal = abvMatch[1];
    
    if (actualAbvVal === expectedAbvVal) {
      abvStatus = 'MATCH';
      abvMsg = 'Alcohol content matches exactly.';
    } else {
      // Check if it is within tolerances (e.g. for wine, TTB allows some variation, but we flag it)
      abvStatus = 'MISMATCH';
      abvMsg = `ABV mismatch. Application states ${app.abv}, but label shows ${detectedAbv}.`;
    }
  }
  
  const abvVerification: FieldVerification = {
    status: abvStatus,
    expected: app.abv,
    actual: detectedAbv,
    message: abvMsg
  };

  // 4. NET CONTENTS VERIFICATION
  let volStatus: FieldVerification['status'] = 'MISMATCH';
  let volMsg = 'Net contents statement not found or incorrect.';
  let detectedVol = 'Not detected';
  
  // Extract number and unit: e.g. "750 ml", "12 fl. oz.", "1.5 Liters"
  const expectedVolClean = normalize(app.volume); // "750 ml" or "12 fl oz"
  
  // Standard volume patterns in alcohol labels
  const volumeRegex = /(\d+(?:\.\d+)?)\s*(ml|l|liters|fl\s*oz|fl\s*\.\s*oz|fluid\s*ounces)/i;
  const volMatch = normOcrLower.match(volumeRegex);
  
  if (volMatch) {
    detectedVol = volMatch[0];
    const actualVolClean = normalize(detectedVol);
    
    if (actualVolClean.replace(/\s+/g, '') === expectedVolClean.replace(/\s+/g, '')) {
      volStatus = 'MATCH';
      volMsg = 'Net contents match exactly.';
    } else if (actualVolClean.includes(expectedVolClean) || expectedVolClean.includes(actualVolClean)) {
      volStatus = 'PARTIAL';
      volMsg = 'Net contents matches fuzzily (e.g., spacing/abbreviation difference).';
    } else {
      volStatus = 'MISMATCH';
      volMsg = `Volume mismatch. Application states ${app.volume}, but label shows ${detectedVol}.`;
    }
  }
  
  const volumeVerification: FieldVerification = {
    status: volStatus,
    expected: app.volume,
    actual: detectedVol,
    message: volMsg
  };

  // 5. PRODUCER VERIFICATION
  let producerStatus: FieldVerification['status'] = 'MISMATCH';
  let producerMsg = 'Producer details not found on label.';
  
  if (fuzzyContains(ocrText, app.producer)) {
    producerStatus = 'MATCH';
    producerMsg = 'Producer matches application form.';
  } else {
    // Check if producer name (first 10 chars) appears
    const shortName = app.producer.split(',')[0];
    if (fuzzyContains(ocrText, shortName)) {
      producerStatus = 'PARTIAL';
      producerMsg = 'Producer name matched, but address details may differ or be missing.';
    }
  }
  
  const producerVerification: FieldVerification = {
    status: producerStatus,
    expected: app.producer,
    actual: ocrText.match(new RegExp(app.producer.split(',')[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'))?.[0] || 'Not detected',
    message: producerMsg
  };

  // 6. COUNTRY OF ORIGIN VERIFICATION (For Imports)
  let originStatus: FieldVerification['status'] = 'MATCH'; // Default MATCH if US domestic
  let originMsg = 'Country of origin verified or domestic product.';
  let detectedOrigin = 'Not applicable (Domestic)';
  
  if (app.countryOfOrigin.toLowerCase() !== 'united states' && app.countryOfOrigin.toLowerCase() !== 'usa') {
    originStatus = 'MISMATCH';
    originMsg = `Imported product. Label must declare country of origin: "${app.countryOfOrigin}"`;
    detectedOrigin = 'Not detected';
    
    if (fuzzyContains(ocrText, app.countryOfOrigin) || normOcrLower.includes(`product of ${app.countryOfOrigin.toLowerCase()}`)) {
      originStatus = 'MATCH';
      originMsg = `Origin country "${app.countryOfOrigin}" found on label.`;
      detectedOrigin = app.countryOfOrigin;
    }
  }
  
  const originVerification: FieldVerification = {
    status: originStatus,
    expected: app.countryOfOrigin,
    actual: detectedOrigin,
    message: originMsg
  };

  // 7. GOVERNMENT WARNING VERIFICATION
  const warningErrors: string[] = [];
  let warningStatus: WarningVerification['status'] = 'MISMATCH';
  let warningMsg = 'Government Warning statement is missing or contains critical errors.';
  
  // We search for standard phrases: "surgeon general", "women should not", "risk of birth defects", "impairs your ability"
  const warningKeywords = ['surgeon general', 'pregnancy', 'birth defects', 'impairs your ability', 'drive a car'];
  let keywordMatches = 0;
  for (const kw of warningKeywords) {
    if (normOcrLower.includes(kw)) {
      keywordMatches++;
    }
  }
  
  // Find where the warning statement actually begins
  const warningStartRegex = /government\s+warning/i;
  const startMatch = ocrText.match(warningStartRegex);
  
  let actualWarningText = '';
  
  if (startMatch && startMatch.index !== undefined) {
    // Extract everything from "Government Warning" onwards, up to a reasonable length (e.g. 500 chars)
    actualWarningText = ocrText.substring(startMatch.index, startMatch.index + 400).trim();
    // Clean trailing newlines or junk characters
    actualWarningText = actualWarningText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  }
  
  let diffWords: WarningVerification['diffWords'] = [];
  
  if (keywordMatches === 0 && actualWarningText === '') {
    warningStatus = 'MISSING';
    warningMsg = 'GOVERNMENT WARNING statement not found on the label.';
    warningErrors.push('Warning statement is completely missing.');
  } else {
    // Check capitalization of header: "GOVERNMENT WARNING:"
    // It must start with EXACTLY "GOVERNMENT WARNING:" in all caps.
    const headerMatch = actualWarningText.match(/^([Gg][Oo][Vv][Ee][Rr][Nn][Mm][Ee][Nn][Tt]\s+[Ww][Aa][Rr][Nn][Ii][Nn][Gg]\s*:?)/);
    if (headerMatch) {
      const headerText = headerMatch[1];
      if (!headerText.startsWith('GOVERNMENT WARNING:')) {
        warningErrors.push('Warning header must be exactly "GOVERNMENT WARNING:" in ALL CAPS and followed by a colon.');
      }
    } else {
      warningErrors.push('Warning header "GOVERNMENT WARNING:" is malformed.');
    }
    
    // Strict word-by-word comparison
    const expectedWords = app.warningStatement.split(/\s+/);
    const actualWords = actualWarningText.split(/\s+/);
    
    // Simple alignment/diff for visualization
    const expectedWordsClean = expectedWords.map(w => w.replace(/[^\w]/g, '').toLowerCase());
    const actualWordsClean = actualWords.map(w => w.replace(/[^\w]/g, '').toLowerCase());
    
    let expIdx = 0;
    let actIdx = 0;
    
    while (expIdx < expectedWords.length || actIdx < actualWords.length) {
      const expW = expectedWords[expIdx];
      const actW = actualWords[actIdx];
      
      if (expIdx < expectedWords.length && actIdx < actualWords.length) {
        const expWClean = expectedWordsClean[expIdx];
        const actWClean = actualWordsClean[actIdx];
        
        if (expWClean === actWClean) {
          // Check if casing differs (except for punctuation)
          // We know GOVERNMENT WARNING must be capitalized
          let casingErr = false;
          if (expW.toUpperCase() === expW && actW.toUpperCase() !== actW) {
            casingErr = true;
          }
          
          diffWords.push({
            word: actW,
            status: casingErr ? 'casing_error' : 'match'
          });
          
          if (casingErr) {
            warningErrors.push(`Casing error: "${actW}" should be capitalized as "${expW}".`);
          }
          
          expIdx++;
          actIdx++;
        } else {
          // Check if it's missing (is the expected word appearing further in actual?)
          const nextActIdx = actualWordsClean.indexOf(expWClean, actIdx);
          if (nextActIdx !== -1 && nextActIdx - actIdx < 4) {
            // Words were added in actual
            for (let i = actIdx; i < nextActIdx; i++) {
              diffWords.push({
                word: actualWords[i],
                status: 'added'
              });
            }
            actIdx = nextActIdx;
          } else {
            // Expected word is missing
            diffWords.push({
              word: expW,
              status: 'missing'
            });
            warningErrors.push(`Missing word: "${expW}" was not found on label.`);
            expIdx++;
          }
        }
      } else if (expIdx < expectedWords.length) {
        // Remaining expected words are missing
        diffWords.push({
          word: expectedWords[expIdx],
          status: 'missing'
        });
        warningErrors.push(`Missing word: "${expectedWords[expIdx]}" was not found.`);
        expIdx++;
      } else {
        // Remaining actual words are extra/added
        diffWords.push({
          word: actualWords[actIdx],
          status: 'added'
        });
        actIdx++;
      }
    }
    
    // Determine status based on errors
    const criticalErrors = warningErrors.filter(err => !err.includes('Casing error') && !err.includes('colon'));
    
    if (warningErrors.length === 0) {
      warningStatus = 'MATCH';
      warningMsg = 'Government Health Warning is present and 100% correct.';
    } else if (criticalErrors.length === 0) {
      warningStatus = 'PARTIAL';
      warningMsg = 'Government Warning is present but has casing or punctuation errors.';
    } else {
      warningStatus = 'MISMATCH';
      warningMsg = 'Government Warning has text mismatches or missing requirements.';
    }
  }
  
  const warningVerification: WarningVerification = {
    status: warningStatus,
    expected: app.warningStatement,
    actual: actualWarningText || 'Not detected',
    message: warningMsg,
    errors: warningErrors,
    diffWords
  };

  // 7.5 ADDITIONAL TTB COMPLIANCE CHECKS
  const additionalChecks: Array<{ name: string; status: 'PASS' | 'WARNING' | 'INFO'; message: string }> = [];
  
  // A. Sulfite Declaration Check (For Wine)
  if (app.classType.toLowerCase().includes('wine')) {
    const hasSulfiteKeywords = normOcrLower.includes('sulfite') || normOcrLower.includes('sulphite');
    if (hasSulfiteKeywords) {
      additionalChecks.push({
        name: 'Sulfite Declaration',
        status: 'PASS',
        message: 'Contains Sulfites declaration detected on the wine label.'
      });
    } else {
      additionalChecks.push({
        name: 'Sulfite Declaration',
        status: 'WARNING',
        message: 'TTB Compliance Notice: Wine labels require a sulfite declaration (e.g., "Contains Sulfites") if sulfur dioxide is 10 ppm or more.'
      });
    }
  }

  // B. Importer Designation Check (For Imports)
  if (app.countryOfOrigin.toLowerCase() !== 'united states' && app.countryOfOrigin.toLowerCase() !== 'usa') {
    const hasImporterKeywords = normOcrLower.includes('imported by') || 
                                normOcrLower.includes('sole agent') || 
                                normOcrLower.includes('importer');
    if (hasImporterKeywords) {
      additionalChecks.push({
        name: 'Importer Prefix Designation',
        status: 'PASS',
        message: 'Importer prefix ("Imported by" or equivalent) detected on label.'
      });
    } else {
      additionalChecks.push({
        name: 'Importer Prefix Designation',
        status: 'WARNING',
        message: 'TTB Compliance Warning: Imported labels must designate the importer with a prefix (e.g., "Imported by" or "Sole Agent").'
      });
    }
  }

  // C. Distilled Spirits State of Distillation (For Whiskies)
  if (app.classType.toLowerCase().includes('whiskey') || app.classType.toLowerCase().includes('whisky')) {
    const hasStateOfDist = normOcrLower.includes('distilled in') || 
                           normOcrLower.includes('product of') ||
                           normOcrLower.includes('kentucky') ||
                           normOcrLower.includes('tennessee');
    if (hasStateOfDist) {
      additionalChecks.push({
        name: 'State of Distillation',
        status: 'PASS',
        message: 'Distillation region or origin statement detected.'
      });
    } else {
      additionalChecks.push({
        name: 'State of Distillation',
        status: 'INFO',
        message: 'TTB Guideline: Straight whiskies must disclose the state of distillation on the label.'
      });
    }
  }

  // 8. OVERALL PASSED DECISION
  const overallPassed = 
    brandVerification.status !== 'MISMATCH' &&
    classVerification.status !== 'MISMATCH' &&
    abvVerification.status === 'MATCH' && // ABV must match exactly
    volumeVerification.status !== 'MISMATCH' &&
    producerVerification.status !== 'MISMATCH' &&
    originVerification.status === 'MATCH' && // Country of origin must match exactly
    warningVerification.status === 'MATCH'; // Warning must be correct

  const processingTimeMs = Date.now() - startTime;

  return {
    brandName: brandVerification,
    classType: classVerification,
    abv: abvVerification,
    volume: volumeVerification,
    warningStatement: warningVerification,
    producer: producerVerification,
    countryOfOrigin: originVerification,
    overallPassed,
    ocrRawText: ocrText,
    processingTimeMs,
    additionalChecks
  };
}
