# Projede Birlikte Çalışma — Git İş Akışı

## Arkadaşım (geliştirici) nasıl çalışmalı?

### 1. Projeyi indir
```bash
git clone https://github.com/Babakucan/Sigorta-Sirketleri-in-Chatbotr-.git
cd Sigorta-Sirketleri-in-Chatbotr-
```

### 2. Yeni işe başlamadan önce branch aç
`main` üzerinde **doğrudan** çalışma. Her yeni özellik veya düzeltme için ayrı branch aç:

```bash
git checkout main
git pull origin main
git checkout -b feature/yapilacak-ozellik
```

Örnek branch isimleri:
- `feature/bot-deneyimi` — bot mesajları, isimle hitap
- `feature/admin-filtre` — admin paneline arama/filtre
- `fix/ruhsat-ocr` — ruhsat okuma düzeltmesi

### 3. Değişiklik yap, commit at
```bash
# Dosyaları düzenle...
git add .
git commit -m "Özet: ne yaptığını kısaca yaz"
```

### 4. Branch'i GitHub'a gönder
```bash
git push -u origin feature/yapilacak-ozellik
```

### 5. Birleştirme (sen veya arkadaşın)
- **Seçenek A:** GitHub’da **Pull Request** aç → sen incele → Merge.
- **Seçenek B:** Aynı bilgisayarda çalışıyorsanız: `git checkout main` → `git merge feature/yapilacak-ozellik` → `git push origin main`.

---

## Özet

| Ne yapıyorsun?        | Komut / adım |
|-----------------------|--------------|
| Yeni işe başlıyorsun  | `git checkout -b feature/isim` |
| İşi bitirdin          | `git add .` → `git commit -m "..."` → `git push -u origin feature/isim` |
| main güncel kalsın    | İşe başlamadan `git checkout main` → `git pull` |
| Birleştirme           | Pull Request veya `git merge` |

**Kural:** `main`’e doğrudan commit atmayın; hep branch açıp orada çalışın, sonra merge edin.
