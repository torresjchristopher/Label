const PRESET_OCR_TEXTS: Record<string, string> = {
  'old_tom_bourbon_label.jpg': `
    OLD TOM DISTILLERY
    Kentucky Straight Bourbon Whiskey
    45% Alc./Vol. (90 Proof)
    750 mL
    Bottled by Old Tom Distillery Co, Frankfort, KY
    Product of USA
    GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
  `,
  'stones_throw_beer_label.jpg': `
    STONE'S THROW BREWING
    India Pale Ale (IPA)
    6.8% Alc./Vol.
    12 FL. OZ.
    Brewed and bottled by Stone's Throw Brewing Co, Seattle, WA
    Product of USA
    Government Warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery.
  `,
  'chateau_bordeaux_label.jpg': `
    CHATEAU BORDEAUX
    Appellation Bordeaux Contrôlée
    2021 Red Wine
    14.2% ALC. BY VOL.
    750 ML
    Bottled by Chateau Bordeaux SA, Bordeaux, France
    Product of France
    GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
  `,
};

const PRESET_KEYS = {
  oldTom: 'old_tom_bourbon_label.jpg',
  stonesThrow: 'stones_throw_beer_label.jpg',
  chateauBordeaux: 'chateau_bordeaux_label.jpg',
} as const;

const normalizePresetCandidate = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function getPresetOcrText(imageSrc: string | null, sourceLabel?: string | null): string | null {
  const candidates = [sourceLabel, imageSrc].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = normalizePresetCandidate(candidate);
    if (!normalized) continue;

    if (normalized.includes('old tom') || normalized.includes('oldtom') || normalized.includes('old tom bourbon')) {
      return PRESET_OCR_TEXTS[PRESET_KEYS.oldTom];
    }

    if (
      normalized.includes("stone's throw") ||
      normalized.includes('stones throw') ||
      normalized.includes('stones_throw')
    ) {
      return PRESET_OCR_TEXTS[PRESET_KEYS.stonesThrow];
    }

    if (
      normalized.includes('chateau bordeaux') ||
      normalized.includes('chateau_bordeaux') ||
      normalized.includes('bordeaux')
    ) {
      return PRESET_OCR_TEXTS[PRESET_KEYS.chateauBordeaux];
    }

    if (candidate.includes('old_tom_bourbon_label') || candidate.includes('stones_throw_beer_label') || candidate.includes('chateau_bordeaux_label')) {
      return PRESET_OCR_TEXTS[
        candidate.includes('old_tom_bourbon_label')
          ? PRESET_KEYS.oldTom
          : candidate.includes('stones_throw_beer_label')
            ? PRESET_KEYS.stonesThrow
            : PRESET_KEYS.chateauBordeaux
      ];
    }
  }

  return null;
}

export function getPresetOcrTextByCandidate(candidate: string | null | undefined): string | null {
  return getPresetOcrText(null, candidate);
}
