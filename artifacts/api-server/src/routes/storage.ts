import { Readable } from "node:stream";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const acceptedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

router.post(
  "/storage/uploads/request-url",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, size, contentType } = parsed.data;
    if (!acceptedImageTypes.has(contentType)) {
      res.status(400).json({ error: "Choose a JPG, PNG, WebP, or AVIF image." });
      return;
    }
    if (size > 5 * 1024 * 1024) {
      res.status(400).json({ error: "Images must be 5 MB or smaller." });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Failed to create an image upload URL");
      res.status(500).json({ error: "Image upload is temporarily unavailable." });
    }
  },
);

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  const raw = req.params.path;
  const path = Array.isArray(raw) ? raw.join("/") : raw;
  if (!/^uploads\/[0-9a-f-]{36}$/i.test(path)) {
    res.status(404).json({ error: "Image not found." });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(
      `/objects/${path}`,
    );
    const [metadata] = await objectFile.getMetadata();
    const contentType = metadata.contentType?.split(";")[0]?.trim().toLowerCase();
    if (!contentType || !acceptedImageTypes.has(contentType)) {
      res.status(404).json({ error: "Image not found." });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile, 31_536_000);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Image not found." });
      return;
    }
    req.log.error({ err: error }, "Failed to serve an uploaded image");
    res.status(500).json({ error: "Image could not be loaded." });
  }
});

export default router;
