import OpenAI from "openai";
import { buildTranslateImagePrompt } from "../prompts/translateImagePrompt.js";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

const BLOCK_PARSER = /\[\[GT_BLOCK:([^\]]+)\]\]([\s\S]*?)\[\[\/GT_BLOCK\]\]/g;

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

  const blocks = parseBlocksFromMarkers(response.output_text || "");
  return {
    sourceLanguage: "unknown",
    targetLanguage: input.targetLanguage,
    blocks: normalizeBlocks(blocks, input.viewport)
  };
}

export async function streamGptVision(input, onBlock) {
  if (!process.env.OPENAI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "OPENAI_API_KEY is not configured");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const stream = await openai.responses.create({
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
    temperature: 0.1,
    stream: true
  });

  let buffer = "";
  const sentBlockIds = new Set();

  for await (const event of stream) {
    const delta = event?.type === "response.output_text.delta" ? (event.delta || "") : "";
    if (!delta) continue;

    buffer += delta;

    // Extract completed blocks
    let match;
    while ((match = BLOCK_PARSER.exec(buffer)) !== null) {
      const id = match[1].trim();
      const metaAndText = match[2].trim();
      if (!id || sentBlockIds.has(id)) continue;
      sentBlockIds.add(id);

      const pipeIdx = metaAndText.indexOf("|");
      let translatedText = metaAndText;
      const meta = {};

      if (pipeIdx > 0) {
        const metaStr = metaAndText.slice(0, pipeIdx);
        translatedText = metaAndText.slice(pipeIdx + 1).trim();
        // Parse meta: x:12,y:8,w:200,h:24,fs:16,lh:22,align:left
        for (const pair of metaStr.split(",")) {
          const [key, val] = pair.split(":");
          if (key && val) meta[key.trim()] = val.trim();
        }
      }

      onBlock({
        id,
        translatedText,
        x: Number(meta.x) || 0,
        y: Number(meta.y) || 0,
        width: Number(meta.w) || 120,
        height: Number(meta.h) || 24,
        fontSize: Number(meta.fs) || 16,
        lineHeight: Number(meta.lh) || 22,
        align: meta.align || "left"
      });
    }
  }
}

function parseBlocksFromMarkers(text) {
  const blocks = [];
  let match;
  while ((match = BLOCK_PARSER.exec(text)) !== null) {
    const id = match[1].trim();
    const metaAndText = match[2].trim();
    if (!id) continue;

    const pipeIdx = metaAndText.indexOf("|");
    let translatedText = metaAndText;
    const meta = {};

    if (pipeIdx > 0) {
      const metaStr = metaAndText.slice(0, pipeIdx);
      translatedText = metaAndText.slice(pipeIdx + 1).trim();
      for (const pair of metaStr.split(",")) {
        const [key, val] = pair.split(":");
        if (key && val) meta[key.trim()] = val.trim();
      }
    }

    blocks.push({
      id,
      sourceText: translatedText,
      translatedText,
      x: Number(meta.x) || 0,
      y: Number(meta.y) || 0,
      width: Number(meta.w) || 120,
      height: Number(meta.h) || 24,
      fontSize: Number(meta.fs) || 16,
      lineHeight: Number(meta.lh) || 22,
      align: meta.align || "left"
    });
  }
  return blocks;
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
