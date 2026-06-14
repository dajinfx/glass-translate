export async function translateWithDeepSeek() {
  if (!process.env.DEEPSEEK_API_KEY) {
    throwHttp(500, "MODEL_NOT_CONFIGURED", "DEEPSEEK_API_KEY 未配置");
  }

  throwHttp(
    501,
    "MODEL_NOT_IMPLEMENTED",
    "DeepSeek 当前作为预留模型。若所选 DeepSeek 账号提供视觉模型，可在 deepseekVision.js 中接入；否则建议用于第二阶段文本润色。"
  );
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
