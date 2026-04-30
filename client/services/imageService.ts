import { shouldUseSupabaseStorage, getImageStorageUrl } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";

/**
 * Service to find product images from Supabase Storage
 * Images are organized by brand folders in the 'imagens' bucket
 *
 * In production: Uses Supabase Storage
 * In development: Uses local API endpoint
 */

export interface ProductImage {
  path: string;
  filename: string;
}

// Cache for checked image paths to avoid repeated failed requests
const imageCache = new Map<string, string[]>();

/**
 * Find images for a product code
 * Directly searches Supabase Storage with all naming pattern variations
 * No server API dependency - pure client-side
 */
export async function findProductImages(code: string): Promise<string[]> {
  // Check cache first
  if (imageCache.has(code)) {
    const cached = imageCache.get(code) || [];
    console.log(`[findProductImages] Using cached result: ${cached.length} images for ${code}`);
    return cached;
  }

  try {
    console.log(`[findProductImages] Searching for images of product code: ${code}`);
    const images = await generateImageUrls(code);

    // Cache the result
    imageCache.set(code, images);

    if (images.length === 0) {
      console.warn(`[findProductImages] No image URLs generated for product code: ${code}`);
    } else {
      console.log(`[findProductImages] Found ${images.length} images for product code: ${code}`);
      images.forEach((img, idx) => {
        console.debug(`  [${idx + 1}] ${img}`);
      });
    }

    return images;
  } catch (error) {
    console.error(`[findProductImages] Error finding images for ${code}:`, error);
    imageCache.set(code, []);
    return [];
  }
}

/**
 * Generate all possible image URLs for a product code
 * Searches recursively through the imagens bucket
 * Looks for files containing the complete product code (case-insensitive)
 */
async function generateImageUrls(code: string): Promise<string[]> {
  const images: string[] = [];
  const codeLower = code.toLowerCase().trim();

  console.log(`[generateImageUrls] Starting search for code: "${code}"`);

  if (!shouldUseSupabaseStorage()) {
    // Fallback for local development
    return images;
  }

  // List all items in the root of imagens bucket
  try {
    console.log(`[generateImageUrls] Listing root of imagens bucket...`);
    const { data: rootContents } = await supabase.storage
      .from("imagens")
      .list("", { limit: 500 });

    if (rootContents && rootContents.length > 0) {
      // Process all root-level items (both files and folders)
      for (const item of rootContents) {
        const itemPath = item.name;
        const isFolder = !item.id; // Folders don't have an id

        if (isFolder) {
          // Recursively search in subfolders
          await searchFolderForImages(itemPath, codeLower, images);
        } else {
          // Check root-level files too
          const nameLower = item.name.toLowerCase();
          if (nameLower.includes(codeLower)) {
            const storageUrl = getImageStorageUrl(itemPath);
            if (storageUrl && !images.includes(storageUrl)) {
              images.push(storageUrl);
              console.log(`[generateImageUrls] ✓ Found in root: ${itemPath}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.debug(`[generateImageUrls] Error listing root:`, err);
  }

  console.log(`[generateImageUrls] Total URLs found: ${images.length}`);
  return images;
}

/**
 * Recursively search a folder for images containing the product code
 */
async function searchFolderForImages(folderPath: string, codeLower: string, images: string[]): Promise<void> {
  try {
    console.log(`[generateImageUrls] Searching in folder: ${folderPath}`);
    const { data: folderContents } = await supabase.storage
      .from("imagens")
      .list(folderPath, { limit: 500 });

    if (folderContents && folderContents.length > 0) {
      for (const item of folderContents) {
        const itemPath = `${folderPath}/${item.name}`;
        const isFolder = !item.id;

        if (isFolder) {
          // Recursively search subfolders
          await searchFolderForImages(itemPath, codeLower, images);
        } else {
          // Check if file name contains the product code (case-insensitive)
          const nameLower = item.name.toLowerCase();
          if (nameLower.includes(codeLower)) {
            const storageUrl = getImageStorageUrl(itemPath);
            if (storageUrl && !images.includes(storageUrl)) {
              images.push(storageUrl);
              console.log(`[generateImageUrls] ✓ Found: ${itemPath}`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.debug(`[generateImageUrls] Error listing folder "${folderPath}":`, err);
  }
}


/**
 * Normalize image paths from Supabase records or web URLs
 * Handles both direct web paths and legacy database paths
 * In production: converts to Supabase Storage URLs
 * In development: uses local paths
 */
function normalizeImagePath(imagePath: string): string {
  if (!imagePath) return imagePath;

  // Fix corrupted URLs from previous backend bug (which inserted /public/catalogo/)
  if (imagePath.includes("/public/catalogo/imagens/")) {
    imagePath = imagePath.replace("/public/catalogo/imagens/", "/imagens/");
  }

  // If already a full URL, return as-is
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }

  // In production, convert to Supabase Storage URL
  if (shouldUseSupabaseStorage()) {
    // Remove leading /catalogo/imagens/ if present
    let cleanPath = imagePath;
    if (cleanPath.startsWith("/catalogo/imagens/")) {
      cleanPath = cleanPath.replace(/^\/catalogo\/imagens\//, "");
    } else if (cleanPath.startsWith("catalogo/imagens/")) {
      cleanPath = cleanPath.replace(/^catalogo\/imagens\//, "");
    }

    return getImageStorageUrl(cleanPath);
  }

  // In development, use local paths
  // If path already starts with /, it's a web path and is ready to use
  if (imagePath.startsWith("/")) {
    return imagePath;
  }

  // Otherwise, prepend /catalogo/imagens/ for database paths
  if (!imagePath.startsWith("catalogo")) {
    return `/catalogo/imagens/${imagePath}`;
  }

  return `/${imagePath}`;
}

/**
 * Get the image URL for display
 * Normalizes paths and returns the correct reference to static files or Supabase Storage
 */
export function getImageUrl(imagePath: string): string {
  return normalizeImagePath(imagePath);
}

/**
 * Try to find images with multiple attempts
 * Useful for different image naming conventions
 */
export async function findImagesFlexible(code: string): Promise<string[]> {
  // If the code contains a slash, try to find images for any of the parts
  if (code.includes('/')) {
    const parts = code.split('/').map(p => p.trim()).filter(p => p.length > 0);
    const allImages = new Set<string>();
    
    for (const part of parts) {
      // Recursively find images for each part
      const partImages = await findImagesFlexible(part);
      partImages.forEach(img => allImages.add(img));
    }
    
    // If we found any images for the parts, return them
    if (allImages.size > 0) {
      return Array.from(allImages);
    }
  }

  // First try exact match
  let images = await findProductImages(code);

  // If no images found, try some variations
  if (images.length === 0) {
    // Try with lowercase
    images = await findProductImages(code.toLowerCase());
  }

  if (images.length === 0) {
    // Try with uppercase
    images = await findProductImages(code.toUpperCase());
  }

  // If still no images, try removing special characters
  if (images.length === 0) {
    const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanCode !== code) {
      images = await findProductImages(cleanCode);
    }
  }

  return images;
}
