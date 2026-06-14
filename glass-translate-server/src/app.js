import "dotenv/config";
import express from "express";
import cors from "cors";
import { translateImageRouter } from "./routes/translateImage.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const maxImageSizeMb = Number(process.env.MAX_IMAGE_SIZE_MB || 8);

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: `${maxImageSizeMb}mb` }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/translate-image", translateImageRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    errorCode: "NOT_FOUND",
    message: "接口不存在"
  });
});

app.listen(port, () => {
  console.log(`Glass Translate server running on http://localhost:${port}`);
});
