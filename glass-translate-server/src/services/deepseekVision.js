import OpenAI from "openai";
import { buildTranslateImagePrompt } from "../prompts/translateImagePrompt.js";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

export async function translateWithDeepSeek(input) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "DEEPSEEK_API_KEY is not configured");
  }

  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });

  const response = await deepseek.chat.completions.create({
    model: process.env.DEEPSEEK_VISION_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildTranslateImagePrompt(input) },
          {
            type: "image_url",
            image_url: {
              url: input.image
            }
          }
        ]
      }
    ],
    temperature: 0.1
  });

  const text = response.choices?.[0]?.message?.content || "";
  const parsed = parseModelJson(text);

  return {
    ...parsed,
    blocks: normalizeBlocks(parsed.blocks, input.viewport)
  };
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
