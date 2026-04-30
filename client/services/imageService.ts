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

// Cache for folder structure
interface FolderStructure {
  [path: string]: {
    folders: string[];
    files: { name: string; path: string }[];
  };
}
const folderStructureCache: FolderStructure = {};
let folderStructureCacheReady = false;
let folderStructureCacheLoading = false;
const folderCachePromise = new Promise<void>((resolve) => {
  folderStructureCache._resolveReady = resolve;
});

/**
 * Pre-load the folder structure of the imagens bucket
 * This should be called once at app startup to cache all folders and files
 */
export async function preCacheFolderStructure(): Promise<void> {
  if (folderStructureCacheReady || folderStructureCacheLoading) {
    console.log("[imageService] Folder structure cache already loaded or loading");
    return;
  }

  if (!shouldUseSupabaseStorage()) {
    console.log("[imageService] Supabase Storage not enabled, skipping pre-cache");
    folderStructureCacheReady = true;
    folderStructureCache._resolveReady?.();
    return;
  }

  folderStructureCacheLoading = true;
  console.log("[imageService] 🚀 Starting to pre-cache folder structure...");
  console.log("[imageService] Bucket: imagens");

  try {
    const startTime = performance.now();
    await buildFolderStructure("");
    const endTime = performance.now();

    folderStructureCacheReady = true;

    // Calculate total items, filtering out non-folder entries
    let totalItems = 0;
    let totalFolders = 0;
    for (const key in folderStructureCache) {
      if (key === "_resolveReady") continue;
      const folder = folderStructureCache[key];
      if (folder && folder.files && folder.folders) {
        totalItems += folder.files.length;
        totalFolders += folder.folders.length;
      }
    }

    console.log(`[imageService] ✅ Folder structure pre-cached in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`[imageService] Total folders: ${totalFolders}, Total files: ${totalItems}`);
    console.log("[imageService] Full cache structure:", folderStructureCache);
  } catch (err) {
    console.error("[imageService] ❌ Error pre-caching folder structure:", err);
    folderStructureCacheReady = true;
  } finally {
    folderStructureCacheLoading = false;
    folderStructureCache._resolveReady?.();
  }
}

/**
 * Recursively build the folder structure and cache it
 */
async function buildFolderStructure(folderPath: string): Promise<void> {
  try {
    const displayPath = folderPath || "root";
    console.log(`[imageService] Building structure for: ${displayPath}`);

    const { data, error } = await supabase.storage
      .from("imagens")
      .list(folderPath || "", { limit: 500 });

    if (error) {
      console.error(`[imageService] ✗ Error listing ${displayPath}:`, error);
      return;
    }

    if (!data) {
      console.warn(`[imageService] ⚠ No data returned for ${displayPath}`);
      return;
    }

    console.log(`[imageService] → ${displayPath} contains ${data.length} items:`, data);

    const folders: string[] = [];
    const files: { name: string; path: string }[] = [];

    for (const item of data) {
      const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;
      const isFolder = !item.id;

      if (isFolder) {
        folders.push(item.name);
        console.log(`[imageService]   📁 ${item.name}/ (folder)`);
        // Recursively build structure for subfolders
        await buildFolderStructure(itemPath);
      } else {
        files.push({ name: item.name, path: itemPath });
        console.log(`[imageService]   📄 ${item.name}`);
      }
    }

    folderStructureCache[folderPath || "root"] = { folders, files };
  } catch (err) {
    console.error(`[imageService] ✗ Error building folder structure:`, err);
  }
}

/**
 * Find images for a product code
 * Uses pre-cached folder structure if available, otherwise falls back to dynamic search
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
 * Uses pre-cached folder structure if available for faster search
 * Falls back to dynamic search if cache is not ready
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

  // Wait for cache to be ready if it's still loading
  if (folderStructureCacheLoading) {
    console.log(`[generateImageUrls] Waiting for folder cache to be ready...`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to avoid busy loop
  }

  // Use cached folder structure if available
  if (folderStructureCacheReady && Object.keys(folderStructureCache).length > 0) {
    console.log(`[generateImageUrls] Using cached folder structure`);

    // Search through all cached files
    const searchCachedFiles = (structure: FolderStructure) => {
      for (const folderPath in structure) {
        if (folderPath === "_resolveReady") continue;
        const { files } = structure[folderPath];
        for (const file of files) {
          const nameLower = file.name.toLowerCase();
          if (nameLower.includes(codeLower)) {
            const storageUrl = getImageStorageUrl(file.path);
            if (storageUrl && !images.includes(storageUrl)) {
              images.push(storageUrl);
              console.log(`[generateImageUrls] ✓ Found: ${file.path}`);
            }
          }
        }
      }
    };

    searchCachedFiles(folderStructureCache);

    if (images.length > 0) {
      console.log(`[generateImageUrls] Total URLs found from cache: ${images.length}`);
      return images;
    }
  }

  // Fallback: dynamic search if cache not ready or empty
  console.log(`[generateImageUrls] Cache not ready or no results, falling back to dynamic search`);

  // List all items in the root of imagens bucket
  try {
    console.log(`[generateImageUrls] Listing root of imagens bucket...`);
    const { data: rootContents, error: rootError } = await supabase.storage
      .from("imagens")
      .list("", { limit: 500 });

    if (rootError) {
      console.error(`[generateImageUrls] Error listing root:`, rootError);
      return images;
    }

    if (!rootContents || rootContents.length === 0) {
      console.warn(`[generateImageUrls] Root folder is empty or inaccessible`);
      return images;
    }

    console.log(`[generateImageUrls] Root contains ${rootContents.length} items`);

    // Process all root-level items (both files and folders)
    for (const item of rootContents) {
      const itemPath = item.name;
      const isFolder = !item.id; // Folders don't have an id

      if (isFolder) {
        console.log(`[generateImageUrls] → Folder: ${itemPath}`);
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
  } catch (err) {
    console.error(`[generateImageUrls] Error listing root:`, err);
    return images;
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
    const { data: folderContents, error } = await supabase.storage
      .from("imagens")
      .list(folderPath, { limit: 500 });

    if (error) {
      console.debug(`[generateImageUrls] Error listing folder "${folderPath}":`, error);
      return;
    }

    if (!folderContents || folderContents.length === 0) {
      console.log(`[generateImageUrls] Folder is empty: ${folderPath}`);
      return;
    }

    console.log(`[generateImageUrls] Found ${folderContents.length} items in ${folderPath}`);

    for (const item of folderContents) {
      const itemPath = `${folderPath}/${item.name}`;
      const isFolder = !item.id;

      if (isFolder) {
        console.log(`[generateImageUrls]   → Subfolder: ${item.name}`);
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
  } catch (err) {
    console.error(`[generateImageUrls] Error searching folder "${folderPath}":`, err);
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
