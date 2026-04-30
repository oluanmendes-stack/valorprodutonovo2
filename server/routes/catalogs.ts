import { RequestHandler } from "express";
import * as fs from "fs";
import * as path from "path";
import { getCatalogStorageUrl } from "../lib/supabase-storage";

/**
 * Find catalog file for a product code
 * Returns Supabase Storage URLs based on common naming patterns
 */
export const findCatalogPath: RequestHandler = (req, res) => {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;

    if (!code) {
      res.status(400).json({
        success: false,
        error: "Product code required",
      });
      return;
    }

    console.log(`\n[Catalogs] SEARCH START: "${code}"`);
    console.log(`[Catalogs] Using Supabase Storage`);

    const catalogUrls: string[] = [];

    // Try common catalog file naming patterns
    const patterns = [
      code, // Try raw code first
      `${code}.doc`,
      `${code}.docx`,
      `${code.toLowerCase()}.doc`,
      `${code.toLowerCase()}.docx`,
      `${code.toUpperCase()}.doc`,
      `${code.toUpperCase()}.docx`,
      `${code}.pdf`,
      `${code.toLowerCase()}.pdf`,
      `${code.toUpperCase()}.pdf`,
    ];

    console.log(`[Catalogs] Testing ${patterns.length} naming patterns for: "${code}"`);

    // Generate Supabase Storage URLs for all possible patterns
    console.log(`[Catalogs] Env Check: SUPABASE_URL is ${process.env.SUPABASE_URL ? "SET" : "EMPTY"}`);
    
    for (const pattern of patterns) {
      try {
        const storageUrl = getCatalogStorageUrl(pattern);
        if (storageUrl && storageUrl.includes("supabase.co")) {
          catalogUrls.push(storageUrl);
          console.log(`✓ Generated URL for "${pattern}": ${storageUrl}`);
        } else {
          console.log(`✗ Empty/Invalid URL for "${pattern}"`);
        }
      } catch (err) {
        console.warn(`Could not generate URL for pattern: ${pattern}`, err);
      }
    }

    console.log(`[Catalogs] URLs generated: ${catalogUrls.length}`);

    if (catalogUrls.length > 0) {
      console.log(`[Catalogs] ✓ SEARCH COMPLETE - Found ${catalogUrls.length} URL(s)\n`);
      res.json({
        success: true,
        data: {
          code,
          path: catalogUrls[0], // Return first URL as primary
          paths: catalogUrls,    // Return all URLs for fallback options
          source: "supabase-storage",
        },
      });
    } else {
      console.log(`[Catalogs] ✗ SEARCH COMPLETE - Not found for code: "${code}"\n`);
      res.status(404).json({
        success: false,
        error: "Catalog not found",
      });
    }
  } catch (error) {
    console.error("[findCatalogPath] ERROR:", error);
    res.status(500).json({
      success: false,
      error: "Failed to find catalog",
    });
  }
};

/**
 * Serve catalog file for download/sharing
 * NOTE: With Supabase Storage, files are already public and accessible via direct URLs
 * This endpoint is kept for backward compatibility but redirects to the Supabase URL
 * Usage: GET /api/catalogo/file?catalogPath=filename.docx
 */
export const getCatalogFile: RequestHandler = async (req, res) => {
  try {
    const { catalogPath } = req.query;

    if (!catalogPath || typeof catalogPath !== "string") {
      res.status(400).json({
        success: false,
        error: "Catalog path is required",
      });
      return;
    }

    // Extract the filename from the path
    const fileName = path.basename(catalogPath);

    // Generate Supabase Storage URL
    const storageUrl = getCatalogStorageUrl(fileName);

    console.log(`[getCatalogFile] Redirecting to Supabase Storage: ${fileName}`);

    // Redirect to the Supabase Storage URL
    res.redirect(storageUrl);
  } catch (error) {
    console.error("Error serving catalog file:", error);
    res.status(500).json({
      success: false,
      error: "Failed to serve catalog file",
    });
  }
};
