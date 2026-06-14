export function parseModelJson(text) {
  if (!text || typeof text !== "string") {
    throwJsonError();
  }

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        throwJsonError();
      }
    }

    throwJsonError();
  }
}

function throwJsonError() {
  const error = new Error("模型返回 JSON 解析失败");
  error.status = 502;
  error.code = "JSON_PARSE_FAILED";
  throw error;
}
