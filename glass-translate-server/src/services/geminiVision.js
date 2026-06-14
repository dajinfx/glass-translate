import { buildTranslateImagePrompt } from "../prompts/translateImagePrompt.js";
import { parseModelJson } from "../utils/json.js";
import { normalizeBlocks } from "../utils/normalizeBlocks.js";

export async function translateWithGeminiVision(input) {
  if (!process.env.GEMINI_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "GEMINI_API_KEY 未配置");
  }

  const { mimeType, base64 } = parseDataUrl(input.image);
  const model = process.env.GEMINI_VISION_MODEL || "gemini-1.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildTranslateImagePrompt(input) },
            {
              inlineData: {
                mimeType,
                data: base64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throwHttp(response.status, "MODEL_REQUEST_FAILED", data?.error?.message || "Gemini 请求失败");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const parsed = parseModelJson(text);

  return {
    ...parsed,
    blocks: normalizeBlocks(parsed.blocks, input.viewport)
  };
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throwHttp(400, "INVALID_IMAGE", "图片 data URL 格式错误");
  }

  return {
    mimeType: match[1],
    base64: match[2]
  };
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
