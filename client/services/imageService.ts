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
    return imageCache.get(code) || [];
  }

  try {
    const images = await generateImageUrls(code);

    // Cache the result
    imageCache.set(code, images);

    if (images.length === 0) {
      console.info(`No image URLs generated for product code: ${code}`);
    }

    return images;
  } catch (error) {
    console.error(`Error finding images for ${code}:`, error);
    imageCache.set(code, []);
    return [];
  }
}

/**
 * Generate all possible image URLs for a product code
 * Connects directly to Supabase Storage without API dependency
 */
async function generateImageUrls(code: string): Promise<string[]> {
  const images: string[] = [];
  const codeLower = code.toLowerCase().trim();
  const codeUpper = code.toUpperCase();

  // Base patterns in different cases
  const basePatterns = [
    code,           // Exact case
    codeLower,      // Lowercase
    codeUpper,      // Uppercase
  ];

  // File extensions to try
  const extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG', '.webp', '.WEBP'];

  // Build all patterns including numbered suffixes and extensions
  const filenamePatterns: string[] = [];

  for (const basePattern of basePatterns) {
    // 1. Base pattern without extension
    filenamePatterns.push(basePattern);

    // 2. With hyphen-numbered suffixes (e.g., S0072B-L-1, S0072B-L-2)
    for (let i = 1; i <= 9; i++) {
      filenamePatterns.push(`${basePattern}-${i}`);
    }

    // 3. With parentheses-numbered suffixes (e.g., S0072B-L(1), S0072B-L(2))
    for (let i = 1; i <= 9; i++) {
      filenamePatterns.push(`${basePattern}(${i})`);
    }
  }

  // Add all extensions to all patterns
  const patternsWithExtensions: string[] = [];
  for (const pattern of filenamePatterns) {
    for (const ext of extensions) {
      patternsWithExtensions.push(`${pattern}${ext}`);
    }
  }

  // Combine base patterns (without extension) and patterns with extensions
  // We ONLY want patterns with extensions now, because files must have extensions in the bucket
  const allPatterns = [...patternsWithExtensions];
  
  const validFileNames = new Set(allPatterns);

  // Known brand/category folders in Supabase Storage
  const brands = [
    "", // ROOT
    "TECNOPRINT",
    "PHYSIO CONTROL",
    "MEDMAX",
    "MED-LINKET",
    "GABMED",
    "CONTEC",
  ];

  // If not using Supabase storage (e.g. local API mode), fallback to brute force
  if (!shouldUseSupabaseStorage()) {
    for (const brand of brands) {
      for (const pattern of allPatterns) {
        try {
          const pathWithBrand = brand ? `${brand}/${pattern}` : pattern;
          const storageUrl = getImageStorageUrl(pathWithBrand);
          if (storageUrl) images.push(storageUrl);
        } catch (err) {}
      }
    }
    return images;
  }

  // Check Supabase Storage API directly
  try {
    const listPromises: Promise<any>[] = [];
    
    // Create unique search terms to reduce API calls
    const searchTerms = Array.from(new Set([code, codeLower, codeUpper]));

    for (const folder of brands) {
      for (const term of searchTerms) {
        listPromises.push(
          supabase.storage.from("imagens").list(folder, {
            search: term,
            limit: 100
          }).then(({ data, error }) => ({ folder, data, error, term }))
        );
      }
    }

    // Await all searches concurrently
    const listResults = await Promise.all(listPromises);
    const addedUrls = new Set<string>();

    for (const res of listResults) {
      if (res.error || !res.data) continue;

      for (const file of res.data) {
        // As requested, appear just by containing the complete code
        const nameLower = file.name.toLowerCase();
        const termLower = res.term.toLowerCase();
        
        if (nameLower.includes(termLower)) {
          const imagePath = res.folder ? `${res.folder}/${file.name}` : file.name;
          const storageUrl = getImageStorageUrl(imagePath);
          
          if (storageUrl && !addedUrls.has(storageUrl)) {
            addedUrls.add(storageUrl);
            images.push(storageUrl);
          }
        }
      }
    }
    
    // Sort to prioritize exact matches over substring matches, base match over suffixed versions, root over brands
    images.sort((a, b) => {
      // Prioritize exact matches (which were in our validFileNames set)
      const aIsExact = Array.from(validFileNames).some(v => a.includes(encodeURIComponent(v)));
      const bIsExact = Array.from(validFileNames).some(v => b.includes(encodeURIComponent(v)));
      
      if (aIsExact && !bIsExact) return -1;
      if (!aIsExact && bIsExact) return 1;
      
      return a.length - b.length;
    });
    
  } catch (err) {
    console.error("[Images] Error searching Supabase API:", err);
  }

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
