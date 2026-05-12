import { RequestHandler } from "express";

/**
 * Proxy images from Google Drive to bypass CORS restrictions
 * Usage: /api/proxy-google-image?url=<encoded_url>
 */
export const proxyGoogleDriveImage: RequestHandler = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      console.error("[GoogleDriveProxy] ❌ URL parameter is required");
      return res.status(400).json({ error: "URL parameter is required" });
    }

    // Validate that it's a Google Drive URL
    if (!url.includes("drive.google.com") && !url.includes("googleapis.com")) {
      console.error(`[GoogleDriveProxy] ❌ Invalid URL domain: ${url.substring(0, 80)}`);
      return res.status(400).json({ error: "Only Google Drive URLs are allowed" });
    }

    console.log(`[GoogleDriveProxy] 🔄 Proxying image: ${url.substring(0, 100)}...`);

    // Fetch the image from Google Drive with better headers for auth
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*,*/*",
        "Referer": "https://drive.google.com/",
        "Cookie": "",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(
        `[GoogleDriveProxy] ❌ Failed to fetch image: ${response.status} ${response.statusText}`
      );
      console.error(`[GoogleDriveProxy]    Headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);
      return res.status(response.status).json({
        error: `Failed to fetch image: ${response.statusText}`,
        status: response.status,
      });
    }

    // Get the content type
    const contentType = response.headers.get("content-type") || "image/jpeg";
    console.log(`[GoogleDriveProxy] ✅ Got response: ${response.status} ${response.statusText}`);
    console.log(`[GoogleDriveProxy]    Content-Type: ${contentType}`);

    // Set CORS headers and cache headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Use Cloudflare-safe response handling: convert to buffer and use res.end()
    const buffer = await response.arrayBuffer();
    const nodeBuffer = Buffer.from(buffer);
    res.setHeader("Content-Length", nodeBuffer.length);
    res.end(nodeBuffer);

    console.log(
      `[GoogleDriveProxy] ✅ Successfully proxied image (${nodeBuffer.length} bytes)`
    );
  } catch (error) {
    console.error("[GoogleDriveProxy] ❌ Error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    res
      .status(500)
      .json({
        error: "Failed to proxy image",
        message: errorMsg,
      });
  }
};
