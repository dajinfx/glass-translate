import express from "express";
import { translateTextWithModel, streamTranslateTextBlocks } from "../services/modelRouter.js";
import { validateTranslateTextPayload } from "../utils/validate.js";

export const translateTextRouter = express.Router();

translateTextRouter.post("/", async (req, res) => {
  const startedAt = Date.now();

  try {
    const payload = validateTranslateTextPayload(req.body);
    const validatedAt = Date.now();
    const result = await translateTextWithModel(payload);
    const translatedAt = Date.now();

    res.json({
      success: true,
      sourceLanguage: result.sourceLanguage || "unknown",
      targetLanguage: payload.targetLanguage,
      blocks: Array.isArray(result.blocks) ? result.blocks : [],
      timings: {
        validateMs: validatedAt - startedAt,
        modelMs: translatedAt - validatedAt,
        totalMs: translatedAt - startedAt
      }
    });
  } catch (error) {
    console.error(error);

    res.status(error.status || 500).json({
      success: false,
      errorCode: error.code || "SERVER_ERROR",
      message: error.message || "Text translation failed"
    });
  }
});

// SSE streaming endpoint
translateTextRouter.post("/stream", async (req, res) => {
  try {
    const payload = validateTranslateTextPayload(req.body);

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    // Send start event with total blocks count
    res.write(`event: start\ndata: ${JSON.stringify({ count: payload.blocks.length })}\n\n`);

    let completedCount = 0;
    const totalBlocks = payload.blocks.length;

    await streamTranslateTextBlocks(payload, (block) => {
      completedCount++;
      res.write(`event: block\ndata: ${JSON.stringify({ block, completedCount, totalBlocks })}\n\n`);
    });

    // Send complete event
    res.write(`event: complete\ndata: ${JSON.stringify({ sourceLanguage: "unknown", targetLanguage: payload.targetLanguage, blocksCount: completedCount })}\n\n`);
    res.end();
  } catch (error) {
    console.error(error);

    // Try to send error via SSE
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "Stream translation failed" })}\n\n`);
    } catch (_) {
      // ignore write errors
    }
    res.end();
  }
});
