import { describe, expect, it } from 'vitest';
import { getPresetOcrText } from '../../utils/presetOcr';

describe('preset OCR selection', () => {
  it('uses built-in OCR text for known demo label filenames', () => {
    const oldTomText = getPresetOcrText(null, 'old_tom_bourbon_label.jpg');
    const stonesThrowText = getPresetOcrText(null, 'stones_throw_beer_label.jpg');

    expect(oldTomText).toContain('OLD TOM DISTILLERY');
    expect(stonesThrowText).toContain("STONE'S THROW BREWING");
  });

  it('matches known label aliases when the uploaded file name is human-readable', () => {
    const text = getPresetOcrText(null, 'My Old Tom Bourbon Label.png');

    expect(text).toContain('OLD TOM DISTILLERY');
  });

  it('returns null for unknown labels', () => {
    expect(getPresetOcrText(null, 'custom-label.png')).toBeNull();
  });
});
