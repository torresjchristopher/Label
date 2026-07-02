import type { ColaApplication, VerificationResult, FieldVerification, WarningVerification } from '../types';

// Helper to normalize strings for comparison (removes punctuation, excess spacing, lowercases)
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes numerical field strings from OCR to correct common character swaps.
 * E.g., replaces letter 'O' with '0', 'l'/'I' with '1', 'S' with '5' in numerical contexts.
 */
export function normalizeOcrNumbers(str: string): string {
  return str
    .replace(/(\d)\s*[oO](?=\d|\s|%)/g, '$10')
    .replace(/(?<=\s|^)[oO](?=\.\d)/g, '0')
    .replace(/(?<=\d)l(?=\d|\%|\s)/gi, '1')
    .replace(/(?<=\d)I(?=\d|\%|\s)/gi, '1');
}

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

// Helper to build a regex that allows optional punctuation/spacing between words
function getBrandRegex(brand: string): RegExp {
  const words = brand.split(/[\s'’\-]+/).filter(w => w.length > 0);
  const pattern = words.map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join("[\\s'’\\-]*");
  return new RegExp(pattern, 'i');
}

export function verifyLabelText(app: ColaApplication, ocrText: string, startTime: number): VerificationResult {
  const normOcrLower = normalizeOcrNumbers(ocrText.toLowerCase());
  const isStandaloneMonitoring = !app.brandName.trim() && !app.classType.trim() && !app.abv.trim();
  
  // 1. BRAND NAME VERIFICATION
  let brandStatus: FieldVerification['status'] = 'MISMATCH';
  let brandMsg = 'Brand name header not found on label.';
  let brandVerification: FieldVerification;
  
  const expectedBrand = app.brandName;
  if (isStandaloneMonitoring) {
    const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 2 && !l.toLowerCase().includes('warning') && !l.toLowerCase().includes('alc'));
    const detectedBrand = lines[0] || '';
    if (detectedBrand) {
      brandStatus = 'MATCH';
      brandMsg = `Standalone Scan: Detected brand title "${detectedBrand}" on label artwork.`;
    } else {
      brandStatus = 'MISMATCH';
      brandMsg = 'Standalone Scan: Mandatory brand title header missing from label.';
    }
    brandVerification = {
      status: brandStatus,
      expected: 'Mandatory Brand Title Header',
      actual: detectedBrand || 'Not detected',
      message: brandMsg
    };
  } else {
    const brandRegex = getBrandRegex(expectedBrand);
    const brandMatch = ocrText.match(brandRegex);
    
    if (brandMatch) {
      const actualText = brandMatch[0];
      if (actualText === expectedBrand) {
        brandStatus = 'MATCH';
        brandMsg = 'Brand name matches application exactly.';
      } else if (actualText.toLowerCase() === expectedBrand.toLowerCase()) {
        brandStatus = 'MATCH';
        brandMsg = 'Brand name matches (acceptable TTB casing discrepancy).';
      } else {
        brandStatus = 'MATCH';
        brandMsg = 'Brand name matches (normalized casing and punctuation discrepancy).';
      }
      brandVerification = {
        status: brandStatus,
        expected: expectedBrand,
        actual: actualText,
        message: brandMsg
      };
    } else if (fuzzyContains(ocrText, expectedBrand)) {
      brandStatus = 'PARTIAL';
      brandMsg = 'Brand name matches fuzzily. Please confirm visually.';
      brandVerification = {
        status: brandStatus,
        expected: expectedBrand,
        actual: 'Detected fuzzily',
        message: brandMsg
      };
    } else {
      brandStatus = 'MISMATCH';
      brandMsg = 'Brand name not found on the label.';
      brandVerification = {
        status: brandStatus,
        expected: expectedBrand,
        actual: 'Not detected',
        message: brandMsg
      };
    }
  }

  // 2. CLASS/TYPE VERIFICATION
  let classStatus: FieldVerification['status'] = 'MISMATCH';
  let classMsg = 'Class/Type designation not found on label.';
  let detectedClass = 'Not detected';
  
  const expectedClass = app.classType;
  if (isStandaloneMonitoring) {
    const classTerms = ['whiskey', 'bourbon', 'whisky', 'beer', 'ale', 'ipa', 'wine', 'vodka', 'rum', 'tequila', 'gin', 'brandy', 'spirits', 'stout', 'lager'];
    const foundTerm = classTerms.find(term => normOcrLower.includes(term));
    if (foundTerm) {
      classStatus = 'MATCH';
      detectedClass = foundTerm.toUpperCase();
      classMsg = `Standalone Scan: Mandatory class/type designation detected ("${detectedClass}").`;
    } else {
      classStatus = 'MISMATCH';
      classMsg = 'Standalone Scan: Mandatory beverage class/type designation missing from label.';
    }
  } else {
    const ocrHasClassExact = ocrText.includes(expectedClass);
    const ocrHasClassLower = normOcrLower.includes(expectedClass.toLowerCase());
    
    if (ocrHasClassExact) {
      classStatus = 'MATCH';
      classMsg = 'Class/Type matches exactly.';
      detectedClass = expectedClass;
    } else if (ocrHasClassLower) {
      classStatus = 'PARTIAL';
      classMsg = 'Class/Type matches, but casing differs.';
      detectedClass = expectedClass;
    } else if (fuzzyContains(ocrText, expectedClass)) {
      classStatus = 'PARTIAL';
      classMsg = 'Class/Type matches fuzzily (e.g. contains key terms).';
      detectedClass = 'Fuzzy match';
    }
  }
  
  const classVerification: FieldVerification = {
    status: classStatus,
    expected: expectedClass || 'Mandatory Beverage Class/Type',
    actual: detectedClass,
    message: classMsg
  };

  // 3. ABV (ALCOHOL BY VOLUME) VERIFICATION
  let abvStatus: FieldVerification['status'] = 'MISMATCH';
  let abvMsg = 'ABV statement not found or incorrect.';
  let detectedAbv = 'Not detected';
  
  const expectedAbvVal = app.abv.match(/\d+(?:\.\d+)?/)?.[0] || '';
  const abvRegex = /(\d+(?:\.\d+)?)\s*%\s*(?:alc|vol|abv|by\s*vol)?/i;
  const abvMatch = normOcrLower.match(abvRegex);
  
  if (abvMatch) {
    detectedAbv = abvMatch[0].toUpperCase();
    const actualAbvVal = abvMatch[1];
    
    if (isStandaloneMonitoring) {
      abvStatus = 'MATCH';
      abvMsg = `Standalone Scan: Mandatory ABV statement detected ("${detectedAbv}").`;
    } else if (actualAbvVal === expectedAbvVal) {
      abvStatus = 'MATCH';
      abvMsg = 'Alcohol content matches exactly.';
    } else {
      abvStatus = 'MISMATCH';
      abvMsg = `ABV mismatch. Application states ${app.abv}, but label shows ${detectedAbv}.`;
    }
  } else if (isStandaloneMonitoring) {
    abvStatus = 'MISMATCH';
    abvMsg = 'Standalone Scan: Mandatory ABV % statement missing from label.';
  }
  
  const abvVerification: FieldVerification = {
    status: abvStatus,
    expected: app.abv || 'Mandatory ABV % Statement',
    actual: detectedAbv,
    message: abvMsg
  };

  // 4. NET CONTENTS VERIFICATION
  let volStatus: FieldVerification['status'] = 'MISMATCH';
  let volMsg = 'Net contents statement not found or incorrect.';
  let detectedVol = 'Not detected';
  
  const expectedVolClean = normalize(app.volume);
  const volumeRegex = /(\d+(?:\.\d+)?)\s*(ml|l|liters|fl\s*oz|fl\s*\.\s*oz|fluid\s*ounces)/i;
  const volMatch = normOcrLower.match(volumeRegex);
  
  if (volMatch) {
    detectedVol = volMatch[0].toUpperCase();
    const actualVolClean = normalize(detectedVol);
    
    if (isStandaloneMonitoring) {
      volStatus = 'MATCH';
      volMsg = `Standalone Scan: Mandatory net contents statement detected ("${detectedVol}").`;
    } else if (actualVolClean.replace(/\s+/g, '') === expectedVolClean.replace(/\s+/g, '')) {
      volStatus = 'MATCH';
      volMsg = 'Net contents match exactly.';
    } else if (actualVolClean.includes(expectedVolClean) || expectedVolClean.includes(actualVolClean)) {
      volStatus = 'PARTIAL';
      volMsg = 'Net contents matches fuzzily (e.g., spacing/abbreviation difference).';
    } else {
      volStatus = 'MISMATCH';
      volMsg = `Volume mismatch. Application states ${app.volume}, but label shows ${detectedVol}.`;
    }
  } else if (isStandaloneMonitoring) {
    volStatus = 'MISMATCH';
    volMsg = 'Standalone Scan: Mandatory net contents statement missing from label.';
  }
  
  const volumeVerification: FieldVerification = {
    status: volStatus,
    expected: app.volume || 'Mandatory Net Contents Statement',
    actual: detectedVol,
    message: volMsg
  };

  // 5. PRODUCER VERIFICATION
  let producerStatus: FieldVerification['status'] = 'MISMATCH';
  let producerMsg = 'Producer details not found on label.';
  let detectedProducer = 'Not detected';
  
  if (isStandaloneMonitoring) {
    const producerRegex = /(bottled|distilled|brewed|produced|packed|imported)\s+by\s+([^,\n]+)/i;
    const prodMatch = normOcrLower.match(producerRegex);
    if (prodMatch) {
      producerStatus = 'MATCH';
      detectedProducer = prodMatch[0];
      producerMsg = `Standalone Scan: Producer/bottler statement detected ("${detectedProducer}").`;
    } else {
      const generalKeywords = ['distillery', 'brewing', 'winery', 'cellars', 'spirits', 'co.', 'ltd'];
      const foundKeyword = generalKeywords.find(k => normOcrLower.includes(k));
      if (foundKeyword) {
        producerStatus = 'MATCH';
        detectedProducer = `Company keyword "${foundKeyword}" detected`;
        producerMsg = 'Standalone Scan: Producer company declaration found on label.';
      } else {
        producerStatus = 'MISMATCH';
        producerMsg = 'Standalone Scan: Mandatory producer/bottler statement missing from label.';
      }
    }
  } else if (fuzzyContains(ocrText, app.producer)) {
    producerStatus = 'MATCH';
    detectedProducer = app.producer;
    producerMsg = 'Producer matches application form.';
  } else {
    const shortName = app.producer.split(',')[0];
    if (fuzzyContains(ocrText, shortName)) {
      producerStatus = 'PARTIAL';
      detectedProducer = shortName;
      producerMsg = 'Producer name matched, but address details may differ or be missing.';
    }
  }
  
  const producerVerification: FieldVerification = {
    status: producerStatus,
    expected: app.producer || 'Mandatory Producer/Bottler',
    actual: detectedProducer,
    message: producerMsg
  };

  // 6. COUNTRY OF ORIGIN VERIFICATION (For Imports)
  let originStatus: FieldVerification['status'] = 'MATCH';
  let originMsg = 'Country of origin verified or domestic product.';
  let detectedOrigin = 'Domestic / US Standard';
  
  if (isStandaloneMonitoring) {
    const originRegex = /(product\s+of|imported\s+from|made\s+in|produced\s+in)\s+([a-z\s]+)/i;
    const originMatch = normOcrLower.match(originRegex);
    if (originMatch) {
      detectedOrigin = originMatch[0].toUpperCase();
      originStatus = 'MATCH';
      originMsg = `Standalone Scan: Origin statement detected ("${detectedOrigin}").`;
    } else {
      originStatus = 'MATCH';
      originMsg = 'Standalone Scan: Domestic product standard (no import declaration required).';
    }
  } else if (app.countryOfOrigin.toLowerCase() !== 'united states' && app.countryOfOrigin.toLowerCase() !== 'usa') {
    originStatus = 'MISMATCH';
    originMsg = `Import origin missing or mismatch. Application states ${app.countryOfOrigin}.`;
    
    if (fuzzyContains(ocrText, app.countryOfOrigin)) {
      originStatus = 'MATCH';
      detectedOrigin = app.countryOfOrigin;
      originMsg = 'Country of origin matches application form.';
    }
  }
  
  const originVerification: FieldVerification = {
    status: originStatus,
    expected: app.countryOfOrigin || 'Origin / Domestic Standard',
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

  // 7.8 COMPLIANCE SCORE COMPUTATION
  let score = 100;
  
  if (brandVerification.status === 'MISMATCH') score -= 20;
  else if (brandVerification.status === 'PARTIAL') score -= 5;
  
  if (classVerification.status === 'MISMATCH') score -= 15;
  else if (classVerification.status === 'PARTIAL') score -= 5;
  
  if (abvVerification.status === 'MISMATCH') score -= 20;
  
  if (volumeVerification.status === 'MISMATCH') score -= 15;
  else if (volumeVerification.status === 'PARTIAL') score -= 5;
  
  if (producerVerification.status === 'MISMATCH') score -= 10;
  else if (producerVerification.status === 'PARTIAL') score -= 3;
  
  if (originVerification.status === 'MISMATCH') score -= 10;
  
  if (warningVerification.status === 'MISMATCH') score -= 20;
  else if (warningVerification.status === 'PARTIAL') score -= 5;
  
  additionalChecks.forEach(chk => {
    if (chk.status === 'WARNING') score -= 3;
  });
  
  const complianceScore = Math.max(0, score);

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
    additionalChecks,
    complianceScore
  };
}
