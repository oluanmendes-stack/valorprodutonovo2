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
 * Optimized for MED-LINKET structure - only searches in MED-LINKET bucket
 */
async function generateImageUrls(code: string): Promise<string[]> {
  const images: string[] = [];
  const codeLower = code.toLowerCase().trim();
  const codeUpper = code.toUpperCase();

  console.log(`[generateImageUrls] Starting search for code: "${code}"`);

  // File extensions to try (only common ones)
  const extensions = ['.jpg', '.jpeg', '.png'];

  // MED-LINKET subfolders in priority order
  const medLinketFolders: string[] = [
    "MED-LINKET/ELETRODO DESFIBRILACAO",
    "MED-LINKET/ELETRODOS",
    "MED-LINKET/ELETRODO",
    "MED-LINKET/DESFIBRILADORES",
  ];

  if (!shouldUseSupabaseStorage()) {
    // Fallback for local development
    for (const folder of medLinketFolders) {
      for (const ext of extensions) {
        const filename = `${code}${ext}`;
        const pathWithBrand = `${folder}/${filename}`;
        const storageUrl = getImageStorageUrl(pathWithBrand);
        if (storageUrl) images.push(storageUrl);
      }
    }
    return images;
  }

  // Get all MED-LINKET subfolders dynamically
  try {
    console.log(`[generateImageUrls] Listing all subfolders in MED-LINKET...`);
    const { data: medLinketContents } = await supabase.storage
      .from("imagens")
      .list("MED-LINKET", { limit: 500 });

    if (medLinketContents && medLinketContents.length > 0) {
      // Get folder list
      const dynamicFolders: string[] = [];
      for (const item of medLinketContents) {
        if (!item.id) { // It's a folder
          dynamicFolders.push(`MED-LINKET/${item.name}`);
        }
      }
      console.log(`[generateImageUrls] Found ${dynamicFolders.length} subfolders in MED-LINKET`);

      // Search in each subfolder
      for (const folder of dynamicFolders) {
        console.log(`[generateImageUrls] Searching in folder: ${folder}`);
        const { data: folderContents } = await supabase.storage
          .from("imagens")
          .list(folder, { limit: 200 });

        if (folderContents && folderContents.length > 0) {
          for (const file of folderContents) {
            const nameLower = file.name.toLowerCase();
            if (nameLower.includes(codeLower)) {
              const imagePath = `${folder}/${file.name}`;
              const storageUrl = getImageStorageUrl(imagePath);
              if (storageUrl && !images.includes(storageUrl)) {
                images.push(storageUrl);
                console.log(`[generateImageUrls] ✓ Found: ${file.name}`);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.debug(`[generateImageUrls] Error listing MED-LINKET:`, err);
  }

  // If not found, try direct paths in hardcoded folders
  if (images.length === 0) {
    console.log(`[generateImageUrls] Not found via listing, trying direct paths...`);
    for (const folder of medLinketFolders) {
      for (const codeVar of [code, codeLower, codeUpper]) {
        for (const ext of extensions) {
          const filename = `${codeVar}${ext}`;
          const imagePath = `${folder}/${filename}`;
          const storageUrl = getImageStorageUrl(imagePath);
          images.push(storageUrl);
        }
      }
    }
  }

  console.log(`[generateImageUrls] Total URLs generated: ${images.length}`);
  return images;
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
