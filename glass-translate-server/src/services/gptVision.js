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

/**
 * Stream OCR translation:
 * Uses non-streaming GPT Vision (always faster than streaming for image tasks)
 * then emits all resulting blocks at once. The perceived speed comes from
 * the text-mode streaming; OCR is inherently a single-shot operation since
 * the model reads the entire image before producing any output.
 */
export async function streamGptVision(input, onBlock) {
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
  const blocks = normalizeBlocks(parsed.blocks, input.viewport);

  // Emit all blocks at once (OCR is inherently single-shot)
  for (const block of blocks) {
    onBlock(block);
  }
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
