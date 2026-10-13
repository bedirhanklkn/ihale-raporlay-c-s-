const AdmZip = require("adm-zip");
const pdfParse = require("pdf-parse");

// Helper to decode windows-1254 (Turkish) or UTF-8
function decodeTurkishText(buffer) {
  try {
    const decoder = new TextDecoder("windows-1254");
    return decoder.decode(buffer);
  } catch {
    return buffer.toString("utf-8");
  }
}

// Clean HTML to readable plain text
function cleanHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<[^>]+>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&ouml;/g, "ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&uuml;/g, "ü")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&ccedil;/g, "ç")
    .replace(/&Idot;/g, "İ")
    .replace(/&inodot;/g, "ı")
    .replace(/&Scedil;/g, "Ş")
    .replace(/&scedil;/g, "ş")
    .replace(/&Gbreve;/g, "Ğ")
    .replace(/&gbreve;/g, "ğ")
    .replace(/\r/g, "")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

// Parse .doc (EKAP HTML or binary CFB)
async function parseDoc(buffer) {
  const headHex = buffer.slice(0, 4).toString("hex");
  if (headHex === "d0cf11e0") {
    // Binary DOC (CFB) - extract UTF-16LE / ASCII text chunks
    let text = "";
    let chunk = "";
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const code = buffer.readUInt16LE(i);
      if (
        (code >= 32 && code <= 126) ||
        code === 10 ||
        code === 13 ||
        (code >= 0x00c0 && code <= 0x017f)
      ) {
        chunk += String.fromCharCode(code);
      } else {
        if (chunk.length >= 4) {
          text += chunk + "\n";
        }
        chunk = "";
      }
    }
    return text.trim();
  } else {
    // HTML-based DOC (Official EKAP format)
    const raw = decodeTurkishText(buffer);
    return cleanHtml(raw);
  }
}

// Parse .docx (OpenXML zip)
async function parseDocx(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const docEntry = zip.getEntry("word/document.xml");
    if (!docEntry) return "";
    const xml = docEntry.getData().toString("utf-8");
    // Extract text from <w:t> tags
    const matches = xml.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
    const text = matches
      .map((m) => m.replace(/<[^>]+>/g, ""))
      .join(" ")
      .replace(/\s+/g, " ");
    return text.trim();
  } catch (err) {
    console.error("DOCX parse error:", err.message);
    return "";
  }
}

// Parse .pdf with timeout protection
async function parsePdf(buffer) {
  try {
    const parsePromise = pdfParse(buffer);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("PDF ayrıştırma zaman aşımı (10s)")), 10000)
    );
    const data = await Promise.race([parsePromise, timeoutPromise]);
    const raw = data.text || "";
    // Clean null bytes and weird binary artifacts
    return raw.replace(/\0/g, "").trim();
  } catch (err) {
    console.warn("PDF parse warning:", err.message);
    return "";
  }
}

// Parse a single buffer based on filename extension
async function parseBufferByExt(buffer, filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".doc")) {
    return await parseDoc(buffer);
  }
  if (lower.endsWith(".docx")) {
    return await parseDocx(buffer);
  }
  if (lower.endsWith(".pdf")) {
    return await parsePdf(buffer);
  }
  if (lower.endsWith(".txt") || lower.endsWith(".html") || lower.endsWith(".htm")) {
    return cleanHtml(decodeTurkishText(buffer));
  }
  return "";
}

// Parse a ZIP file and collect all tender documents inside
async function parseZipArchive(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const result = {
    archiveName: "İhale Dokümanı Arşivi",
    files: [],
    idariSartname: "",
    sozlesmeTasarisi: "",
    teknikSartname: "",
    otherTexts: [],
    combinedText: "",
  };

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    const lowerName = name.toLowerCase();

    // Check if it's an inner zip file (sometimes EKAP nests zips)
    if (lowerName.endsWith(".zip")) {
      const innerZipBuffer = entry.getData();
      const innerResult = await parseZipArchive(innerZipBuffer);
      result.files.push(...innerResult.files);
      if (!result.idariSartname && innerResult.idariSartname) {
        result.idariSartname = innerResult.idariSartname;
      }
      if (!result.sozlesmeTasarisi && innerResult.sozlesmeTasarisi) {
        result.sozlesmeTasarisi = innerResult.sozlesmeTasarisi;
      }
      if (!result.teknikSartname && innerResult.teknikSartname) {
        result.teknikSartname = innerResult.teknikSartname;
      }
      result.otherTexts.push(...innerResult.otherTexts);
      continue;
    }

    if (
      lowerName.endsWith(".doc") ||
      lowerName.endsWith(".docx") ||
      lowerName.endsWith(".pdf") ||
      lowerName.endsWith(".txt")
    ) {
      const fileBuffer = entry.getData();
      const text = await parseBufferByExt(fileBuffer, name);
      const fileInfo = {
        name,
        size: fileBuffer.length,
        textLength: text.length,
      };
      result.files.push(fileInfo);

      if (
        lowerName.includes("idari_sartname") ||
        lowerName.includes("idarisartname") ||
        lowerName.includes("idari sartname")
      ) {
        result.idariSartname = text;
      } else if (
        lowerName.includes("sozlesme") ||
        lowerName.includes("sozlesmetasarisi")
      ) {
        result.sozlesmeTasarisi = text;
      } else if (
        lowerName.includes("teknik") ||
        lowerName.includes("tekniksartname")
      ) {
        result.teknikSartname = text;
      } else {
        result.otherTexts.push({ name, text });
      }
    }
  }

  // Build combined text
  const parts = [];
  if (result.idariSartname) parts.push("=== İDARİ ŞARTNAME ===\n" + result.idariSartname);
  if (result.sozlesmeTasarisi) parts.push("=== SÖZLEŞME TASARISI ===\n" + result.sozlesmeTasarisi);
  if (result.teknikSartname) parts.push("=== TEKNİK ŞARTNAME ===\n" + result.teknikSartname);
  for (const ot of result.otherTexts) {
    if (ot.text && ot.text.length > 50) {
      parts.push(`=== ${ot.name} ===\n` + ot.text);
    }
  }

  result.combinedText = parts.join("\n\n");
  return result;
}

// Main parser entry point
async function parseAnyTenderFile(buffer, filename) {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".zip")) {
    return await parseZipArchive(buffer);
  }

  const singleText = await parseBufferByExt(buffer, filename);
  const result = {
    archiveName: filename,
    files: [{ name: filename, size: buffer.length, textLength: singleText.length }],
    idariSartname: "",
    sozlesmeTasarisi: "",
    teknikSartname: "",
    otherTexts: [],
    combinedText: singleText,
    rawBuffer: buffer,
    isPdf: lower.endsWith(".pdf"),
  };

  if (lower.includes("idari") || lower.includes("sartname")) {
    result.idariSartname = singleText;
  } else if (lower.includes("sozlesme")) {
    result.sozlesmeTasarisi = singleText;
  } else if (lower.includes("teknik")) {
    result.teknikSartname = singleText;
  } else {
    result.otherTexts.push({ name: filename, text: singleText });
  }

  return result;
}

module.exports = {
  parseAnyTenderFile,
  parseZipArchive,
  parseDoc,
  parseDocx,
  parsePdf,
  cleanHtml,
  decodeTurkishText,
};
