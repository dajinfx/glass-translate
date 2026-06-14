const ALLOWED_MODELS = new Set(["gpt", "gemini", "deepseek"]);

export function validateTranslateImagePayload(body) {
  if (!body || typeof body !== "object") {
    throwHttp(400, "INVALID_BODY", "Request body must be an object");
  }

  if (!body.image || typeof body.image !== "string") {
    throwHttp(400, "INVALID_IMAGE", "Image is required");
  }

  if (!body.image.startsWith("data:image/")) {
    throwHttp(400, "INVALID_IMAGE", "Image must be a data:image base64 string");
  }

  return {
    image: body.image,
    targetLanguage: normalizeTargetLanguage(body.targetLanguage),
    model: normalizeModel(body.model),
    viewport: normalizeViewport(body.viewport)
  };
}

export function validateTranslateTextPayload(body) {
  if (!body || typeof body !== "object") {
    throwHttp(400, "INVALID_BODY", "Request body must be an object");
  }

  if (!Array.isArray(body.blocks)) {
    throwHttp(400, "INVALID_BLOCKS", "Text blocks are required");
  }

  const blocks = body.blocks
    .map(normalizeTextBlock)
    .filter((block) => block.sourceText)
    .slice(0, 120);

  if (!blocks.length) {
    throwHttp(400, "INVALID_BLOCKS", "No text blocks to translate");
  }

  return {
    blocks,
    targetLanguage: normalizeTargetLanguage(body.targetLanguage),
    model: normalizeModel(body.model),
    viewport: normalizeViewport(body.viewport)
  };
}

function normalizeTextBlock(block, index) {
  const sourceText = String(block?.sourceText || block?.text || "").trim();

  return {
    id: String(block?.id || `block_${index + 1}`),
    sourceText,
    x: toNumber(block?.x, 0),
    y: toNumber(block?.y, 0),
    width: toNumber(block?.width, 120),
    height: toNumber(block?.height, 24),
    fontSize: toNumber(block?.fontSize, 16),
    lineHeight: toNumber(block?.lineHeight, 22),
    align: normalizeAlign(block?.align)
  };
}

function normalizeTargetLanguage(value) {
  return String(value || process.env.DEFAULT_TARGET_LANGUAGE || "English").trim();
}

function normalizeModel(value) {
  const model = String(value || process.env.DEFAULT_MODEL || "deepseek").trim();
  if (!ALLOWED_MODELS.has(model)) {
    throwHttp(400, "INVALID_MODEL", "Unsupported model");
  }
  return model;
}

function normalizeViewport(viewport) {
  if (!viewport || typeof viewport !== "object") return null;

  const width = Number(viewport.width);
  const height = Number(viewport.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

function normalizeAlign(align) {
  if (["left", "center", "right", "justify"].includes(align)) return align;
  return "left";
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
