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
 * Connects directly to Supabase Storage without API dependency
 */
async function generateImageUrls(code: string): Promise<string[]> {
  const images: string[] = [];
  const codeLower = code.toLowerCase().trim();
  const codeUpper = code.toUpperCase();

  console.log(`[generateImageUrls] Starting search for code: "${code}" (lower: "${codeLower}", upper: "${codeUpper}")`);

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
  // These are the main brand folders to search
  const brands = [
    "", // ROOT
    "TECNOPRINT",
    "PHYSIO CONTROL",
    "MEDMAX",
    "MED-LINKET",
    "GABMED",
    "CONTEC",
  ];

  // Additional product category folders within MED-LINKET and other brands
  // that might contain product images
  // Start with known folders that are commonly used
  const additionalFolders: string[] = [
    // Known MED-LINKET subfolders (hard-coded common patterns)
    "MED-LINKET/ELETRODO DESFIBRILACAO",
    "MED-LINKET/ELETRODOS",
    "MED-LINKET/ELETRODO",
    "MED-LINKET/DESFIBRILADORES",
  ];

  // For MED-LINKET, we'll try to list subdirectories dynamically
  try {
    console.log(`[generateImageUrls] Attempting to list subdirectories in MED-LINKET...`);
    const { data: medLinketContents } = await supabase.storage
      .from("imagens")
      .list("MED-LINKET", { limit: 500 });

    if (medLinketContents && medLinketContents.length > 0) {
      console.log(`[generateImageUrls] Found ${medLinketContents.length} items in MED-LINKET`);
      // Add folders found in MED-LINKET (in Supabase, item.id is null for folders)
      for (const item of medLinketContents) {
        if (!item.id) { // It's a folder/directory (id is null/undefined for folders)
          const folderPath = `MED-LINKET/${item.name}`;
          if (!additionalFolders.includes(folderPath)) {
            additionalFolders.push(folderPath);
            console.log(`[generateImageUrls] ✓ Added subfolder: ${folderPath}`);
          }
        }
      }
      console.log(`[generateImageUrls] Total additional folders from MED-LINKET: ${additionalFolders.length}`);
    }
  } catch (err) {
    console.debug(`[generateImageUrls] Could not list MED-LINKET subdirectories:`, err);
    console.log(`[generateImageUrls] Using pre-configured MED-LINKET folders as fallback`);
  }

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

    // Combine all folders to search
    const allFolders = [...brands, ...additionalFolders];
    console.log(`[generateImageUrls] Searching for "${code}" in folders:`, allFolders);
    console.log(`[generateImageUrls] Search terms:`, searchTerms);

    for (const folder of allFolders) {
      for (const term of searchTerms) {
        listPromises.push(
          supabase.storage.from("imagens").list(folder, {
            search: term,
            limit: 100
          }).then(({ data, error }) => ({
            folder,
            data,
            error,
            term,
            success: !error
          }))
        );
      }
    }

    // Await all searches concurrently
    console.log(`[generateImageUrls] Making ${listPromises.length} API calls to Supabase...`);
    const listResults = await Promise.all(listPromises);
    const addedUrls = new Set<string>();
    let totalFilesFound = 0;

    for (const res of listResults) {
      if (res.error) {
        console.debug(`[generateImageUrls] Error listing ${res.folder} with term "${res.term}":`, res.error);
        continue;
      }

      if (!res.data || res.data.length === 0) {
        console.debug(`[generateImageUrls] No files in ${res.folder} for term "${res.term}"`);
        continue;
      }

      console.log(`[generateImageUrls] Found ${res.data.length} files in folder "${res.folder}" for term "${res.term}"`);
      totalFilesFound += res.data.length;

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
            console.debug(`[generateImageUrls] Added image: ${file.name} from ${res.folder}`);
          }
        }
      }
    }

    console.log(`[generateImageUrls] Total files found across all folders: ${totalFilesFound}`);
    console.log(`[generateImageUrls] Total unique image URLs generated: ${images.length}`);

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

  // If we still haven't found anything, try a deep search in all subfolders
  if (images.length === 0) {
    console.log(`[generateImageUrls] No images found via search API, attempting deep folder scan...`);
    try {
      const deepSearchResults = await searchAllSubfolders(code, codeLower, codeUpper);
      images.push(...deepSearchResults);
      console.log(`[generateImageUrls] Deep search found ${deepSearchResults.length} images`);
    } catch (err) {
      console.debug(`[generateImageUrls] Deep search failed:`, err);
    }
  }

  // Last resort: Try brute force URLs for common paths
  if (images.length === 0) {
    console.log(`[generateImageUrls] No images found, attempting brute force URLs...`);
    const bruteForceUrls = await tryBruteForceUrls(code, codeLower, codeUpper);
    images.push(...bruteForceUrls);
    if (bruteForceUrls.length > 0) {
      console.log(`[generateImageUrls] Brute force found ${bruteForceUrls.length} images`);
    }
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

/**
 * Deep search function that recursively looks through all subfolders
 * Used as a fallback when the search API doesn't find images
 */
async function searchAllSubfolders(code: string, codeLower: string, codeUpper: string): Promise<string[]> {
  const images: string[] = [];
  const searchTerms = [code, codeLower, codeUpper];

  // Start with the root and known brand folders
  const mainFolders = [
    "",
    "TECNOPRINT",
    "PHYSIO CONTROL",
    "MEDMAX",
    "MED-LINKET",
    "GABMED",
    "CONTEC",
  ];

  for (const mainFolder of mainFolders) {
    try {
      console.log(`[searchAllSubfolders] Listing contents of "${mainFolder}"`);
      const { data: contents } = await supabase.storage
        .from("imagens")
        .list(mainFolder, { limit: 500 });

      if (!contents) continue;

      // Look for files and folders in this folder
      for (const item of contents) {
        // In Supabase Storage: item.id is null/undefined for folders, has value for files
        const isFolder = !item.id;

        if (!isFolder) { // It's a file
          const itemName = item.name.toLowerCase();
          if (searchTerms.some(term => itemName.includes(term.toLowerCase()))) {
            const imagePath = mainFolder ? `${mainFolder}/${item.name}` : item.name;
            const storageUrl = getImageStorageUrl(imagePath);
            if (storageUrl && !images.includes(storageUrl)) {
              images.push(storageUrl);
              console.log(`[searchAllSubfolders] Found image: ${imagePath}`);
            }
          }
        } else {
          // It's a subfolder, try to search inside it
          const subfolderPath = mainFolder ? `${mainFolder}/${item.name}` : item.name;
          console.log(`[searchAllSubfolders] Searching in subfolder: "${subfolderPath}"`);

          try {
            const { data: subcontents } = await supabase.storage
              .from("imagens")
              .list(subfolderPath, { limit: 500 });

            if (subcontents && subcontents.length > 0) {
              console.log(`[searchAllSubfolders] Found ${subcontents.length} items in subfolder "${subfolderPath}"`);

              for (const subitem of subcontents) {
                // Only process files, not nested folders
                const isSubFolder = !subitem.id;
                if (!isSubFolder) { // It's a file
                  const itemName = subitem.name.toLowerCase();
                  if (searchTerms.some(term => itemName.includes(term.toLowerCase()))) {
                    const imagePath = `${subfolderPath}/${subitem.name}`;
                    const storageUrl = getImageStorageUrl(imagePath);
                    if (storageUrl && !images.includes(storageUrl)) {
                      images.push(storageUrl);
                      console.log(`[searchAllSubfolders] ✓ Found image in subfolder: ${imagePath}`);
                    }
                  }
                }
              }
            } else {
              console.debug(`[searchAllSubfolders] Subfolder "${subfolderPath}" is empty`);
            }
          } catch (err) {
            console.debug(`[searchAllSubfolders] Could not list subfolder "${subfolderPath}":`, err);
          }
        }
      }
    } catch (err) {
      console.debug(`[searchAllSubfolders] Error listing folder "${mainFolder}":`, err);
    }
  }

  return images;
}

/**
 * Brute force function that tries common URL patterns
 * Used as a last resort when API search fails
 */
async function tryBruteForceUrls(code: string, codeLower: string, codeUpper: string): Promise<string[]> {
  const images: string[] = [];
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  if (!SUPABASE_URL) return images;

  // Common image extensions to try
  const extensions = ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG', 'webp', 'WEBP'];

  // Known folder patterns from MED-LINKET (prioritize known ones first)
  const commonFolders = [
    // MED-LINKET subfolders (in priority order)
    'MED-LINKET/ELETRODO DESFIBRILACAO',  // Most specific - this is the exact folder for the image
    'MED-LINKET/ELETRODOS',
    'MED-LINKET/ELETRODO',
    'MED-LINKET/DESFIBRILADORES',
    'MED-LINKET',
    // Other brands
    'TECNOPRINT',
    'PHYSIO CONTROL',
    'MEDMAX',
    'GABMED',
    'CONTEC',
    '',  // Root
  ];

  console.log(`[tryBruteForceUrls] Attempting ${extensions.length * commonFolders.length} URL combinations...`);

  const codeVariations = [code, codeLower, codeUpper];

  for (const folder of commonFolders) {
    for (const codeVar of codeVariations) {
      for (const ext of extensions) {
        const filename = `${codeVar}.${ext}`;
        const fullPath = folder ? `${folder}/${filename}` : filename;
        const encodedPath = fullPath
          .split('/')
          .map(part => encodeURIComponent(part))
          .join('/');
        const url = `${SUPABASE_URL}/storage/v1/object/public/imagens/${encodedPath}`;

        // Test if this URL is valid by doing a HEAD request
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (response.ok) {
            console.log(`[tryBruteForceUrls] ✓ Found valid URL: ${fullPath}`);
            images.push(url);
            break; // Found one for this code, move to next variation
          }
        } catch (err) {
          // Silently ignore fetch errors (CORS, network, etc.)
        }
      }
    }
  }

  if (images.length > 0) {
    console.log(`[tryBruteForceUrls] Found ${images.length} images via brute force`);
  } else {
    console.log(`[tryBruteForceUrls] No images found via brute force`);
  }

  return images;
}
