import express from "express";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FEEDBACK_TO = process.env.FEEDBACK_TO_EMAIL || "kimguangdong@gmail.com";
const FEEDBACK_FROM = process.env.FEEDBACK_FROM_EMAIL || "onboarding@resend.dev";

export const feedbackRouter = express.Router();

feedbackRouter.post("/", async (req, res) => {
  try {
    const { email, message } = normalizeFeedbackPayload(req.body);

    if (!RESEND_API_KEY) {
      throwHttp(500, "FEEDBACK_NOT_CONFIGURED", "RESEND_API_KEY is not configured");
    }

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FEEDBACK_FROM,
        to: [FEEDBACK_TO],
        reply_to: email,
        subject: "Glass Translate Feedback",
        html: buildFeedbackEmail(email, message)
      })
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Resend error:", response.status, body);
      throwHttp(502, "FEEDBACK_SEND_FAILED", "Failed to send feedback email");
    }

    const data = await response.json();

    res.json({
      success: true,
      id: data.id || null
    });
  } catch (error) {
    console.error(error);

    res.status(error.status || 500).json({
      success: false,
      errorCode: error.code || "SERVER_ERROR",
      message: error.message || "Failed to send feedback"
    });
  }
});

function normalizeFeedbackPayload(body) {
  if (!body || typeof body !== "object") {
    throwHttp(400, "INVALID_BODY", "Request body must be an object");
  }

  const email = String(body.email || "").trim();
  const message = String(body.message || "").trim();

  if (!email) {
    throwHttp(400, "EMAIL_REQUIRED", "Email is required");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwHttp(400, "INVALID_EMAIL", "Email format is invalid");
  }

  if (!message) {
    throwHttp(400, "MESSAGE_REQUIRED", "Feedback message is required");
  }

  if (message.length > 5000) {
    throwHttp(400, "MESSAGE_TOO_LONG", "Feedback message is too long");
  }

  return { email, message };
}

function buildFeedbackEmail(email, message) {
  const escapedEmail = escapeHtml(email);
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>");

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
          <h1 style="margin:0;font-size:20px;color:#0f172a;">Glass Translate Feedback</h1>
        </div>
        <div style="padding:20px 24px;">
          <p style="margin:0 0 12px;font-size:13px;color:#64748b;"><strong style="color:#334155;">From:</strong> ${escapedEmail}</p>
          <div style="margin:0;font-size:15px;line-height:1.6;color:#0f172a;white-space:normal;">${escapedMessage}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function throwHttp(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}
