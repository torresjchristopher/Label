import { describe, expect, it } from 'vitest';
import { formatUploadLabelName, readFilesAsDataUrls } from '../../utils/uploads';

describe('upload helpers', () => {
  it('formats uploaded file names into readable label names', () => {
    expect(formatUploadLabelName('sample-label.png')).toBe('sample label');
    expect(formatUploadLabelName('My_File_01.JPG', 'Uploaded label')).toBe('My File 01');
    expect(formatUploadLabelName('   ', 'Fallback Label')).toBe('Fallback Label');
  });

  it('reads files into data URLs', async () => {
    const file = new File(['hello world'], 'demo-label.png', { type: 'image/png' });
    const result = await readFilesAsDataUrls([file]);

    expect(result).toHaveLength(1);
    expect(result[0].file.name).toBe('demo-label.png');
    expect(result[0].dataUrl).toContain('data:image/png;base64');
  });
});
