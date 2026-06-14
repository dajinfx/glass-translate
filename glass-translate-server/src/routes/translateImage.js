import express from "express";
import { translateWithModel } from "../services/modelRouter.js";
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
