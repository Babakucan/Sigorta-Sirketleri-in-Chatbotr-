# Projeyi GitHub'a Gönderme

Repo: https://github.com/Babakucan/Sigorta-Sirketleri-in-Chatbotr-.git

## 1. Proje klasöründe terminal aç

Masaüstündeki **Yeni klasör** içinde sağ tık → "Terminalde aç" veya VS Code/Cursor’da bu klasör açıkken entegre terminali aç.

## 2. Git repo başlat (henüz yoksa)

```bash
git init
```

## 3. Tüm dosyaları ekle ve ilk commit

```bash
git add .
git commit -m "İlk commit: Sigorta Telegram bot ve admin paneli"
```

## 4. GitHub reposunu uzak (remote) olarak ekle

```bash
git remote add origin https://github.com/Babakucan/Sigorta-Sirketleri-in-Chatbotr-.git
```

## 5. Ana dalı main yap ve gönder

```bash
git branch -M main
git push -u origin main
```

GitHub kullanıcı adı ve şifre/token istenebilir. Şifre yerine **Personal Access Token** kullanman gerekebilir: GitHub → Settings → Developer settings → Personal access tokens.

---

**Not:** `.env` dosyası `.gitignore`’da olduğu için repoya **gitmez**. Arkadaşın projeyi klonladıktan sonra `env.example`’ı kopyalayıp `.env` yapıp kendi token’ını yazacak.
