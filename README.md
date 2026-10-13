# Kamu İhale Raporlayıcı ve Analiz Sistemi 📑🤖

EKAP ve kamu ihale dokümanlarını (ZIP, PDF, Word) hızlıca ayrıştıran, kural ve yapay zeka (Google Gemini) destekli yönetici analiz raporu ve doküman soru-cevap asistanı.

## 🚀 Özellikler

- **Çok Formatlı Dosya Desteği:** ZIP, PDF, DOCX ve DOC şartname paketlerini otomatik ayrıştırır.
- **Kritik Bilgi Tespiti:** İhale tarihi, saat, yer, yaklaşık maliyet, geçici teminat oranı, benzer iş tanımı, ceza maddeleri ve süreler.
- **Gemini Multimodal Entegrasyonu:** Taranmış (metin içermeyen) PDF şartnamelerini doğrudan okur ve analiz eder.
- **Etkileşimli Soru-Cevap:** Yüklenen şartname hakkında doğrudan soru sorabilme.
- **Modern ve Duyarlı Arayüz:** Detaylı yönetici özeti, risk analizleri ve kolay dışa aktarma.

## 🛠️ Kurulum ve Yerel Çalıştırma

1. **Bağımlılıkları Yükleyin:**
   ```bash
   npm install
   ```

2. **Ortam Değişkenlerini Ayarlayın:**
   `.env.example` dosyasını `.env` olarak kopyalayın ve Gemini API anahtarınızı ekleyin:
   ```env
   GEMINI_API_KEY=AIzaSy...
   PORT=3000
   ```

3. **Uygulamayı Başlatın:**
   ```bash
   npm start
   ```

Tarayıcınızda `http://localhost:3000` adresine gidin.

## 🌐 Sunucuya Dağıtım (Production)

### PM2 ile Sunucuda Arka Planda Çalıştırma (Linux / Ubuntu / VPS):
```bash
# PM2 yükleyin (yoksa)
npm install -g pm2

# Uygulamayı başlatın
pm2 start server.js --name ihale-raporlayici

# Sunucu yeniden başladığında otomatik çalışması için:
pm2 startup
pm2 save
```

### Nginx Reverse Proxy Örneği:
```nginx
server {
    listen 80;
    server_name ihale.alanadiniz.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 100M;
    }
}
```
