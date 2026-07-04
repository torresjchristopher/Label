export interface UploadFileData {
  file: File;
  dataUrl: string;
}

export const readFileAsDataUrl = async (file: File): Promise<string> => {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error(`Unable to read file ${file.name}`));
      };
      reader.onerror = () => reject(new Error(`Unable to read file ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
  const base64 = btoa(binary);
  const mimeType = file.type || 'application/octet-stream';
  return `data:${mimeType};base64,${base64}`;
};

export const readFilesAsDataUrls = async (files: FileList | File[]): Promise<UploadFileData[]> => {
  const uploadFiles = Array.from(files ?? []);
  return Promise.all(
    uploadFiles.map(async (file) => ({
      file,
      dataUrl: await readFileAsDataUrl(file),
    }))
  );
};

export const formatUploadLabelName = (fileName: string, fallback = 'Uploaded label') => {
  const nameWithoutExtension = fileName.replace(/\.[^.]+$/, '');
  const normalizedName = nameWithoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizedName || fallback;
};
