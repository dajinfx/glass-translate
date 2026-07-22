import OpenAI from "openai";
import { buildTranslateImagePrompt } from "../prompts/translateImagePrompt.js";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

const BLOCK_START_RE = /\[\[GT_BLOCK:([^\]]+)\]\]\s*/g;
const BLOCK_END_TAG = "[[/GT_BLOCK]]";

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
 * Stream OCR in two phases:
 * 1. GPT Vision extracts layout + source text (non-streaming, required for images)
 * 2. DeepSeek translates text blocks using GT_BLOCK markers (streaming, blocks appear one by one)
 */
export async function streamGptVision(input, onBlock) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }

  // Phase 1: Extract layout + source text
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

  if (!process.env.DEEPSEEK_API_KEY) {
    // No DeepSeek key — emit blocks as-is (source text only)
    for (const block of blocks) {
      onBlock(block);
    }
    return;
  }

  // Phase 2: Stream translate via DeepSeek GT_BLOCK format
  const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  });

  // Build prompt: send all source texts with their block IDs
  const inputText = blocks
    .map((b) => `[[GT_BLOCK:${b.id}]]\n${b.sourceText}\n[[/GT_BLOCK]]`)
    .join("\n\n");

  const prompt = `Translate each block below into ${input.targetLanguage}.
Output the same number of blocks as input, each with its original [[GT_BLOCK:id]] marker.
Preserve meaningful line breaks inside each block.
Do not merge blocks. Do not skip blocks.
Return ONLY the translated blocks with markers.

Input blocks:
${inputText}

Output:`;

  const stream = await deepseek.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    stream: true
  });

  let buffer = "";
  const sentBlockIds = new Set();
  const blockLayout = new Map(blocks.map((b) => [b.id, b]));

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (!delta) continue;
    buffer += delta;

    // Scan for completed GT_BLOCKs
    let pos = 0;
    while (pos < buffer.length) {
      const startIdx = buffer.indexOf("[[GT_BLOCK:", pos);
      if (startIdx === -1) break;

      const idStart = startIdx + 12;
      const idEnd = buffer.indexOf("]]", idStart);
      if (idEnd === -1) break;

      const id = buffer.slice(idStart, idEnd).trim();
      if (!id) { pos = idEnd + 2; continue; }

      const contentStart = idEnd + 2;
      const endTag = "[[/GT_BLOCK]]";
      const tagIdx = buffer.indexOf(endTag, contentStart);
      if (tagIdx === -1) break;

      const text = buffer.slice(contentStart, tagIdx).trim();

      if (text && !sentBlockIds.has(id)) {
        sentBlockIds.add(id);
        const layout = blockLayout.get(id);
        onBlock({
          ...(layout || {}),
          id,
          translatedText: text
        });
      }

      pos = tagIdx + endTag.length;
    }
  }
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
