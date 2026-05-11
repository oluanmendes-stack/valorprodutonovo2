import { RequestHandler } from "express";

/**
 * Proxy images from Google Drive to bypass CORS restrictions
 * Usage: /api/proxy-google-image?url=<encoded_url>
 */
export const proxyGoogleDriveImage: RequestHandler = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    // Validate that it's a Google Drive URL
    if (!url.includes("drive.google.com") && !url.includes("googleapis.com")) {
      return res.status(400).json({ error: "Only Google Drive URLs are allowed" });
    }

    console.log(`[GoogleDriveProxy] Proxying image: ${url.substring(0, 80)}...`);

    // Fetch the image from Google Drive
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.error(
        `[GoogleDriveProxy] Failed to fetch image: ${response.status} ${response.statusText}`
      );
      return res.status(response.status).json({
        error: `Failed to fetch image: ${response.statusText}`,
      });
    }

    // Get the content type
    const contentType =
      response.headers.get("content-type") || "image/jpeg";

    // Set CORS headers to allow the response to be used in the browser
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    // Stream the image directly to the response
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

    console.log(
      `[GoogleDriveProxy] Successfully proxied image (${buffer.byteLength} bytes)`
    );
  } catch (error) {
    console.error("[GoogleDriveProxy] Error:", error);
    res
      .status(500)
      .json({
        error: "Failed to proxy image",
        message: error instanceof Error ? error.message : String(error),
      });
  }
};
