# WhatsApp Cloud API Kurulumu

## 1. Meta Developer Console'dan değerleri alın

1. [developers.facebook.com](https://developers.facebook.com) → Uygulamanız → **WhatsApp** → **API Setup** (veya Getting Started).
2. **Temporary access token** veya kalıcı token ile **Access Token** kopyalayın → `.env` içine `WHATSAPP_ACCESS_TOKEN=...` yazın.
3. **Phone number ID** (numara kimliği) kopyalayın → `.env` içine `WHATSAPP_PHONE_NUMBER_ID=...` yazın.
4. **Verify token** sizin belirleyeceğiniz bir kelime (örn. `sigorta-verify-token`). Bunu `.env` içine `WHATSAPP_VERIFY_TOKEN=sigorta-verify-token` yazın ve aynı değeri aşağıda webhook kaydında kullanın.

## 2. Webhook URL'yi Meta'ya tanıtın

Sunucunuz **internetten erişilebilir** olmalı (localhost doğrudan çalışmaz; ngrok veya canlı sunucu gerekir).

- **Örnek canlı URL:** `https://yourdomain.com`
- **Webhook adresi:** `https://yourdomain.com/webhook/whatsapp`

Meta'da:

1. WhatsApp → **Configuration** (veya Webhook bölümü).
2. **Callback URL:** `https://yourdomain.com/webhook/whatsapp`
3. **Verify token:** `.env` ile aynı değer (örn. `sigorta-verify-token`)
4. **Verify** butonuna tıklayın; başarılı olursa webhook kaydedilir.
5. **Webhook fields** içinde **messages** işaretli olsun; **Subscribe** ile kaydedin.

## 3. Yerel test (ngrok)

Yerelde test için:

```bash
ngrok http 3000
```

Çıkan `https://xxxx.ngrok.io` adresini kullanın:

- Callback URL: `https://xxxx.ngrok.io/webhook/whatsapp`
- `.env` içinde isteğe bağlı: `BASE_URL=https://xxxx.ngrok.io`

## 4. .env özeti

```env
WHATSAPP_ACCESS_TOKEN=EAAxxxx...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=sigorta-verify-token
```

Sonrasında `npm start` ile sunucuyu başlatın. Mesajlar webhook üzerinden alınır ve yanıtlar Cloud API ile gönderilir.

## 5. "Callback URL or verify token couldn't be validated" hatası

Bu hata genelde şunlardan kaynaklanır:

1. **Sunucu çalışmıyor**  
   Meta doğrulama isteği gönderdiğinde uygulama ayakta olmalı. Önce `npm start` ile sunucuyu başlatın, sonra Meta’da **Verify**’e basın.

2. **Verify token eşleşmiyor**  
   Meta’daki **Verify token** alanına yazdığınız değer, `.env` içindeki `WHATSAPP_VERIFY_TOKEN` ile **birebir aynı** olmalı (örn. `sigorta-verify-token`). Başında/sonunda boşluk veya farklı karakter olmamalı.

3. **Callback URL yanlış**  
   Tam adres: `https://NGROK_YA_DA_DOMAIN/webhook/whatsapp`  
   - `http` değil, `https` kullanın.  
   - Sondaki `/` olmadan yazın (yine de kod tarafında trailing slash desteklenir).  
   - Ngrok kullanıyorsanız, her yeni `ngrok http 3000` sonrası adres değişir; Meta’daki URL’i buna göre güncelleyin.

4. **Ngrok ücretsiz "Visit Site" sayfası**  
   Ngrok ücretsiz planda bazen doğrulama isteğine HTML arayüz sayfası döndürür; Meta da bunu görünce doğrulamayı reddeder.  
   - Önce yukarıdaki 1–3’ü kontrol edin.  
   - Hata sürerse **Cloudflare Tunnel** deneyin (ücretsiz, arayüz yok):

   ```bash
   # Cloudflare Tunnel (tek seferlik kurulum sonrası)
   npx cloudflared tunnel --url http://localhost:3000
   ```

   Çıkan `https://xxx.trycloudflare.com` adresini Callback URL’de kullanın:  
   `https://xxx.trycloudflare.com/webhook/whatsapp`
