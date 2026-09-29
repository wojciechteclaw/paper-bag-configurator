export type LoadedImage = { url: string; width: number; height: number };

/**
 * Creates an object URL for `file` and decodes it as an image to read its pixel size.
 * The caller owns the returned URL (it ends up in the store, which revokes it on remove/replace).
 * On failure the URL is revoked here and the promise rejects.
 */
export function loadImageFile(file: File): Promise<LoadedImage> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Cannot decode ${file.name}`));
    };
    image.src = url;
  });
}
