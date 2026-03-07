# Müşteriye demo vermek (ngrok)

Müşteri hiçbir şey indirmeden tarayıcı ve Telegram üzerinden deneyebilir.

## 1. ngrok kurulumu

- https://ngrok.com/download adresinden indirip kurun veya:
  ```bash
  # Windows (winget)
  winget install ngrok.ngrok
  ```
- (İsteğe bağlı) ngrok.com’da ücretsiz hesap açıp `ngrok config add-authtoken YOUR_TOKEN` ile token ekleyin; ücretsiz sınır daha iyi olur.

## 2. Uygulamayı başlatın

**Terminal 1:**
```bash
npm start
```
Sunucu çalışır (örn. `http://localhost:3000`).

## 3. ngrok tünelini açın

**Terminal 2** (proje klasöründe):
```bash
ngrok http 3000
```
(.env’de `PORT` farklıysa onu kullanın, örn. `ngrok http 3001`.)

Veya: `npm run demo` (varsayılan 3000 için.)

Çıkan pencerede **Forwarding** satırında bir adres görünür, örn:
`https://abc123.ngrok-free.app -> http://localhost:3000`

## 4. Müşteriye vereceğiniz bilgiler

- **Admin panel linki:**  
  `https://SIZIN-NGROK-ADRESINIZ.ngrok-free.app/app/?secret=ADMIN_SECRET`  
  (.env’deki `ADMIN_SECRET` değerini URL’de kullanın.)

- **Giriş:** Kullanıcı adı ve şifre (.env’deki `ADMIN_USER` / `ADMIN_PASSWORD`).

- **Telegram:** Bot’u Telegram’da açıp `/start` yazsın; ruhsat fotoğrafı veya bilgi gönderebilir.

## Not

- Demo süresince **Terminal 1** ve **Terminal 2** açık kalmalı; bilgisayarınız kapanırsa link çalışmaz.
- ngrok ücretsiz sürümünde her seferinde farklı bir adres verir; demo bitince linki yenilemeniz gerekmez, sadece yeni demo için yeni link alırsınız.
