import OpenAI from "openai";
import { buildTranslateImagePrompt } from "../prompts/translateImagePrompt.js";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

export async function translateWithGptVision(input) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const response = await openai.responses.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-nano",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildTranslateImagePrompt(input)
          },
          {
            type: "input_image",
            image_url: input.image
          }
        ]
      }
    ],
    temperature: 0.1
  });

  const parsed = parseModelJson(response.output_text || "");
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
