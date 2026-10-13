const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { parseAnyTenderFile } = require("./document-parser");
const {
  extractTenderDetailsFromText,
  enhanceReportWithGemini,
  answerQuestionAboutDocument,
} = require("./tender-analyzer");

const app = express();
const PORT = process.env.PORT || 3000;
const ENV_FILE_PATH = path.join(__dirname, ".env");

// Load API key from environment or .env file
let customApiKey = process.env.GEMINI_API_KEY || "";
if (!customApiKey && fs.existsSync(ENV_FILE_PATH)) {
  try {
    const envContent = fs.readFileSync(ENV_FILE_PATH, "utf8");
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match && match[1]) {
      customApiKey = match[1].trim();
    }
  } catch (err) {
    console.error("Error reading .env file:", err.message);
  }
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory session store for current document
let currentDocument = {
  filename: "",
  files: [],
  combinedText: "",
  report: null,
};

// 1. Analyze Uploaded File (ZIP, PDF, DOC, DOCX)
app.post("/api/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Lütfen bir dosya (ZIP, PDF, DOC, DOCX) yükleyin." });
    }

    const { buffer, originalname } = req.file;
    console.log(`[Upload] Analiz ediliyor: ${originalname} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    const parsed = await parseAnyTenderFile(buffer, originalname);
    let hasText = parsed.combinedText && parsed.combinedText.length >= 50;
    let report;

    if (!hasText && parsed.isPdf && customApiKey) {
      console.log(`[PDF OCR] Metin katmanı yok, Gemini doğrudan PDF multimodal analizi yapıyor...`);
      report = extractTenderDetailsFromText("", "", "", "");
      report.baslik = originalname.replace(/\.pdf$/i, "");
      try {
        report = await enhanceReportWithGemini(report, "", customApiKey, buffer, true);
      } catch (err) {
        console.warn("[Gemini AI] PDF analizi hatası:", err.message);
      }
    } else if (!hasText) {
      return res.status(400).json({
        error: parsed.isPdf
          ? "Bu PDF dosyasında seçilebilir metin bulunamadı (taranmış resim PDF olabilir). Taranmış şartnameleri yapay zekayla okumak için sağ üstten API anahtarınızı girin veya EKAP'tan indirilen orijinal ZIP paketini yükleyin."
          : "Dosya içeriğinden okunabilir şartname metni çıkarılamadı. Lütfen geçerli bir ihale dokümanı (ZIP, PDF, Word) yükleyin.",
      });
    } else {
      // Step 1: Fast deterministic regex extraction
      report = extractTenderDetailsFromText(
        parsed.combinedText,
        parsed.idariSartname,
        parsed.sozlesmeTasarisi,
        parsed.teknikSartname
      );

      // Step 2: If Gemini key is set, perform deep AI analysis safely
      if (customApiKey) {
        console.log(`[Gemini AI] Doküman yapay zeka ile analiz ediliyor... (Anahtar mevcut)`);
        try {
          report = await enhanceReportWithGemini(report, parsed.combinedText, customApiKey, buffer, parsed.isPdf);
        } catch (err) {
          console.warn("[Gemini AI] Analiz atlandı, kural bazlı rapor kullanılıyor:", err.message);
        }
      } else {
        console.log(`[Bilgi] Gemini API anahtarı girilmedi. Standart kural bazlı rapor oluşturuldu.`);
      }
    }

    currentDocument = {
      filename: originalname,
      files: parsed.files || [],
      combinedText: parsed.combinedText || (report.baslik + " " + (report.cerceve ? report.cerceve.konu : "")),
      report,
      rawBuffer: buffer,
      isPdf: parsed.isPdf,
    };

    res.json({
      success: true,
      filename: originalname,
      filesCount: parsed.files.length,
      files: parsed.files.map((f) => ({ name: f.name, size: f.size })),
      report,
      hasAiKey: Boolean(customApiKey),
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Analiz sırasında hata oluştu: " + err.message });
  }
});

// 2. Ask question to current document (with multi-turn conversation support)
app.post("/api/chat", async (req, res) => {
  try {
    const { question, history } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Lütfen bir soru yazın." });
    }

    if (!currentDocument.combinedText && !currentDocument.rawBuffer) {
      return res.status(400).json({ error: "Henüz bir ihale dokümanı yüklenmedi." });
    }

    const answer = await answerQuestionAboutDocument(
      question.trim(),
      currentDocument.combinedText,
      customApiKey,
      history || [],
      currentDocument.rawBuffer,
      currentDocument.isPdf
    );

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: "Soru yanıtlanırken hata oluştu: " + err.message });
  }
});

// 3. API Key Configuration
app.get("/api/settings", (req, res) => {
  res.json({ hasApiKey: Boolean(customApiKey) });
});

app.post("/api/settings", (req, res) => {
  const { apiKey } = req.body;
  customApiKey = (apiKey || "").trim();

  // Save to .env file for persistence
  try {
    fs.writeFileSync(ENV_FILE_PATH, `GEMINI_API_KEY=${customApiKey}\n`, "utf8");
    console.log(`[Ayarlar] Gemini API anahtarı kaydedildi (${customApiKey ? "Dolu" : "Boş"}).`);
  } catch (err) {
    console.error("Error writing .env file:", err.message);
  }

  res.json({ success: true, hasApiKey: Boolean(customApiKey) });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`İhale Raporlayıcı sunucusu http://localhost:${PORT} üzerinde çalışıyor.`);
    if (customApiKey) {
      console.log(`[Durum] Gemini AI entegrasyonu AKTİF.`);
    } else {
      console.log(`[Durum] Gemini API anahtarı henüz eklenmedi. Arayüzden veya .env dosyasından ekleyebilirsiniz.`);
    }
  });
}

module.exports = app;
