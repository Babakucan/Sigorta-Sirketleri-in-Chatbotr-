# Merge Rehberi – Arkadaşın Frontend Değişiklikleri

Arkadaşın `admin-app/src/` altında değişiklik yapıyorsa merge sırasında dikkat et:

## Düşük risk (çakışma nadir)
- `index.js` – backend, frontend ile dokunmuyor
- `db.js` – backend
- `package.json` (root) – React kaldırıldı, admin-app bağımsız
- Ruhsat loading mesajı – index.js içinde

## Orta/yüksek risk – App.tsx refaktörü
App.tsx parçalara bölündü: `LeadCard`, `ConversationsView`, `PackagesView`, `SettingsView` vb. ayrı dosyalara taşındı.

**Merge stratejisi:**
1. Sen `git pull` yap veya arkadaşının branch'ini merge et
2. Çakışma olursa: Bizim yeni component dosyalarını koru, arkadaşın `App.tsx` değişikliklerini yeni component'lere **elle taşı**
3. Alternatif: Arkadaşın önce kendi değişikliklerini commit etsin, sen bu refaktörü ondan **sonra** uygula

## Yeni dosya yapısı (refaktör sonrası)
```
admin-app/src/
  App.tsx          (ana component, import'lar)
  LeadCard.tsx
  ConversationsView.tsx
  PackagesView.tsx
  SettingsView.tsx
  LeadDetailModal.tsx
  types.ts         (ortak tipler)
  ...
```

## Önerilen akış
1. Bu refaktörü kendi branch'inde yap (örn. `refactor/split-components`)
2. Arkadaşın bitirdiği değişiklikleri `main` veya `feature/frontend`'e merge et
3. Sonra refaktör branch'ini merge et; çakışmaları çöz
4. Veya: Refaktörü **ertelersen**, sadece backend değişiklikleri (index.js, loading mesajı) uygula
