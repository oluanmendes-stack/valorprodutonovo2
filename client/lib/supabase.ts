import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase configuration");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Product type from Supabase
 */
export interface Product {
  id: string;
  code: string;
  description: string;
  marca: string;
  priceDistributor?: number;
  price_distributor?: number;
  priceDistributorWithIPI?: number;
  price_distributor_with_ipi?: number;
  priceFinal?: number;
  price_final?: number;
  priceFinalWithIPI?: number;
  price_final_with_ipi?: number;
  priceResale?: number;
  priceResaleWithIPI?: number;
  catalog_path?: string | null;
  created_at: string;
}

/**
 * Batch item structure
 */
export interface BatchItem {
  loteNumber: string;
  codes: string[];
  quantity: number;
}

/**
 * Product with quantity for batch
 */
export interface BatchProduct {
  id: string;
  code: string;
  description: string;
  marca: string;
  descriptor?: string | null;
  price: number;
  priceWithIPI: number;
  totalPrice: number;
  totalPriceWithIPI: number;
}

/**
 * Normalize product code for consistent matching
 */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * Fetch all products from Supabase
 */
export async function fetchAllProducts(): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("code");

    if (error) {
      console.error("Error fetching from Supabase:", {
        message: error.message,
        status: error.status,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return [];
    }

    // If Supabase returned data, use it
    if (data && data.length > 0) {
      console.log(`Loaded ${data.length} products from Supabase`);
      // Map Supabase fields to our Product interface
      return data.map((item: any) => ({
        id: item.id,
        code: item.code,
        description: item.description,
        marca: item.marca || "",
        priceDistributor: item.price_distributor || 0,
        priceDistributorWithIPI: item.price_distributor_with_ipi || 0,
        priceFinal: item.price_final || 0,
        priceFinalWithIPI: item.price_final_with_ipi || 0,
        // Keep these for backwards compatibility
        priceResale: item.price_final || 0,
        priceResaleWithIPI: item.price_final_with_ipi || 0,
        catalog_path: item.catalog_path || null,
        created_at: item.created_at,
      }));
    }

    return [];
  } catch (err) {
    console.error("Error in fetchAllProducts:", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return [];
  }
}

/**
 * Search products by code
 */
export async function searchProductByCode(code: string): Promise<Product | null> {
  const normalizedSearchCode = normalizeCode(code);
  const allProducts = await fetchAllProducts();

  // Find exact match after normalizing
  const product = allProducts.find(
    (p) => normalizeCode(p.code) === normalizedSearchCode
  );

  return product || null;
}

/**
 * Fetch multiple products by codes
 */
export async function fetchProductsByCode(codes: string[]): Promise<Product[]> {
  const allProducts = await fetchAllProducts();

  const normalizedSearchCodes = codes.map(normalizeCode);
  const products = allProducts.filter((p) =>
    normalizedSearchCodes.includes(normalizeCode(p.code))
  );

  return products;
}

/**
 * Generate batch report - uses client-side generation
 */
export async function generateBatchReport(
  batches: BatchItem[]
): Promise<{
  success: boolean;
  reports: Array<{
    lote: string;
    codes: string[];
    quantity: number;
    products: Array<{
      code: string;
      description: string;
      descriptor: string | null;
      marca: string;
      price: number;
      priceWithIPI: number;
      totalPrice: number;
      totalPriceWithIPI: number;
    }>;
    batchTotalPrice: number;
    batchTotalPriceWithIPI: number;
  }>;
  notFoundCodes: string[];
}> {
  return generateBatchReportClientSide(batches);
}

/**
 * Client-side fallback for batch report generation (with descriptors)
 */
async function generateBatchReportClientSide(
  batches: BatchItem[]
): Promise<{
  success: boolean;
  reports: Array<{
    lote: string;
    codes: string[];
    quantity: number;
    products: Array<{
      code: string;
      description: string;
      descriptor: string | null;
      marca: string;
      price: number;
      priceWithIPI: number;
      totalPrice: number;
      totalPriceWithIPI: number;
    }>;
    batchTotalPrice: number;
    batchTotalPriceWithIPI: number;
  }>;
  notFoundCodes: string[];
}> {
  try {
    // Import getDescriptor dynamically to avoid circular imports
    const { getDescriptor } = await import("@/services/catalogService");

    // Fetch all products once
    const allProducts = await fetchAllProducts();
    const reports = [];
    const notFoundCodes: string[] = [];

    for (const batch of batches) {
      const batchProducts: any[] = [];
      let batchTotalPrice = 0;
      let batchTotalPriceWithIPI = 0;

      for (const code of batch.codes) {
        const normalizedCode = normalizeCode(code);
        const product = allProducts.find(
          (p) => normalizeCode(p.code) === normalizedCode
        );

        if (product) {
          const price = typeof product.priceDistributorWithIPI === 'number' ? product.priceDistributorWithIPI : 0;
          const priceWithIPI = typeof product.priceFinalWithIPI === 'number' ? product.priceFinalWithIPI : 0;
          const totalPrice = price * batch.quantity;
          const totalPriceWithIPI = priceWithIPI * batch.quantity;

          // Load descriptor for the product
          let descriptor: string | null = null;
          try {
            const descriptorData = await getDescriptor(product.code);
            if (descriptorData && descriptorData.descriptor) {
              descriptor = descriptorData.descriptor;
            }
          } catch (err) {
            console.warn(`Could not load descriptor for ${product.code}:`, err);
          }

          batchProducts.push({
            code: product.code,
            description: product.description,
            descriptor,
            marca: product.marca,
            price,
            priceWithIPI,
            totalPrice,
            totalPriceWithIPI,
          });

          batchTotalPrice += totalPrice;
          batchTotalPriceWithIPI += totalPriceWithIPI;
        } else {
          notFoundCodes.push(code);
        }
      }

      reports.push({
        lote: batch.loteNumber,
        codes: batch.codes,
        quantity: batch.quantity,
        products: batchProducts,
        batchTotalPrice,
        batchTotalPriceWithIPI,
      });
    }

    return {
      success: true,
      reports,
      notFoundCodes,
    };
  } catch (error) {
    console.error("Error generating batch report (client-side):", error);
    return {
      success: false,
      reports: [],
      notFoundCodes: [],
    };
  }
}

/**
 * Search for a catalog file in Supabase Storage directly from frontend
 */
export async function findCatalogFileDirect(code: string): Promise<string | null> {
  try {
    const { data: files, error } = await supabase.storage.from("catalago").list('', {
      limit: 1000,
    });

    if (error || !files) {
      console.error("Error listing catalogs:", error);
      return null;
    }

    const searchCode = normalizeCode(code);
    
    // Find a file that starts with the code or matches patterns
    const foundFile = files.find(file => {
      const fileName = normalizeCode(file.name);
      return (
        fileName === searchCode ||
        fileName === `${searchCode}.doc` ||
        fileName === `${searchCode}.docx` ||
        fileName === `${searchCode}.pdf` ||
        fileName.startsWith(`${searchCode}.`)
      );
    });

    if (foundFile) {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      return `${SUPABASE_URL}/storage/v1/object/public/catalago/${encodeURIComponent(foundFile.name)}`;
    }

    return null;
  } catch (err) {
    console.error("Error in findCatalogFileDirect:", err);
    return null;
  }
}
