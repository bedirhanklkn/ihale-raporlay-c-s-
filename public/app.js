// DOM Elements
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const uploadSection = document.getElementById("upload-section");
const loadingState = document.getElementById("loading-state");
const loaderStatus = document.getElementById("loader-status");
const reportSection = document.getElementById("report-section");
const reportContent = document.getElementById("report-content");
const activeFilename = document.getElementById("active-filename");
const btnNewUpload = document.getElementById("btn-new-upload");
const btnCopyMarkdown = document.getElementById("btn-copy-markdown");
const btnPrintReport = document.getElementById("btn-print-report");
const apiWarningBanner = document.getElementById("api-warning-banner");

// Q&A Chat Elements
const qaInput = document.getElementById("qa-input");
const btnQaSubmit = document.getElementById("btn-qa-submit");
const qaChatStream = document.getElementById("qa-chat-stream");
const qaTyping = document.getElementById("qa-typing");
const btnClearChat = document.getElementById("btn-clear-chat");
const chipButtons = document.querySelectorAll(".chip-btn");

let chatHistory = [];

// Modal Elements
const btnApiKey = document.getElementById("btn-api-key");
const apiModal = document.getElementById("api-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnSaveKey = document.getElementById("btn-save-key");
const inputApiKey = document.getElementById("input-api-key");
const apiStatusIndicator = document.getElementById("api-status-indicator");
const btnOpenApiFromBanner = document.getElementById("btn-open-api-from-banner");

let currentReportData = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupDragAndDrop();
  setupEventListeners();
  checkApiSettings();
});

function setupEventListeners() {
  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileSelect);
  btnNewUpload.addEventListener("click", resetToUpload);
  btnCopyMarkdown.addEventListener("click", copyMarkdownReport);
  btnPrintReport.addEventListener("click", () => window.print());

  btnQaSubmit.addEventListener("click", handleQaSubmit);
  qaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleQaSubmit();
  });

  // Quick question chip buttons
  chipButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.getAttribute("data-q");
      if (q) {
        qaInput.value = q;
        handleQaSubmit();
      }
    });
  });

  if (btnClearChat) {
    btnClearChat.addEventListener("click", clearChatStream);
  }

  // Modal
  btnApiKey.addEventListener("click", () => apiModal.classList.remove("hidden"));
  btnCloseModal.addEventListener("click", () => apiModal.classList.add("hidden"));
  btnSaveKey.addEventListener("click", saveApiKey);
  btnOpenApiFromBanner.addEventListener("click", () => apiModal.classList.remove("hidden"));
}

function setupDragAndDrop() {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-active");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-active");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  });
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    uploadFile(e.target.files[0]);
  }
}

// Upload file to /api/analyze with real-time progress
function uploadFile(file) {
  const isZip = file.name.toLowerCase().endsWith(".zip");
  const isPdf = file.name.toLowerCase().endsWith(".pdf");
  const totalMb = (file.size / 1024 / 1024).toFixed(1);

  showLoading(
    `"${file.name}" (${totalMb} MB) yükleniyor...`,
    isZip
      ? "Dosya sunucuya aktarılıyor, ardından şartname maddeleri hızla ayıklanacak..."
      : isPdf
      ? "PDF şartname aktarılıyor ve yapay zeka ile incelenecek..."
      : "Şartname dokümanı aktarılıyor..."
  );

  const progressContainer = document.getElementById("upload-progress-container");
  const progressBar = document.getElementById("upload-progress-bar");
  const progressText = document.getElementById("upload-progress-text");

  if (progressContainer) {
    progressContainer.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressText.textContent = `%0 Yüklendi (0 MB / ${totalMb} MB)`;
  }

  const formData = new FormData();
  formData.append("file", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/analyze", true);

  // Real-time upload progress event
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable && progressContainer) {
      const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
      const loadedMb = (e.loaded / 1024 / 1024).toFixed(1);
      progressBar.style.width = `${percent}%`;
      progressText.textContent = `%${percent} Yüklendi (${loadedMb} MB / ${totalMb} MB)`;

      if (percent >= 100) {
        loaderStatus.textContent = "Şartnameler Ayıklanıyor ve Analiz Ediliyor...";
        document.getElementById("loader-substatus").textContent =
          "İdari şartname, sözleşme tasarısı ve teminat maddeleri hızla taranıyor...";
        progressText.textContent = "Dosya sunucuya aktarıldı. Akıllı analiz yapılıyor...";
      }
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.error) throw new Error(data.error);
        renderReport(data.report, file.name);
      } catch (err) {
        alert("⚠️ " + err.message);
        resetToUpload();
      }
    } else {
      let errMsg = "Sunucu hatası oluştu.";
      try {
        const errJson = JSON.parse(xhr.responseText);
        if (errJson.error) errMsg = errJson.error;
      } catch (e) {
        errMsg = `Hata (${xhr.status}): ${xhr.statusText}`;
      }
      alert("⚠️ " + errMsg);
      resetToUpload();
    }
  };

  xhr.onerror = () => {
    alert("⚠️ Sunucuya bağlanırken ağ hatası oluştu. Lütfen bağlantınızı kontrol edin.");
    resetToUpload();
  };

  xhr.send(formData);
}

function showLoading(status, substatus) {
  uploadSection.classList.add("hidden");
  reportSection.classList.add("hidden");
  loadingState.classList.remove("hidden");
  loaderStatus.textContent = status;
  document.getElementById("loader-substatus").textContent = substatus;
}

function resetToUpload() {
  uploadSection.classList.remove("hidden");
  loadingState.classList.add("hidden");
  reportSection.classList.add("hidden");
  fileInput.value = "";
  currentReportData = null;
  const progressContainer = document.getElementById("upload-progress-container");
  if (progressContainer) progressContainer.classList.add("hidden");
  clearChatStream();
  qaInput.value = "";
}

// Render Report Matching User's Exact Format
function renderReport(report, filename) {
  currentReportData = report;
  loadingState.classList.add("hidden");
  reportSection.classList.remove("hidden");
  activeFilename.textContent = `📄 ${filename}`;

  const c = report.cerceve || {};
  const t = report.teminatlar || {};
  const ff = report.fiyatFarki || {};

  let html = `
    <!-- Header Block -->
    <div class="report-title-card">
      <div class="report-badge-row">
        <span class="badge-ikn">İKN: ${report.ikn || "Belirtilmemiş"}</span>
        <span class="badge-pill">${report.usul || "Açık İhale"}</span>
        <span class="badge-pill">${report.tur || "Hizmet Alımı"}</span>
      </div>
      <h2 class="report-main-heading">Rapor: ${report.baslik || "İhale İdari Şartnamesi"}</h2>

      <div class="meta-grid">
        <div>
          <div class="meta-item-label">İDARE / KURUM</div>
          <div class="meta-item-value">🏛️ ${report.idare || "Belirtilmemiş"}</div>
        </div>
        <div>
          <div class="meta-item-label">İHALE TARİHİ VE SAATİ</div>
          <div class="meta-item-value">⏰ ${report.ihaleTarihi || "Belirtilmemiş"}</div>
        </div>
        <div>
          <div class="meta-item-label">TEKLİF ŞEKLİ</div>
          <div class="meta-item-value">💻 Yalnızca EKAP e-Teklif</div>
        </div>
        ${report.telefon ? `
        <div>
          <div class="meta-item-label">İLETİŞİM / TELEFON</div>
          <div class="meta-item-value">📞 ${report.telefon}</div>
        </div>` : ""}
      </div>
    </div>

    <!-- 1. Genel Çerçeve -->
    <div class="report-section-block">
      <h3 class="section-heading">📌 Genel Çerçeve</h3>
      <ul class="bullet-list">
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Konu:</strong> ${c.konu || "Belirtilmemiş"}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Yer:</strong> ${c.yer || "İdare sınırları içerisinde"}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Teklif türü:</strong> ${c.teklifTuru || "Birim fiyat"}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Kazanan:</strong> ${c.kazananKriteri || "En düşük fiyat"}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Elektronik eksiltme:</strong> ${c.elektronikEksiltme || "Yapılmaz"}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Sınır değer katsayısı (R):</strong> <span style="color: #f59e0b; font-weight: 700;">${c.rKatsayisi || "Belirtilmemiş"}</span></div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Teklif geçerlilik süresi:</strong> ${c.teklifGecerlilik || "Belirtilmemiş"}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Dokümana erişim:</strong> ${c.dokumanErisim || "EKAP üzerinden"}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Açıklama talebi:</strong> ${c.aciklamaTalebi || "İhaleden 20 gün önce"}</div></li>
      </ul>
    </div>

    <!-- 1.1 Teklif İçin Gerekli Belgeler & Kontrol Listesi -->
    ${(report.gerekliBelgeler || []).length > 0 ? `
    <div class="report-section-block">
      <h3 class="section-heading">📋 İhalede İstenen Belgeler & Teklif Kontrol Listesi</h3>
      <p style="font-size: 13.5px; color: var(--text-muted); margin-bottom: 12px;">
        Teklif dosyanızı hazırlarken aşağıdaki zorunlu ve tamamlayıcı belgelerin eksiksiz olduğundan emin olun:
      </p>
      <div class="checklist-container">
        ${report.gerekliBelgeler.map((b, idx) => `
          <div class="checklist-item">
            <input type="checkbox" id="check-doc-${idx}" class="checklist-checkbox">
            <div class="checklist-body">
              <div class="checklist-title-row">
                <label for="check-doc-${idx}" class="checklist-doc-name" style="cursor: pointer;">${b.belge}</label>
                <span class="badge-tag ${b.zorunlu !== false ? 'badge-required' : 'badge-optional'}">
                  ${b.zorunlu !== false ? 'Zorunlu' : 'Koşullu'}
                </span>
              </div>
              <div class="checklist-desc">${b.aciklama || ''}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>` : ""}

    <!-- 2. Katılım Şartları ve Yeterlik Kriterleri (Tablo) -->
    <div class="report-section-block">
      <h3 class="section-heading">📊 Katılım Şartları ve Yeterlik Kriterleri</h3>
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 45%;">Kriter</th>
              <th style="width: 55%;">Şart</th>
            </tr>
          </thead>
          <tbody>
            ${(report.yeterlikKriterleri || []).map((k) => `
              <tr>
                <td><strong>${k.kriter}</strong></td>
                <td>${k.sart}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      ${(report.yeterlikNotlari || []).length > 0 ? `
        <ul class="bullet-list" style="margin-top: 14px;">
          ${report.yeterlikNotlari.map((n) => `
            <li class="bullet-item"><span class="bullet-dot">•</span><div>${n}</div></li>
          `).join("")}
        </ul>
      ` : ""}
    </div>

    <!-- 3. Teminatlar -->
    <div class="report-section-block">
      <h3 class="section-heading">🏦 Teminatlar</h3>
      <ul class="bullet-list">
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Geçici teminat:</strong> ${t.geciciTeminat || "Teklif bedelinin %3'ü."} ${t.geciciTeminatTarih || ""}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Kesin teminat:</strong> ${t.kesinTeminat || "Sözleşme bedelinin %6'sı."}</div></li>
        <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>Aşırı düşük teklif:</strong> ${t.asiriDusuk || "Sınır değerin altındaki tekliflerden yazılı açıklama istenir."}</div></li>
      </ul>
    </div>

    <!-- 4. Sözleşme Süreci -->
    <div class="report-section-block">
      <h3 class="section-heading">📜 Sözleşme Süreci</h3>
      <ul class="bullet-list">
        ${(report.sozlesmeSureci || []).map((s) => `
          <li class="bullet-item"><span class="bullet-dot">•</span><div>${s}</div></li>
        `).join("")}
      </ul>
    </div>

    <!-- 5. Fiyata Dahil Giderler -->
    <div class="report-section-block">
      <h3 class="section-heading">💼 Fiyata Dahil Giderler</h3>
      <ul class="bullet-list">
        ${(report.fiyataDahilGiderler || []).map((g) => `
          <li class="bullet-item"><span class="bullet-dot">•</span><div>${g}</div></li>
        `).join("")}
      </ul>
    </div>

    <!-- 6. Fiyat Farkı -->
    <div class="report-section-block">
      <h3 class="section-heading">📈 Fiyat Farkı</h3>
      <p style="font-size: 14px; margin-bottom: 10px;">
        <strong>${ff.verilirMi || "Fiyat farkı verilir."}</strong> Formül: <code>${ff.formul || "F = An × B × (Pn − 1)"}</code>
      </p>
      ${(ff.katsayilar || []).length > 0 ? `
        <ul class="bullet-list">
          ${ff.katsayilar.map((k) => `
            <li class="bullet-item"><span class="bullet-dot">•</span><div><strong>${k.kod}:</strong> ${k.deger} (${k.aciklama})</div></li>
          `).join("")}
        </ul>
      ` : ""}
    </div>

    <!-- 7. Ek Bilgiler -->
    ${(report.ekBilgiler || []).length > 0 ? `
    <div class="report-section-block">
      <h3 class="section-heading">🚜 Ek: Personel ve Araç Listesi</h3>
      <ul class="bullet-list">
        ${report.ekBilgiler.map((e) => `
          <li class="bullet-item"><span class="bullet-dot">•</span><div>${e}</div></li>
        `).join("")}
      </ul>
    </div>` : ""}

    <!-- 8. DİKKAT ÇEKEN NOKTALAR (Çelişkiler, Hatalar, Riskler) -->
    <div class="report-section-block">
      <h3 class="section-heading" style="color: #f87171;">🚨 Dikkat Çeken Noktalar ve Çelişkiler</h3>
      <div class="alerts-grid">
        ${(report.dikkatCekenNoktalar || []).map((d) => `
          <div class="alert-card ${d.derece || "onemli"}">
            <div class="alert-header">
              <span class="alert-title">⚠️ ${d.baslik}</span>
            </div>
            <p class="alert-desc">${d.aciklama}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  reportContent.innerHTML = html;
  reportSection.scrollIntoView({ behavior: "smooth" });
}

// Copy Markdown Format to Clipboard
function copyMarkdownReport() {
  if (!currentReportData) return;
  const r = currentReportData;
  const c = r.cerceve || {};
  const t = r.teminatlar || {};
  const ff = r.fiyatFarki || {};

  let md = `# Rapor: ${r.baslik}

**İdare:** ${r.idare}
**İhale kayıt no:** ${r.ikn}, ${r.usul}, ${r.tur}
**İhale tarihi:** ${r.ihaleTarihi}. Teklifler yalnızca EKAP üzerinden e-teklif olarak verilir.

## Genel çerçeve
- **Konu:** ${c.konu}
- **Yer:** ${c.yer}
- **Teklif türü:** ${c.teklifTuru}
- **Kazanan:** ${c.kazananKriteri}
- **Elektronik eksiltme:** ${c.elektronikEksiltme}
- **Sınır değer katsayısı (R):** ${c.rKatsayisi}
- **Teklif geçerlilik süresi:** ${c.teklifGecerlilik}
- **Dokümana erişim:** ${c.dokumanErisim}
- **Açıklama talebi:** ${c.aciklamaTalebi}

${(r.gerekliBelgeler || []).length > 0 ? `## Teklif için gerekli belgeler (Kontrol Listesi)
${r.gerekliBelgeler.map((b) => `- [ ] **${b.belge}:** ${b.aciklama || ''} (${b.zorunlu !== false ? 'Zorunlu' : 'Koşullu'})`).join("\n")}
` : ""}
## Katılım şartları ve yeterlik kriterleri
| Kriter | Şart |
| :--- | :--- |
${(r.yeterlikKriterleri || []).map((k) => `| ${k.kriter} | ${k.sart} |`).join("\n")}

${(r.yeterlikNotlari || []).map((n) => `- ${n}`).join("\n")}

## Teminatlar
- **Geçici teminat:** ${t.geciciTeminat} ${t.geciciTeminatTarih || ""}
- **Kesin teminat:** ${t.kesinTeminat}
- **Aşırı düşük teklif:** ${t.asiriDusuk}

## Sözleşme süreci
${(r.sozlesmeSureci || []).map((s) => `- ${s}`).join("\n")}

## Fiyata dahil giderler
${(r.fiyataDahilGiderler || []).map((g) => `- ${g}`).join("\n")}

## Fiyat farkı
${ff.verilirMi} Formül: ${ff.formul}
${(ff.katsayilar || []).map((k) => `- **${k.kod}:** ${k.deger} (${k.aciklama})`).join("\n")}

## Ek: personel ve araç listesi
${(r.ekBilgiler || []).map((e) => `- ${e}`).join("\n")}

## Dikkat çeken noktalar
${(r.dikkatCekenNoktalar || []).map((d) => `### ${d.baslik}\n${d.aciklama}`).join("\n\n")}
`;

  navigator.clipboard.writeText(md).then(() => {
    const originalText = btnCopyMarkdown.textContent;
    btnCopyMarkdown.textContent = "✅ Kopyalandı!";
    btnCopyMarkdown.style.borderColor = "var(--accent-500)";
    setTimeout(() => {
      btnCopyMarkdown.textContent = originalText;
      btnCopyMarkdown.style.borderColor = "";
    }, 2000);
  });
}

// =========================================================
// Conversational AI Q&A Assistant Logic
// =========================================================

function formatMarkdown(text) {
  if (window.marked && typeof window.marked.parse === "function") {
    return marked.parse(text);
  }
  return text
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function scrollChatToBottom() {
  if (qaChatStream) {
    qaChatStream.scrollTop = qaChatStream.scrollHeight;
  }
}

function appendUserMessage(text) {
  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-msg msg-user";
  msgDiv.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-content">
      <div class="msg-sender">Siz</div>
      <div class="msg-text">${escapeHtml(text)}</div>
    </div>
  `;
  qaChatStream.appendChild(msgDiv);
}

function appendAiMessage(markdownText) {
  const msgDiv = document.createElement("div");
  msgDiv.className = "chat-msg msg-ai";
  msgDiv.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-content">
      <div class="msg-sender">İhale Danışmanı AI</div>
      <div class="msg-text">${formatMarkdown(markdownText)}</div>
    </div>
  `;
  qaChatStream.appendChild(msgDiv);
}

function clearChatStream() {
  chatHistory = [];
  if (qaChatStream) {
    qaChatStream.innerHTML = `
      <div class="chat-msg msg-ai">
        <div class="msg-avatar">🤖</div>
        <div class="msg-content">
          <div class="msg-sender">İhale Danışmanı AI</div>
          <div class="msg-text">
            Merhaba! Yüklediğiniz ihale şartnamesini ve sözleşme tasarısını 4734 sayılı Kamu İhale Mevzuatı çerçevesinde ayrıntılı olarak inceledim.
            <br><br>
            Merak ettiğiniz <strong>cezai şartlar, birim fiyat cetveli, gerekli belgeler, aşırı düşük savunması, yakıt/fiyat farkı</strong> veya herhangi bir özel madde hakkında yukarıdaki hızlı sorulardan birine tıklayabilir ya da sorunuzu serbestçe yazabilirsiniz.
          </div>
        </div>
      </div>
    `;
  }
}

// Ask question about document with conversational memory
async function handleQaSubmit() {
  const q = qaInput.value.trim();
  if (!q) return;

  appendUserMessage(q);
  qaInput.value = "";
  qaInput.disabled = true;
  btnQaSubmit.disabled = true;
  qaTyping.classList.remove("hidden");
  scrollChatToBottom();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        history: chatHistory,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    appendAiMessage(data.answer);

    // Save turn to chat history
    chatHistory.push({ role: "user", text: q });
    chatHistory.push({ role: "model", text: data.answer });
  } catch (err) {
    appendAiMessage("⚠️ **Hata:** " + err.message);
  } finally {
    qaTyping.classList.add("hidden");
    qaInput.disabled = false;
    btnQaSubmit.disabled = false;
    qaInput.focus();
    scrollChatToBottom();
  }
}

// Check API key setting
async function checkApiSettings() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (data.hasApiKey) {
      btnApiKey.textContent = "⚡ Gemini Aktif";
      btnApiKey.style.color = "var(--accent-500)";
      apiWarningBanner.classList.add("hidden");
    } else {
      apiWarningBanner.classList.remove("hidden");
    }
  } catch (e) {
    // ignore
  }
}

// Save API Key
async function saveApiKey() {
  const key = inputApiKey.value.trim();
  if (!key) {
    alert("Lütfen geçerli bir API anahtarı girin.");
    return;
  }

  btnSaveKey.disabled = true;
  btnSaveKey.textContent = "Kaydediliyor...";

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: key }),
    });
    const data = await res.json();
    if (data.success) {
      apiModal.classList.add("hidden");
      apiStatusIndicator.textContent = "";
      checkApiSettings();
      alert("✅ API anahtarı kaydedildi ve aktifleştirildi!");
    }
  } catch (e) {
    alert("Kaydedilemedi: " + e.message);
  } finally {
    btnSaveKey.disabled = false;
    btnSaveKey.textContent = "Kaydet ve Aktifleştir";
  }
}
