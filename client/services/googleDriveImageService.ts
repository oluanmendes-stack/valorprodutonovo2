/**
 * Service to find product images from Google Drive
 * Images are organized by product code in a shared Google Drive folder
 */

// Cache for checked image paths
const imageCache = new Map<string, string[]>();
// Cache for folder structure
const folderCache = new Map<string, string[]>();

const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
const parentFolderId = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID;

/**
 * Search for images in a specific folder
 */
async function searchImagesInFolder(folderId: string, code: string): Promise<string[]> {
  const images: string[] = [];
  const codeLower = code.toLowerCase();

  // Search for any images with the product code in filename
  const imageQuery = `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/gif' or mimeType='image/webp') and trashed=false`;

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(imageQuery)}&fields=files(id,name,webViewLink)&orderBy=name&key=${apiKey}`
    );

    if (!response.ok) {
      console.warn(`[GoogleDrive] API error searching folder ${folderId}: ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (data.files && data.files.length > 0) {
      for (const file of data.files) {
        const nameLower = file.name.toLowerCase();
        // Match if filename contains the product code
        if (nameLower.includes(codeLower)) {
          const directLink = `https://drive.google.com/uc?id=${file.id}&export=view`;
          images.push(directLink);
          console.log(`[GoogleDrive] Found image: ${file.name}`);
        }
      }
    }
  } catch (error) {
    console.error(`[GoogleDrive] Error searching folder ${folderId}:`, error);
  }

  return images;
}

/**
 * Get all subfolders in a folder (with caching)
 */
async function getSubfolders(folderId: string): Promise<string[]> {
  if (folderCache.has(folderId)) {
    return folderCache.get(folderId) || [];
  }

  const subfolders: string[] = [];
  const folderQuery = `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&pageSize=100&key=${apiKey}`
    );

    if (!response.ok) {
      console.warn(`[GoogleDrive] API error getting subfolders of ${folderId}: ${response.statusText}`);
      folderCache.set(folderId, []);
      return [];
    }

    const data = await response.json();

    if (data.files && data.files.length > 0) {
      for (const folder of data.files) {
        subfolders.push(folder.id);
      }
    }

    folderCache.set(folderId, subfolders);
  } catch (error) {
    console.error(`[GoogleDrive] Error getting subfolders of ${folderId}:`, error);
    folderCache.set(folderId, []);
  }

  return subfolders;
}

/**
 * Recursively search for images in a folder and all subfolders
 */
async function recursiveSearchImages(folderId: string, code: string, depth: number = 0, maxDepth: number = 5): Promise<string[]> {
  const images: string[] = [];

  if (depth > maxDepth) {
    console.log(`[GoogleDrive] Max search depth reached`);
    return images;
  }

  // Search for images in current folder
  const currentImages = await searchImagesInFolder(folderId, code);
  images.push(...currentImages);

  // Get subfolders and search recursively
  const subfolders = await getSubfolders(folderId);
  for (const subfolderId of subfolders) {
    const subImages = await recursiveSearchImages(subfolderId, code, depth + 1, maxDepth);
    images.push(...subImages);
  }

  return images;
}

/**
 * Find images for a product code from Google Drive
 * Searches recursively through all folders in the root Google Drive folder
 *
 * Requires:
 * - VITE_GOOGLE_DRIVE_API_KEY environment variable
 * - VITE_GOOGLE_DRIVE_FOLDER_ID environment variable (folder containing product folders)
 *
 * @param code - Product code (used to match image filenames)
 * @returns Array of image URLs from Google Drive
 */
export async function findGoogleDriveImages(code: string): Promise<string[]> {
  // Check cache first
  if (imageCache.has(code)) {
    const cached = imageCache.get(code) || [];
    console.log(`[GoogleDrive] Using cached result: ${cached.length} images for ${code}`);
    return cached;
  }

  if (!apiKey || !parentFolderId) {
    console.warn('[GoogleDrive] Missing configuration: VITE_GOOGLE_DRIVE_API_KEY or VITE_GOOGLE_DRIVE_FOLDER_ID');
    return [];
  }

  try {
    console.log(`[GoogleDrive] Searching for images of product code: ${code}`);

    // Do a recursive search through all folders and subfolders
    const images = await recursiveSearchImages(parentFolderId, code);

    // Cache the result
    imageCache.set(code, images);
    console.log(`[GoogleDrive] Total images found: ${images.length}`);

    return images;
  } catch (error) {
    console.error(`[GoogleDrive] Error finding images for ${code}:`, error);
    imageCache.set(code, []);
    return [];
  }
}

/**
 * Clear the image cache
 * Useful when the folder structure changes
 */
export function clearGoogleDriveImageCache(): void {
  imageCache.clear();
  console.log('[GoogleDrive] Image cache cleared');
}
