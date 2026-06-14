import express from "express";
import { translateTextWithModel } from "../services/modelRouter.js";
import { validateTranslateTextPayload } from "../utils/validate.js";

export const translateTextRouter = express.Router();

translateTextRouter.post("/", async (req, res) => {
  try {
    const payload = validateTranslateTextPayload(req.body);
    const result = await translateTextWithModel(payload);

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
      message: error.message || "Text translation failed"
    });
  }
});
