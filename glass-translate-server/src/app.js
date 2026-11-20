import "dotenv/config";
import express from "express";
import cors from "cors";
import { translateImageRouter } from "./routes/translateImage.js";
import { translateTextRouter } from "./routes/translateText.js";
import { privacyRouter } from "./routes/privacy.js";
import { feedbackRouter } from "./routes/feedback.js";
import { generateDetailRouter } from "./routes/generateDetail.js";
import { extractProductRouter } from "./routes/extractProduct.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const maxImageSizeMb = Number(process.env.MAX_IMAGE_SIZE_MB || 8);

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: `${maxImageSizeMb}mb` }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/translate-image", translateImageRouter);
app.use("/api/translate-text", translateTextRouter);
app.use("/api/generate-detail", generateDetailRouter);
app.use("/api/extract", extractProductRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/privacy", privacyRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    errorCode: "NOT_FOUND",
    message: "Route not found"
  });
});

app.listen(port, () => {
  console.log(`Glass Translate server running on http://localhost:${port}`);
});
