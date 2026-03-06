# Arkadaşın Cursor’da Kullanacağı Prompt / Kural

Bu dosyayı **arkadaşına gönder**. Arkadaş bunu kendi Cursor projesinde kullanacak: ya **Agent/Chat’e yapıştıracak** ya da **Cursor Rule** olarak ekleyecek.

---

## Seçenek A: Cursor’da Rule olarak eklemek (önerilen)

Arkadaş kendi proje klasöründe (fork’unu açtığı klasörde) şu dosyayı oluştursun:

**Dosya yolu:** `.cursor/rules/github-fork-arkadas.mdc`

**İçerik:** Aşağıdaki "Rule içeriği" bölümünü kopyalasın. Üstteki `---` ile başlayan frontmatter dahil.

---

## Seçenek B: Chat’e / Agent’a yapıştırmak

Arkadaş birlikte çalışırken “GitHub fork’la nasıl senkron olurum?” diye sorduğunda, aşağıdaki **Kullanım talimatları** metnini yapıştırabilir; sen (AI) adımları uygularsın.

---

# Rule içeriği (arkadaş bu metni .cursor/rules/github-fork-arkadas.mdc yapabilir)

```markdown
---
description: GitHub fork – ana repo / proje sahibi ile senkron (değişiklikleri al ve gönder)
alwaysApply: true
---

# Fork ile Birlikte Çalışma (Sen Fork’tasın)

Bu proje bir **fork**. Ana proje sahibi (arkadaşın) ile değişiklikleri senkron etmek için aşağıdakileri kullan.

## Ana repodan (arkadaşının repodu) değişiklikleri almak

Arkadaşın “değişiklikleri push ettim” dediğinde, onun repodan güncellemeyi al:

1. **Bir kez yapılacak:** Ana repoyu remote ekle (arkadaşının GitHub repo URL’si, örn. Babakucan veya proje sahibinin repodu):
   ```bash
   git remote add ana https://github.com/PROJE_SAHIBI_KULLANICI/Sigorta-Sirketleri-in-Chatbotr-.git
   ```
   (PROJE_SAHIBI_KULLANICI yerine gerçek kullanıcı adını yaz.)

2. **Her seferinde güncelleme alırken:**
   ```bash
   git fetch ana
   git merge ana/feature/bot-experience
   ```
   Farklı dal kullanılıyorsa `feature/bot-experience` yerine o dal adını kullan.

3. Conflict çıkarsa dosyaları düzelt, sonra:
   ```bash
   git add .
   git commit -m "Merge: conflict çözüldü"
   ```

## Kendi değişikliklerini göndermek (fork’una push)

1. Değişiklikleri commit et ve **kendi fork’una** push et:
   ```bash
   git add .
   git commit -m "Kısa açıklama"
   git push origin feature/bot-experience
   ```

2. Arkadaşına (proje sahibine) söyle: “Değişiklikleri push ettim.” O da kendi projesinde senin fork’unu remote ekleyip `git fetch <senin-remote-adın>` ve `git merge` ile alacak.

## Hızlı hatırlatma

- **Arkadaş güncelleme yaptıysa** → `git fetch ana` → `git merge ana/<dal-adı>`
- **Sen değişiklik yaptıysan** → `git add .` → `git commit -m "açıklama"` → `git push origin <dal-adı>`

`.env` repoya gitmez; kendi `.env` dosyanı kullanmaya devam et.
```

---

# Kullanım talimatları (arkadaş Chat’e yapıştırabilir)

Aşağıdaki metni arkadaşın Cursor Chat veya Agent’a yapıştırması yeterli; sen (AI) komutları çalıştırırsın:

---

“Bu proje bir fork. Ana repodan (arkadaşımın repodu) değişiklikleri almak için: önce `git remote add ana <arkadaşımın-repo-url>` (bir kez), sonra her güncellemede `git fetch ana` ve `git merge ana/feature/bot-experience` yap. Ben değişiklik yaptığımda `git add .`, `git commit -m "açıklama"`, `git push origin feature/bot-experience` yap. .env asla push edilmez. Bu adımları bana uygulat.”

---

Arkadaş **PROJE_SAHIBI_KULLANICI** ve repo URL’sini kendi durumuna göre (sizin veya Babakucan’ın repo’su) değiştirsin.
