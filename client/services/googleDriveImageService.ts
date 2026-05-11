/**
 * Service to find product images from Google Drive
 * Images are organized by product code in a shared Google Drive folder
 */

// Cache for checked image paths
const imageCache = new Map<string, string[]>();

/**
 * Find images for a product code from Google Drive
 * Searches in a folder structure: GOOGLE_DRIVE_FOLDER_ID/product_code/
 * 
 * Requires:
 * - VITE_GOOGLE_DRIVE_API_KEY environment variable
 * - VITE_GOOGLE_DRIVE_FOLDER_ID environment variable (folder containing product folders)
 * 
 * @param code - Product code (used as folder name in Google Drive)
 * @returns Array of image URLs from Google Drive
 */
export async function findGoogleDriveImages(code: string): Promise<string[]> {
  // Check cache first
  if (imageCache.has(code)) {
    const cached = imageCache.get(code) || [];
    console.log(`[GoogleDrive] Using cached result: ${cached.length} images for ${code}`);
    return cached;
  }

  const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
  const parentFolderId = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID;

  if (!apiKey || !parentFolderId) {
    console.warn('[GoogleDrive] Missing configuration: VITE_GOOGLE_DRIVE_API_KEY or VITE_GOOGLE_DRIVE_FOLDER_ID');
    return [];
  }

  try {
    console.log(`[GoogleDrive] Searching for images of product code: ${code}`);

    // First, find the folder with the product code name
    const folderQuery = `'${parentFolderId}' in parents and name='${code}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const folderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&key=${apiKey}`
    );

    if (!folderResponse.ok) {
      throw new Error(`Google Drive API error: ${folderResponse.statusText}`);
    }

    const folderData = await folderResponse.json();
    let images: string[] = [];

    if (folderData.files && folderData.files.length > 0) {
      // Found a subfolder with the product code, search for images inside it
      const productFolderId = folderData.files[0].id;
      console.log(`[GoogleDrive] Found product folder: ${productFolderId}`);

      // Search for image files in the product folder
      const imageQuery = `'${productFolderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/gif' or mimeType='image/webp') and trashed=false`;
      const imageResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(imageQuery)}&fields=files(id,name,webViewLink)&orderBy=name&key=${apiKey}`
      );

      if (!imageResponse.ok) {
        throw new Error(`Google Drive API error: ${imageResponse.statusText}`);
      }

      const imageData = await imageResponse.json();

      if (imageData.files && imageData.files.length > 0) {
        // Convert web view links to direct download links
        for (const file of imageData.files) {
          // Extract file ID from the web view link and create a direct export link
          const directLink = `https://drive.google.com/uc?id=${file.id}&export=view`;
          images.push(directLink);
          console.log(`[GoogleDrive] Found image in subfolder: ${file.name}`);
        }
      }
    } else {
      // No subfolder found, try searching for image files directly in parent folder with product code in filename
      console.log(`[GoogleDrive] No subfolder found for "${code}", searching for images with product code in filename...`);
      const imageQuery = `'${parentFolderId}' in parents and name contains '${code}' and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/gif' or mimeType='image/webp') and trashed=false`;
      const imageResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(imageQuery)}&fields=files(id,name,webViewLink)&orderBy=name&key=${apiKey}`
      );

      if (!imageResponse.ok) {
        throw new Error(`Google Drive API error: ${imageResponse.statusText}`);
      }

      const imageData = await imageResponse.json();

      if (imageData.files && imageData.files.length > 0) {
        // Convert web view links to direct download links
        for (const file of imageData.files) {
          const directLink = `https://drive.google.com/uc?id=${file.id}&export=view`;
          images.push(directLink);
          console.log(`[GoogleDrive] Found image in parent folder: ${file.name}`);
        }
      }
    }

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
