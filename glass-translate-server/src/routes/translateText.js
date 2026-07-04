import express from "express";
import { translateTextWithModel } from "../services/modelRouter.js";
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
