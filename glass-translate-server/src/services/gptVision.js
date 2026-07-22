import OpenAI from "openai";
import { buildTranslateImagePrompt } from "../prompts/translateImagePrompt.js";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

const DEEPSEEK_BLOCK_RE = /\[\[GT_BLOCK:([^\]]+)\]\]([\s\S]*?)\[\[\/GT_BLOCK\]\]/g;

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
 * Stream OCR translation in two phases:
 * 1. Non-streaming GPT Vision to extract layout + source text
 * 2. Streaming DeepSeek via GT_BLOCK markers for incremental block translation
 */
export async function streamGptVision(input, onBlock) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }

  // Phase 1: Extract layout + source text via GPT Vision (non-streaming)
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

  if (!blocks.length) return;

  // Phase 2: Send all blocks to DeepSeek in one request, stream GT_BLOCK output
  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });

  const blockList = blocks.map((b) => `[[GT_BLOCK:${b.id}]]${b.sourceText}[[/GT_BLOCK]]`);
  const prompt = `Translate each of the following text blocks to ${input.targetLanguage}.
Preserve the [[GT_BLOCK:id]] and [[/GT_BLOCK]] markers exactly.
Translate the text between the markers.
Do not add any text outside the markers. Do not explain.

Source blocks:
${blockList.join("\n")}

Translated blocks (keep markers):`;

  const stream = await deepseek.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    stream: true
  });

  let buffer = "";
  const sentBlockIds = new Set();

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (!delta) continue;
    buffer += delta;

    // Find completed blocks
    let match;
    DEEPSEEK_BLOCK_RE.lastIndex = 0;
    while ((match = DEEPSEEK_BLOCK_RE.exec(buffer)) !== null) {
      const id = match[1].trim();
      const text = match[2].trim();
      if (!id || sentBlockIds.has(id)) continue;
      sentBlockIds.add(id);

      // Find the original block for layout data
      const original = blocks.find((b) => b.id === id);
      onBlock({
        ...(original || {}),
        id,
        translatedText: text
      });
    }
  }
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
