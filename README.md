# Sigorta Telegram Bot & Admin Panel

Araç sigortası teklifi almak için Telegram botu ve yönetim paneli. Müşteri ruhsat fotoğrafı veya manuel bilgi gönderir; admin panelinden teklif fiyatı girilip müşteriye iletilebilir.

## Projeyi çalıştırmak (ilk kurulum)

1. **Bağımlılıkları yükle**
   ```bash
   npm install
   cd admin-app && npm install && cd ..
   ```

2. **Ortam değişkenlerini ayarla**
   - `env.example` dosyasını kopyalayıp `.env` yapın.
   - `.env` içinde en azından `TELEGRAM_BOT_TOKEN` doldurulmalı (Telegram @BotFather'dan alınır).
   - İsteğe göre `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_SECRET`, `PORT` değiştirilebilir.

3. **Admin panelini derle**
   ```bash
   npm run build
   ```
   (Bu komut `admin-app` içindeki React uygulamasını build eder.)

4. **Sunucuyu başlat**
   ```bash
   npm start
   ```
   - Bot ve API: çalışır.
   - Admin panel: tarayıcıda `http://localhost:3000/app/` (veya seçtiğiniz PORT).
   - Giriş: `.env` içindeki `ADMIN_USER` / `ADMIN_PASSWORD`. URL’de `?secret=ADMIN_SECRET` gerekebilir.

## Arkadaşınızla birlikte çalışmak

- **Git:** Projeyi bir Git deposunda tutun (GitHub, GitLab vb.). Her geliştirici kendi bilgisayarında `git clone` ile alır.
- **`.env` paylaşmayın:** Şifre ve bot token’ı `.env` içinde kalmalı; `.env` dosyası `.gitignore`’da. Her kişi kendi `.env` dosyasını `env.example`’dan kopyalayıp kendi değerleriyle doldurur.
- **Veritabanı:** `data/sigorta.db` yerel SQLite dosyasıdır; genelde `.gitignore` ile takip dışı bırakılır. İsterseniz sadece şema için `database/schema.sql` gibi bir dosya tutup yeni ortamlarda veritabanını oradan oluşturabilirsiniz.
- **Geliştirme:** Backend’de değişiklik için `npm run dev` (nodemon) kullanılabilir. Frontend değişikliği için `admin-app` içinde `npm run dev` ile canlı yenileme açılabilir.

## UI geliştirme (Figma MCP)

Admin arayüzünü Figma’da taslayıp Cursor’da tasarımdan koda dönüştürmek için **Figma MCP** kullanılabilir (ücretsiz). Kurulum ve kullanım: **[FIGMA_MCP.md](FIGMA_MCP.md)**.

## Klasör yapısı

- `index.js` — Express API + Telegram bot (Telegraf), OCR (Tesseract)
- `db.js` — SQLite (better-sqlite3), leads / conversations / packages
- `admin-app/` — React (Vite) admin paneli
- `uploads/` — Ruhsat fotoğrafları (otomatik oluşur, git’e eklenmez)
- `data/` — SQLite veritabanı (otomatik oluşur, git’e eklenmez)

## Komutlar

| Komut | Açıklama |
|--------|----------|
| `npm start` | Sunucu + bot başlatır |
| `npm run dev` | Nodemon ile sunucuyu yeniden başlatır |
| `npm run build` | Admin panelini production build eder |

---

İyi çalışmalar.
