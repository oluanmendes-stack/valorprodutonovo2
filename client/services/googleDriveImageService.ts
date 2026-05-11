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
async function searchImagesInFolder(folderId: string, code: string, folderName: string = ''): Promise<string[]> {
  const images: string[] = [];
  const codeLower = code.toLowerCase();

  // Search for any images with the product code in filename
  const imageQuery = `'${folderId}' in parents and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/gif' or mimeType='image/webp') and trashed=false`;

  try {
    console.log(`[GoogleDrive] 🔍 Procurando em pasta: ${folderName || folderId}`);
    console.log(`[GoogleDrive]    Query: ${imageQuery}`);

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(imageQuery)}&fields=files(id,name,webViewLink)&orderBy=name&key=${apiKey}`;
    console.log(`[GoogleDrive]    URL: ${url.substring(0, 100)}...`);

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[GoogleDrive] ❌ Erro na API ao buscar pasta ${folderName || folderId}: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`[GoogleDrive] ❌ Resposta de erro:`, errorText);
      return [];
    }

    const data = await response.json();
    console.log(`[GoogleDrive]    Resposta da API:`, data);

    if (data.files && data.files.length > 0) {
      console.log(`[GoogleDrive] 📁 Encontrados ${data.files.length} arquivo(s) de imagem nesta pasta:`);

      for (const file of data.files) {
        const nameLower = file.name.toLowerCase();
        console.log(`[GoogleDrive]   📄 ${file.name} (procurando por: "${codeLower}")`);

        // Match if filename contains the product code
        if (nameLower.includes(codeLower)) {
          // Use proxy URL to bypass CORS restrictions
          const directLink = `https://drive.google.com/uc?id=${file.id}&export=view`;
          const proxyUrl = `/api/proxy-google-image?url=${encodeURIComponent(directLink)}`;
          images.push(proxyUrl);
          console.log(`[GoogleDrive]   ✅ CORRESPONDÊNCIA ENCONTRADA: ${file.name}`);
          console.log(`[GoogleDrive]      URL original: ${directLink}`);
          console.log(`[GoogleDrive]      URL proxy: ${proxyUrl}`);
        } else {
          console.log(`[GoogleDrive]   ❌ Sem correspondência: "${file.name}" não contém "${codeLower}"`);
        }
      }
    } else {
      console.log(`[GoogleDrive] 📭 Nenhuma imagem encontrada nesta pasta (resposta vazia)`);
    }
  } catch (error) {
    console.error(`[GoogleDrive] ❌ Erro ao buscar pasta ${folderName || folderId}:`, error);
  }

  return images;
}

/**
 * Get all subfolders in a folder (with caching)
 */
async function getSubfolders(folderId: string, parentName: string = ''): Promise<{id: string, name: string}[]> {
  const cacheKey = `subfolders_${folderId}`;
  if (folderCache.has(cacheKey)) {
    const cached = folderCache.get(cacheKey);
    if (cached) {
      console.log(`[GoogleDrive] 📦 Subpastas em cache de "${parentName}": ${(cached as any[]).length} pasta(s)`);
      return cached as {id: string, name: string}[];
    }
  }

  const subfolders: {id: string, name: string}[] = [];
  const folderQuery = `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  try {
    console.log(`[GoogleDrive] 📂 Listando subpastas de "${parentName || folderId}"...`);
    console.log(`[GoogleDrive]    Query: ${folderQuery}`);

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&pageSize=100&key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[GoogleDrive] ❌ Erro ao listar subpastas de "${parentName}": ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`[GoogleDrive] ❌ Resposta de erro:`, errorText);
      folderCache.set(cacheKey, []);
      return [];
    }

    const data = await response.json();
    console.log(`[GoogleDrive]    Resposta da API (subpastas):`, data);

    if (data.files && data.files.length > 0) {
      console.log(`[GoogleDrive] 📦 Encontradas ${data.files.length} subpasta(s):`);
      for (const folder of data.files) {
        subfolders.push({id: folder.id, name: folder.name});
        console.log(`[GoogleDrive]   📁 ${folder.name}`);
      }
    } else {
      console.log(`[GoogleDrive] 📭 Nenhuma subpasta encontrada em "${parentName}" (resposta vazia)`);
    }

    folderCache.set(cacheKey, subfolders);
  } catch (error) {
    console.error(`[GoogleDrive] ❌ Erro ao listar subpastas de "${parentName}":`, error);
    folderCache.set(cacheKey, []);
  }

  return subfolders;
}

/**
 * Recursively search for images in a folder and all subfolders
 */
async function recursiveSearchImages(folderId: string, code: string, folderName: string = '', depth: number = 0, maxDepth: number = 5): Promise<string[]> {
  const images: string[] = [];
  const indent = '  '.repeat(depth);

  if (depth > maxDepth) {
    console.log(`[GoogleDrive] ${indent}⚠️ Limite de profundidade atingido`);
    return images;
  }

  console.log(`[GoogleDrive] ${indent}🔍 Procurando imagens em "${folderName}"...`);

  // Search for images in current folder
  const currentImages = await searchImagesInFolder(folderId, code, folderName);
  images.push(...currentImages);

  if (currentImages.length > 0) {
    console.log(`[GoogleDrive] ${indent}✅ Encontradas ${currentImages.length} imagem(ns) em "${folderName}"`);
  }

  // Get subfolders and search recursively
  console.log(`[GoogleDrive] ${indent}📂 Listando subpastas de "${folderName}"...`);
  const subfolders = await getSubfolders(folderId, folderName);

  if (subfolders.length > 0) {
    console.log(`[GoogleDrive] ${indent}🔄 Encontradas ${subfolders.length} subpasta(s). Buscando recursivamente...`);
    for (const subfolder of subfolders) {
      console.log(`[GoogleDrive] ${indent}→ Entrando em subpasta: ${subfolder.name}`);
      const subImages = await recursiveSearchImages(subfolder.id, code, subfolder.name, depth + 1, maxDepth);
      images.push(...subImages);
    }
  } else {
    console.log(`[GoogleDrive] ${indent}📭 Nenhuma subpasta para descer em "${folderName}"`);
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
    console.log(`[GoogleDrive] ♻️ Usando resultado em cache: ${cached.length} imagem(ns) para ${code}`);
    return cached;
  }

  if (!apiKey || !parentFolderId) {
    console.warn('[GoogleDrive] ❌ Configuração ausente: VITE_GOOGLE_DRIVE_API_KEY ou VITE_GOOGLE_DRIVE_FOLDER_ID');
    return [];
  }

  try {
    console.log(`\n[GoogleDrive] 🚀 ========== INICIANDO BUSCA ==========`);
    console.log(`[GoogleDrive] Código procurado: "${code}"`);
    console.log(`[GoogleDrive] ID da pasta raiz: ${parentFolderId}`);
    console.log(`[GoogleDrive] ======================================\n`);

    // Do a recursive search through all folders and subfolders
    const images = await recursiveSearchImages(parentFolderId, code, 'PASTA_RAIZ');

    // Cache the result
    imageCache.set(code, images);

    console.log(`\n[GoogleDrive] ========== RESULTADO FINAL ==========`);
    console.log(`[GoogleDrive] ✅ Total de imagens encontradas: ${images.length}`);
    if (images.length > 0) {
      images.forEach((url, idx) => {
        console.log(`[GoogleDrive]   ${idx + 1}. ${url}`);
      });
    }
    console.log(`[GoogleDrive] ======================================\n`);

    return images;
  } catch (error) {
    console.error(`[GoogleDrive] ❌ Erro ao buscar imagens para ${code}:`, error);
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
