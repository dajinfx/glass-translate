const ALLOWED_MODELS = new Set(["gpt", "gemini", "deepseek"]);

export function validateTranslateImagePayload(body) {
  if (!body || typeof body !== "object") {
    throwHttp(400, "INVALID_BODY", "请求体格式错误");
  }

  if (!body.image || typeof body.image !== "string") {
    throwHttp(400, "INVALID_IMAGE", "缺少截图图片");
  }

  if (!body.image.startsWith("data:image/")) {
    throwHttp(400, "INVALID_IMAGE", "图片必须是 data:image base64 格式");
  }

  const targetLanguage = String(
    body.targetLanguage || process.env.DEFAULT_TARGET_LANGUAGE || "中文"
  ).trim();

  const model = String(body.model || process.env.DEFAULT_MODEL || "gpt").trim();
  if (!ALLOWED_MODELS.has(model)) {
    throwHttp(400, "INVALID_MODEL", "不支持的模型");
  }

  return {
    image: body.image,
    targetLanguage,
    model,
    viewport: normalizeViewport(body.viewport)
  };
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

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
