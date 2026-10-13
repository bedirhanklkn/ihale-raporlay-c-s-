const { GoogleGenerativeAI } = require("@google/generative-ai");

// Helper to sanitize JSON response from LLM
function cleanAndParseJson(rawText) {
  try {
    let clean = rawText.trim();
    clean = clean.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(clean);
  } catch (err) {
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        let snippet = rawText.substring(firstBrace, lastBrace + 1);
        snippet = snippet.replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(snippet);
      } catch (e) {
        // continue
      }
    }
    throw err;
  }
}

// 1. Regex-based deterministic fallback extractor (No sample hardcoding)
function extractTenderDetailsFromText(rawText, idariText = "", sozlesmeText = "", teknikText = "") {
  const full = (rawText || "") + "\n" + (idariText || "") + "\n" + (sozlesmeText || "") + "\n" + (teknikText || "");

  // 1. İdare ve Temel Bilgiler
  const idareMatch =
    full.match(/1\.1\.\s*İdarenin;\s*a\)\s*Adı\s*:\s*([^\n\r]+?)(?=\s*b\)\s*Adresi|\n|$)/i) ||
    full.match(/İdarenin;\s*a\)\s*Adı\s*:\s*([^\n\r]+?)(?=\s*b\)\s*Adresi|\n|$)/i) ||
    full.match(/a\)\s*Adı\s*:\s*([^\n\r]+?)(?=\s*b\)\s*Adresi|\n|$)/i) ||
    full.match(/İdarenin\s+Adı\s*:\s*([^\n\r]+)/i) ||
    full.match(/İDARE\s*:\s*([^\n\r]+)/i);
  let idareAdi = idareMatch ? idareMatch[1].trim() : "Şartnamede Belirtilen İdare";
  idareAdi = idareAdi.replace(/\s+b\)\s*Adresi.*/i, "").trim();

  const iknMatch =
    full.match(/İhale\s+kayıt\s+numarası\s*:\s*([0-9]{4}\/[0-9]+)/i) ||
    full.match(/İKN\s*:\s*([0-9]{4}\/[0-9]+)/i) ||
    full.match(/\b([0-9]{4}\/[0-9]{5,7})\b/);
  const ikn = iknMatch ? iknMatch[1] : "İKN Bulunamadı";

  const adresMatch =
    full.match(/b\)\s*Adresi\s*:\s*([^\n\r]+?)(?=\s*c\)\s*Telefon|\n|$)/i) ||
    full.match(/Adresi\s*:\s*([^\n\r]+?)(?=\s*Telefon|Telefonu|$)/i);
  let adres = adresMatch ? adresMatch[1].trim() : "";
  adres = adres.replace(/\s*c\)\s*Telefon.*/i, "").trim();

  const telMatch =
    full.match(/Telefon\s+numarası\s*:\s*([0-9\-\s]+)/i) ||
    full.match(/Telefon\s*:\s*([0-9\-\s]+)/i);
  const telefon = telMatch ? telMatch[1].trim() : "";

  const faksMatch = full.match(/Faks\s+numarası\s*:\s*([0-9\-\s]+)/i);
  const faks = faksMatch ? faksMatch[1].trim() : "";

  const personelMatch = full.match(/İlgili\s+personel[^:]*:\s*([^\n\r]+)/i);
  const personel = personelMatch ? personelMatch[1].trim() : "";

  // 2. İhale Konusu ve İşi
  const isinAdiMatch =
    full.match(/İhale\s+konusu\s+işin\/alımın;\s*a\)\s*Adı\s*:\s*([^\n\r]+)/i) ||
    full.match(/İhale\s+konusu\s+işin\s*a\)\s*Adı\s*:\s*([^\n\r]+)/i) ||
    full.match(/İşin\s+Adı\s*:\s*([^\n\r]+)/i) ||
    full.match(/Konu\s*:\s*([^\n\r]+)/i);
  const isinAdi = isinAdiMatch
    ? isinAdiMatch[1].replace(/b\)\s*Türü.*/i, "").trim()
    : "Kamu İhale Sözleşmesi";

  const turuMatch = full.match(/Türü\s*:\s*([^\n\r]+)/i);
  const turu = turuMatch
    ? turuMatch[1].replace(/c\)\s*İlgili.*/i, "").trim()
    : (full.includes("Hizmet Alımı") ? "Hizmet Alımı" : full.includes("Mal Alımı") ? "Mal Alımı" : full.includes("Yapım İşi") ? "Yapım İşi" : "Hizmet/Mal Alımı");

  const usulMatch = full.match(/İhale\s+usulü\s*:\s*([^\n\r\.]+)/i);
  const usulu = usulMatch ? usulMatch[1].trim() : "4734 Sayılı Kanun Kapsamında İhale";

  const tarihMatch =
    full.match(/tarihi\s+ve\s+saati\s*:\s*([0-9]{1,2}[\.\/][0-9]{1,2}[\.\/][0-9]{4})\s*(?:Saat\s*:\s*([0-9]{1,2}:[0-9]{2}))?/i) ||
    full.match(/([0-9]{1,2}[\.\/][0-9]{1,2}[\.\/][0-9]{4})\s*(?:tarihinde|günü)?\s*(?:saat\s*([0-9]{1,2}:[0-9]{2}))?/i);
  const ihaleTarihi = tarihMatch
    ? `${tarihMatch[1]} ${tarihMatch[2] ? `saat ${tarihMatch[2]}` : ""}`.trim()
    : "İlan / İdari şartnamede belirtilen gün ve saat";

  const yerMatch = full.match(/İşin\s+yapılacağı[^\:]*:\s*([^\n\r]+)/i);
  const isinYeri = yerMatch ? yerMatch[1].trim() : "İdarece belirlenen iş sahası / adres";

  const miktarMatch = full.match(/Miktarı\s*:\s*([^\n\r]+)/i);
  const miktar = miktarMatch ? miktarMatch[1].replace(/Ayrıntılı bilgi.*/i, "").trim() : "";

  // 3. Genel Çerçeve
  const rKatsayiMatch =
    full.match(/sınır\s+değer\s+katsayısı\s*\(R\)\s*:\s*([^0-9]*)([0-9,.]+)/i) ||
    full.match(/R\s+katsayısı[^0-9]*([0-9,.]+)/i);
  const rKatsayisi = rKatsayiMatch ? (rKatsayiMatch[2] || rKatsayiMatch[1]).trim() : "Mevzuata göre belirlenir";

  const gecerlilikSureMatch = full.match(/Tekliflerin\s+geçerlilik\s+süresi[^\d]*(\d+)[^\d]*takvim\s+günü/i);
  const teklifGecerlilik = gecerlilikSureMatch ? `${gecerlilikSureMatch[1]} takvim günü` : "Şartnamede belirtilen gün";

  // 4. Katılım Şartları ve Yeterlik Kriterleri
  const cariOranMatch = full.match(/cari\s+oranın[^\d]*([0-9,.]+)/i);
  const cariOran = cariOranMatch ? `En az ${cariOranMatch[1]}` : "Şartnamede belirtilen oran";

  const ozkaynakMatch = full.match(/öz\s*kaynak\s+oranının[^\d]*([0-9,.]+)/i);
  const ozkaynakOran = ozkaynakMatch ? `En az ${ozkaynakMatch[1]}` : "Şartnamede belirtilen oran";

  const bankaBorcMatch = full.match(/Kısa\s+vadeli\s+banka\s+borçlarının\s+öz\s*kaynaklara\s+oranının[^\d]*([0-9,.]+)/i);
  const bankaBorc = bankaBorcMatch ? `${bankaBorcMatch[1]}'den küçük` : "Şartnamede belirtilen oran";

  const ciroMatch = full.match(/Toplam\s+cironun\s+teklif\s+edilen\s+bedelin\s*%\s*(\d+)/i);
  const ciroSarti = ciroMatch
    ? `Teklif bedelinin en az %${ciroMatch[1]}'i oranında ciro`
    : "Şartnamede belirtilen ciro yeterliği";

  const deneyimMatch = full.match(/teklif\s+edilen\s+bedelin\s*%\s*(\d+)[^\d]*den\s+az\s+olmamak\s+üzere/i);
  const isDeneyimi = deneyimMatch
    ? `Teklif bedelinin en az %${deneyimMatch[1]}'i tutarında iş deneyim belgesi`
    : "Şartnamede belirtilen iş deneyim belgesi oranı";

  const benzerIsMatch = full.match(/Benzer\s+iş\s+olarak\s+kabul\s+edilecek\s+işler[^\:]*:\s*([^\n\r\.]+)/i);
  const benzerIs = benzerIsMatch ? benzerIsMatch[1].trim() : "İhale konusu işe denk veya benzer işler";

  // 5. Teminatlar
  const geciciTeminatTarihMatch = full.match(/([0-9]{1,2}[\.\/][0-9]{1,2}[\.\/][0-9]{4})\s+tarihinden\s+önce\s+olmamak\s+üzere/i);
  const geciciTeminatTarih = geciciTeminatTarihMatch
    ? geciciTeminatTarihMatch[1]
    : "Teklif geçerlilik süresinden en az 30 gün fazla";

  // 6. Fiyat Farkı
  const fiyatFarkiVar =
    !full.includes("fiyat farkı verilmeyecektir") &&
    (full.includes("fiyat farkı hesaplanacaktır") || full.includes("fiyat farkı verilecektir") || full.includes("Fiyat farkı aşağıdaki formüle"));

  // 7. Gerekli Belgeler Listesi (Checklist)
  const gerekliBelgeler = [
    { belge: "Geçici Teminat Mektubu / Makbuzu", aciklama: "Teklif bedelinin en az %3'ü tutarında, standart forma uygun", zorunlu: true },
    { belge: "Birim Fiyat Teklif Mektubu ve Cetveli", aciklama: "EKAP üzerinden e-imza ile imzalanmış e-teklif", zorunlu: true },
    { belge: "Yetki ve İmza Belgeleri", aciklama: "İmza sirküleri veya vekaletname / ticaret sicil tasdiknamesi", zorunlu: true },
    { belge: "Ticaret Sicil Gazetesi", aciklama: "Tüzel kişiliğin ortakları, üyeleri veya kurucuları ile tüzel kişiliğin yönetimindeki görevlileri belirten son durum", zorunlu: true },
    { belge: "İş Deneyim Belgesi (İKN/EKAP)", aciklama: isDeneyimi, zorunlu: true },
    { belge: "Ekonomik ve Mali Yeterlik Belgeleri", aciklama: "Bilanço veya eşdeğer belgeler, ciro bilgileri tablosu", zorunlu: !full.includes("ekonomik ve mali yeterlik aranmaz") },
    { belge: "Teknik Şartnameye Uygunluk Taahhütnamesi", aciklama: "Şartnamede istenen teknik kriterleri sağlayacağını bildirir beyan", zorunlu: true },
  ];

  // 8. DİKKAT ÇEKEN NOKTALAR (Çelişkiler, Hatalar, Riskler)
  const dikkatCekenNoktalar = [];

  if (full.includes("Alt yüklenici") && (full.includes("izin verilmemiştir") || full.includes("çalıştırılamaz"))) {
    dikkatCekenNoktalar.push({
      baslik: "Alt Yüklenici Yasağı",
      derece: "kritik",
      aciklama: "Şartnamede alt yüklenici çalıştırılması yasaklanmıştır. İşin tamamının doğrudan istekli tarafından yürütülmesi gerekmektedir; taşeron kullanımı sözleşme feshine yol açabilir.",
    });
  }

  if (rKatsayisi !== "Mevzuata göre belirlenir") {
    dikkatCekenNoktalar.push({
      baslik: `Aşırı Düşük Teklif Sınır Değeri (R = ${rKatsayisi})`,
      derece: "onemli",
      aciklama: `İhalede R = ${rKatsayisi} katsayısı uygulanacaktır. Sınır değerin altında kalan isteklilerden mevzuat gereğince detaylı analiz (aşırı düşük savunması) talep edilecek, yetersiz bulunanlar elenecektir.`,
    });
  }

  if (full.includes("cezası") || full.includes("ceza oranı")) {
    const cezaMatch = full.match(/gecikilen\s+her\s+takvim\s+günü\s+için[^\d]*%\s*([0-9,.]+)/i) || full.match(/her\s+gün\s+için[^\d]*%\s*([0-9,.]+)/i);
    dikkatCekenNoktalar.push({
      baslik: "Gecikme Cezası Hükmü",
      derece: "onemli",
      aciklama: `Sözleşme tasarısında gecikilen her gün için ${cezaMatch ? `%${cezaMatch[1]}` : "belirlenen oranda"} ceza kesileceği ve bu sürenin aşılması durumunda sözleşmenin feshedileceği hükme bağlanmıştır.`,
    });
  }

  return {
    baslik: isinAdi,
    idare: idareAdi,
    ikn: ikn,
    tur: turu,
    usul: usulu,
    ihaleTarihi: ihaleTarihi,
    adres: adres,
    telefon: telefon,
    faks: faks,
    personel: personel,
    cerceve: {
      konu: miktar || `${isinAdi} (${turu})`,
      yer: isinYeri,
      teklifTuru: "Birim fiyat teklif veya götürü bedel (şartnameye göre)",
      kazananKriteri: "En düşük fiyat veya fiyat dışı unsurlar dahil en avantajlı teklif",
      elektronikEksiltme: full.includes("elektronik eksiltme yapılacaktır") ? "Yapılacaktır" : "Yapılmaz",
      rKatsayisi: rKatsayisi,
      teklifGecerlilik: teklifGecerlilik,
      dokumanErisim: "EKAP üzerinden e-imza ile indirme",
      aciklamaTalebi: "İhale tarihinden en geç 20 gün önce EKAP üzerinden",
    },
    gerekliBelgeler: gerekliBelgeler,
    yeterlikKriterleri: [
      { kriter: "Cari oran (dönen varlıklar / kısa vadeli borçlar)", sart: cariOran },
      { kriter: "Öz kaynak oranı (öz kaynak / toplam aktif)", sart: ozkaynakOran },
      { kriter: "Kısa vadeli banka borçları / öz kaynak", sart: bankaBorc },
      { kriter: "Ciro Yeterliği", sart: ciroSarti },
      { kriter: "İş Deneyimi", sart: isDeneyimi },
      { kriter: "Benzer İş Tanımı", sart: benzerIs },
    ],
    yeterlikNotlari: [
      "Bilanço oranları son yıla veya son iki yılın ortalamasına göre sağlanmalıdır.",
      "İş ortaklığı olarak teklif verilmesi halinde hisse oranlarına dikkat edilmelidir.",
      "Belgelerin EKAP üzerinden teyit edilebilir veya mevzuata uygun e-imzalı/aslına uygun olması zorunludur.",
    ],
    teminatlar: {
      geciciTeminat: "Teklif bedelinin en az %3'ü oranında geçici teminat.",
      geciciTeminatTarih: `Teminat mektubunun geçerlilik tarihi: ${geciciTeminatTarih}`,
      kesinTeminat: "Sözleşme bedelinin %6'sı tutarında kesin teminat.",
      asiriDusuk: "Sınır değerin altındaki teklifler için KİK mevzuatı uyarınca yazılı açıklama istenir.",
    },
    sozlesmeSureci: [
      "İhale komisyon kararı ihale yetkilisince onaylandıktan sonra isteklilere bildirilir.",
      "Yasal bekleme süresi dolmadan sözleşme imzalanamaz.",
      "Kesinleşen ihale kararı tebliğinden sonra süresi içinde kesin teminat yatırılarak sözleşme imzalanmalıdır.",
      "Sözleşme bedeli üzerinden KİK payı ve damga vergisi mevzuata göre tahsil edilir.",
    ],
    fiyataDahilGiderler: [
      "Ulaşım, sigorta, vergi, resim ve harçlar sözleşme hükümlerine göre teklif fiyatına dahildir.",
      "KDV idare tarafından ayrıca ödenir.",
    ],
    fiyatFarki: {
      verilirMi: fiyatFarkiVar ? "Sözleşmede fiyat farkı verilir." : "Fiyat farkı verilmeyecektir.",
      formul: fiyatFarkiVar ? "İhale mevzuatında yer alan standart fiyat farkı esasları uygulanır." : "Uygulanmaz",
      katsayilar: [],
    },
    ekBilgiler: [],
    dikkatCekenNoktalar: dikkatCekenNoktalar,
  };
}

// 2. Full Gemini AI Analysis Engine (Analyzes the actual uploaded document)
async function enhanceReportWithGemini(reportData, combinedText, apiKey, rawBuffer = null, isPdf = false) {
  if (!apiKey) return reportData;

  // Use fastest, most stable models first (flash-lite avoids 503 high demand spikes)
  const modelsToTry = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
  ];
  const genAI = new GoogleGenerativeAI(apiKey);

  const promptText = `Sen Türkiye Kamu İhale Kurumu (KİK) ve 4734 sayılı Kamu İhale Kanunu konusunda uzmanlaşmış kıdemli bir ihale avukatı ve teklif hazırlama uzmanısın.
Aşağıda verilen ihale şartnamesi dokümanını (İdari Şartname, Teknik Şartname, Sözleşme Tasarısı vb.) dikkatlice analiz et.

Bu analizden yararlanacak olan şirket yetkilisi, ihaleye teklif verip vermeyeceğine karar verecek ve teklif hazırlayacaktır.
Bu nedenle metindeki GERÇEK verileri çıkar, hiçbir uydurma veya varsayım yapma.
Teklif verenin elenmesine yol açabilecek riskleri, teknik/idari şartname çelişkilerini, cezai hükümleri ve İHALEYE GİRERKEN HAZIRLANMASI GEREKEN TÜM BELGELERİ detaylandır.

Lütfen SADECE geçerli bir JSON objesi döndür (başka açıklama veya markdown backtick yazma, doğrudan JSON ver):

{
  "baslik": "İhale konusu işin/alımın tam adı",
  "idare": "İhaleyi yapan idarenin/belediyenin/kurumun tam adı",
  "ikn": "İhale Kayıt No (örn: 2025/12345)",
  "tur": "Hizmet Alımı | Mal Alımı | Yapım İşi | Danışmanlık",
  "usul": "Açık İhale | Pazarlık Usulü (21/b, 21/f vb.) | Belli İstekliler",
  "ihaleTarihi": "İhale tarihi ve saati (örn: 19.02.2025 saat 10:00)",
  "adres": "İdarenin adresi",
  "telefon": "İdarenin telefon numarası",
  "faks": "İdarenin faks numarası (varsa)",
  "personel": "İlgili personel / iletişim",
  "cerceve": {
    "konu": "İşin konusu ve kapsamı (süre, miktar, adet vb.)",
    "yer": "İşin yapılacağı / teslim edileceği yer",
    "teklifTuru": "Birim fiyat teklif | Götürü bedel (işin tamamı için veya kısmi)",
    "kazananKriteri": "En düşük fiyat | Fiyat dışı unsurlar | Yerli malı avantajı durumu",
    "elektronikEksiltme": "Yapılacaktır | Yapılmaz",
    "rKatsayisi": "Sınır değer katsayısı (R)",
    "teklifGecerlilik": "Teklif geçerlilik süresi (örn: 90 takvim günü)",
    "dokumanErisim": "Dokümana erişim ve e-imza şartı",
    "aciklamaTalebi": "Zeyilname / açıklama talebi son tarihi ve usulü"
  },
  "gerekliBelgeler": [
    {
      "belge": "Belge adı (örn: Geçici Teminat Mektubu, İmza Sirküleri, İş Deneyim Belgesi)",
      "aciklama": "Bu belge için şartnamede aranan özel şartlar, geçerlilik süresi, oran vb.",
      "zorunlu": true
    }
  ],
  "yeterlikKriterleri": [
    {
      "kriter": "Kriter adı (örn: Cari Oran, Özkaynak Oranı, Ciro, İş Deneyimi Oranı, Benzer İş)",
      "sart": "Şartnamede aranan asgari değer veya tanım"
    }
  ],
  "yeterlikNotlari": [
    "Bilanço, ortaklık, pilot ortak veya sertifikalarla ilgili şartnamedeki önemli kurallar"
  ],
  "teminatlar": {
    "geciciTeminat": "Geçici teminat oranı ve tutar kuralı (örn: Teklif bedelinin en az %3'ü)",
    "geciciTeminatTarih": "Geçici teminat mektubu geçerlilik tarihi kuralı",
    "kesinTeminat": "Kesin teminat oranı (örn: Teklif veya sözleşme bedelinin %6'sı)",
    "asiriDusuk": "Aşırı düşük teklif ve açıklama (savunma) istenme kuralı"
  },
  "sozlesmeSureci": [
    "İhale onay süresi, tebligat, sözleşmeye davet ve imzalama süreleri, KİK payı ve damga vergisi kuralları"
  ],
  "fiyataDahilGiderler": [
    "Teklif fiyatına dahil olan ve hariç tutulan masraflar (ulaşım, sigorta, vergi, SGK primleri vb.)"
  ],
  "fiyatFarki": {
    "verilirMi": "Fiyat farkı verilir mi, verilmez mi?",
    "formul": "Fiyat farkı formülü veya genel kural",
    "katsayilar": [
      {
        "kod": "a1, c veya malzeme kodu",
        "deger": "Ağırlık oranı",
        "aciklama": "Neyi temsil ettiği"
      }
    ]
  },
  "ekBilgiler": [
    "İş makinesi listesi, araç modelleri, personel sayısı, teknik şartname kritik şartları vb."
  ],
  "dikkatCekenNoktalar": [
    {
      "baslik": "Risk veya Çelişki Başlığı (örn: Alt Yüklenici Yasağı & Kiralama Çelişkisi)",
      "derece": "kritik | onemli | orta",
      "aciklama": "Tereddüt yaratan durum, idareden açıklama istenmesi gereken konular, cezai maddeler veya tuzaklar"
    }
  ]
}`;

  let contents;
  // If text is short and rawBuffer is a PDF, use Multimodal PDF inline input
  if ((!combinedText || combinedText.length < 50) && isPdf && rawBuffer) {
    contents = [
      {
        inlineData: {
          data: rawBuffer.toString("base64"),
          mimeType: "application/pdf",
        },
      },
      { text: promptText },
    ];
  } else {
    contents = `${promptText}\n\nİhale Dokümanı Metni:\n${(combinedText || "").substring(0, 70000)}`;
  }

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" },
      });
      const generatePromise = model.generateContent(contents);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${modelName} zaman aşımı (18s)`)), 18000)
      );

      const result = await Promise.race([generatePromise, timeoutPromise]);
      const text = result.response.text();
      const parsed = cleanAndParseJson(text);

      if (parsed && typeof parsed === "object") {
        return {
          ...reportData,
          ...parsed,
          cerceve: { ...(reportData.cerceve || {}), ...(parsed.cerceve || {}) },
          teminatlar: { ...(reportData.teminatlar || {}), ...(parsed.teminatlar || {}) },
          fiyatFarki: { ...(reportData.fiyatFarki || {}), ...(parsed.fiyatFarki || {}) },
          isAiEnhanced: true,
        };
      }
    } catch (err) {
      console.warn(`Gemini analysis with ${modelName} failed/timed out:`, err.message);
    }
  }

  return reportData;
}

// 3. Document Q&A (Ask questions to document with Senior Procurement Expert intelligence)
async function answerQuestionAboutDocument(question, combinedText, apiKey, chatHistory = [], rawBuffer = null, isPdf = false) {
  if (apiKey) {
    const modelsToTry = [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ];
    const genAI = new GoogleGenerativeAI(apiKey);

    const systemInstruction = `Sen Türkiye Kamu İhale Hukuku (4734 sayılı Kamu İhale Kanunu, 4735 sayılı Kamu İhale Sözleşmeleri Kanunu ve KİK ikincil mevzuatı) alanında uzmanlaşmış, son derece tecrübeli ve stratejik bir Kıdemli İhale Danışmanı ve Avukatısın.

Görevin: Kullanıcının yüklediği ihale dokümanını (İdari Şartname, Teknik Şartname, Sözleşme Tasarısı, İlan vb.) bir cerrah titizliğiyle inceleyerek kullanıcının sorusuna DOĞRUDAN, STRATEJİK ve EKSİKSİZ yanıt vermektir.

Yanıt verirken kesinlikle şu profesyonel yaklaşımı izle:
1. 🎯 **Net ve Doğrudan Yanıt**: Lafı dolandırma. İlk cümlede doğrudan cevabı ver (Örn: "Evet, şartnamenin X maddesine göre girebilirsiniz...", "Hayır, şartnamede açıkça yasaklanmıştır...").
2. 📜 **Madde ve Belge Referansı**: Dokümandaki ilgili şartnameyi ve madde numarasını mutlaka belirt (Örn: *İdari Şartname Madde 7.5.2*, *Teknik Şartname Madde 3.1*, *Sözleşme Tasarısı Madde 16*). İlgili ifadenin şartnamedeki metnini alıntıla.
3. ⚠️ **Tuzaklar, Riskler ve Cezalar**: İstekli firmanın ihaleyi kazanması durumunda karşılaşabileceği operasyonel ve finansal riskleri, gecikme cezalarını, teminatın irat kaydedilme risklerini veya şartnameler arası çelişkileri uyar.
4. 💡 **Stratejik Tavsiye (Püf Noktası)**: İsteklinin lehine pratik tavsiye ver (Örn: "İdareye ihale tarihinden en geç 20 gün önce EKAP üzerinden yazılı zeyilname sorusu sorun", "Teklif cetvelindeki birim fiyat dağılımında aşırı düşük sınırına dikkat edin", "Noter onaylı kira sözleşmesini teklif ekine şimdiden hazırlayın").
5. ⚖️ **Mevzuat Açıklaması**: Gerekirse KİK emsal kararları veya 4734 sayılı kanun hükümleri açısından hukuki durumu değerlendirme.

Dokümanda açıkça yer almayan bir husus varsa bunu dürüstçe belirt ("Şartnamede bu konuda özel bir hüküm yer almamaktadır; genel mevzuat hükümleri geçerlidir") ve asla uydurma bilgi verme. Yanıtlarını zengin Markdown formatında (kalın başlıklar, madde işaretleri, alıntılar) düzenle.`;

    const contextPrompt = `Aşağıdaki metin, kullanıcının sisteme yüklediği İHALE DOKÜMANI metnidir:
---
${(combinedText || "").substring(0, 75000)}
---

Bu ihale dokümanını esas alarak kullanıcının sorusunu yanıtla.`;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
        });

        // Build multi-turn history if present
        const history = [
          {
            role: "user",
            parts: [{ text: contextPrompt + "\n\nMerhaba, bu ihale şartnamesini analiz etmek ve sorularıma yanıt almak istiyorum." }],
          },
          {
            role: "model",
            parts: [{ text: "Merhaba. İhale dokümanını (İdari Şartname, Sözleşme Tasarısı ve Teknik Şartname) ayrıntılı olarak inceledim. 4734 sayılı Kanun ve şartname hükümleri çerçevesinde tüm sorularınızı yanıtlamaya, riskleri ve teklif stratejilerini açıklamaya hazırım. Sorunuzu iletebilirsiniz." }],
          },
        ];

        // Append prior chat history (up to last 6 turns to keep context fast)
        if (Array.isArray(chatHistory)) {
          const recent = chatHistory.slice(-6);
          for (const msg of recent) {
            history.push({
              role: msg.role === "user" ? "user" : "model",
              parts: [{ text: msg.text || "" }],
            });
          }
        }

        const chat = model.startChat({ history });
        const sendPromise = chat.sendMessage(question);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${modelName} zaman aşımı (18s)`)), 18000)
        );

        const res = await Promise.race([sendPromise, timeoutPromise]);
        return res.response.text();
      } catch (e) {
        console.warn(`Gemini Q&A with ${modelName} failed/timed out:`, e.message);
      }
    }
  }

  // Fallback keyword search
  const qLower = question.toLowerCase();
  const sentences = combinedText.split(/\n+/);
  const words = qLower.split(/\s+/).filter((w) => w.length > 2);
  const matched = sentences.filter((s) => {
    const sLower = s.toLowerCase();
    return words.some((w) => sLower.includes(w));
  });

  if (matched.length > 0) {
    return `### 🔍 Dokümanda İlgili Bulunan Maddeler\n\nSorunuzla ilgili şartname metninde aşağıdaki maddeler tespit edildi:\n\n${matched.slice(0, 6).map((m) => `> "${m.trim()}"`).join("\n\n")}\n\n💡 *Not: Kıdemli ihale avukatı gibi derinlemesine analiz, risk değerlendirmesi ve stratejik tavsiye almak için sağ üstten Gemini API Anahtarınızı aktifleştirebilirsiniz.*`;
  }

  return "Dokümanda bu soruyla doğrudan eşleşen bir madde tespit edilemedi. Lütfen sorunuzu farklı anahtar kelimelerle iletin (örneğin: *ceza, teminat, araç, personel, mazot, benzer iş*) veya yapay zeka analizi için Gemini API anahtarınızı ekleyin.";
}

module.exports = {
  extractTenderDetailsFromText,
  enhanceReportWithGemini,
  answerQuestionAboutDocument,
};
