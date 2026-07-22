import express from "express";
import { translateWithModel, streamTranslateImage } from "../services/modelRouter.js";
import { validateTranslateImagePayload } from "../utils/validate.js";

export const translateImageRouter = express.Router();

translateImageRouter.post("/", async (req, res) => {
  try {
    const payload = validateTranslateImagePayload(req.body);
    const result = await translateWithModel(payload);

    res.json({
      success: true,
      sourceLanguage: result.sourceLanguage || "unknown",
      targetLanguage: payload.targetLanguage,
      blocks: Array.isArray(result.blocks) ? result.blocks : []
    });
  } catch (error) {
    console.error(error);

    res.status(error.status || 500).json({
      success: false,
      errorCode: error.code || "SERVER_ERROR",
      message: error.message || "服务器错误"
    });
  }
});

// SSE streaming endpoint for OCR/image translation
translateImageRouter.post("/stream", async (req, res) => {
  try {
    const payload = validateTranslateImagePayload(req.body);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    res.write(`event: start\ndata: ${JSON.stringify({ count: 1 })}\n\n`);

    let blockCount = 0;
    await streamTranslateImage(payload, (block) => {
      blockCount++;
      res.write(`event: block\ndata: ${JSON.stringify({ block, completedCount: blockCount, totalBlocks: 1 })}\n\n`);
    });

    res.write(`event: complete\ndata: ${JSON.stringify({ sourceLanguage: "unknown", targetLanguage: payload.targetLanguage, blocksCount: blockCount })}\n\n`);
    res.end();
  } catch (error) {
    console.error(error);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "Stream OCR translation failed" })}\n\n`);
    } catch (_) {}
    res.end();
  }
});
