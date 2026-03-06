# Sayfa Düzeni ve Karmaşayı Azaltma Önerileri

Sayfalarda karmaşa olmaması ve **işlem yapılmayan / tarih** gibi bilgilerin net görünmesi için aşağıdaki öneriler uygulanabilir.

---

## 1. Teklifler sayfası

### Tarih bilgisi
- **Her teklif kartında** "Oluşturulma" veya "Son işlem" tarihi gösterilmeli.
- Örnek: *"5 Mar 2025"* veya *"2 gün önce"* (relative time).
- Böylece hangi talebin ne kadar süredir beklediği anlaşılır.

### Filtre / sekmeler
- **Tümü** | **Fiyat bekleyen** | **Bu hafta** gibi kısa filtreler:
  - **Fiyat bekleyen:** Sadece `status === 'fiyat_bekleniyor'` olanlar (yapılacak işler öne çıkar).
  - **Bu hafta:** `createdAt` bu hafta içinde olanlar.
- Liste tek ekranda kalır, öncelik netleşir.

### Özet satırı
- Sayfanın üstünde kısa özet:  
  *"12 teklif · 3 tanesi fiyat bekliyor"*
- Böylece kaç işin beklemede olduğu hemen görülür.

### Sıralama (opsiyonel)
- Varsayılan: En yeni önce (şu an API zaten `created_at DESC`).
- Seçenek: **"Fiyat bekleyenler önce"** — aksiyon gerekenler listenin üstünde.

---

## 2. Konuşmalar sayfası

- Zaten zaman bilgisi var; **"Son mesaj: 2 saat önce"** gibi net bir etiket eklenebilir.
- Sıralama: En son mesajı en yeni olan sohbet üstte (mevcut mantık korunabilir).

---

## 3. Backend / veri (ileride)

### `updated_at` alanı
- Leads tablosuna **`updated_at`** eklenirse:
  - Son durum değişikliği (teklif gönderildi, fiyat beklemede vb.) takip edilir.
  - "3 gündür işlem yapılmadı" gibi uyarılar verilebilir.

### İsteğe bağlı alanlar
- **`quoted_at`:** Teklifin müşteriye gönderildiği tarih.
- **`last_activity_at`:** Son mesaj veya son admin işlemi.

Bunlar raporlama ve "işlem yapılmamış" listeleri için faydalı olur.

---

## 4. Dashboard özeti (üst kısım)

- Ana sayfada (teklifler sekmesinin hemen üstünde) küçük **istatistik kartları**:
  - **Bugünkü talepler:** Bu gün oluşturulan lead sayısı.
  - **Fiyat bekleyen:** Kaç teklifin fiyat girişi beklediği.
  - **Bu hafta teklif gönderilen:** Son 7 günde teklif gönderilen sayı.
- Sayılar tıklanabilir olabilir (ör. "Fiyat bekleyen"e tıklayınca filtre uygulanır).

---

## 5. Öncelik sırası (uygulama)

| Öncelik | Öneri | Zorluk |
|--------|--------|--------|
| 1 | Kartlarda tarih (oluşturulma / "X gün önce") | Kolay |
| 2 | Özet satırı ("X teklif · Y fiyat bekliyor") | Kolay |
| 3 | Filtre: Tümü / Fiyat bekleyen | Kolay |
| 4 | Filtre: Bu hafta | Kolay |
| 5 | Üstte özet kartları (sayılar) | Orta |
| 6 | Sıralama: "Fiyat bekleyenler önce" | Orta |
| 7 | Backend: `updated_at` / `quoted_at` | Orta |

İstersen önce 1–4 uygulanıp sayfa sade ve anlaşılır hale getirilebilir; 5–7 sonra eklenebilir.
