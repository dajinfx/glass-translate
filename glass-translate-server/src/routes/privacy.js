import express from "express";

export const privacyRouter = express.Router();

privacyRouter.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Glass Translate Privacy Policy</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        color: #0f172a;
        background: #f8fafc;
        line-height: 1.65;
      }
      main {
        max-width: 820px;
        margin: 0 auto;
        padding: 48px 24px 72px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 34px;
        line-height: 1.15;
      }
      h2 {
        margin-top: 32px;
        font-size: 20px;
      }
      p, li {
        font-size: 16px;
      }
      .updated {
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Glass Translate Privacy Policy</h1>
      <p class="updated">Last updated: June 14, 2026</p>

      <h2>Overview</h2>
      <p>Glass Translate helps users translate visible text on webpages, images, PDFs, and screenshots. The extension sends only the content needed for translation to the Glass Translate API.</p>

      <h2>Data processed</h2>
      <ul>
        <li>Text selected or detected inside the Glass Translate window.</li>
        <li>Screenshots cropped to the Glass Translate window when OCR mode is used.</li>
        <li>User settings such as target language, model, and capture mode stored locally in Chrome storage.</li>
      </ul>

      <h2>How data is used</h2>
      <p>Submitted text or cropped screenshots are used only to provide translation and OCR results. The service does not sell user data and does not use submitted content for advertising.</p>

      <h2>Third-party processors</h2>
      <p>Depending on the selected mode and model, content may be processed by AI model providers such as OpenAI, DeepSeek, or Gemini through the Glass Translate API.</p>

      <h2>Data retention</h2>
      <p>Glass Translate does not intentionally store translated text or screenshots after the request is completed. Server logs may temporarily contain technical metadata required for security, debugging, and service reliability.</p>

      <h2>Contact</h2>
      <p>For privacy questions, contact the developer through the Chrome Web Store listing support channel.</p>
    </main>
  </body>
</html>`);
});
