const path = require("path");
const fs = require("fs");
const { OPENAI_API_KEY } = require("../config.js");

const RUHSAT_PROMPT = `Bu görsel Türkiye Trafik Tescil Belgesi (ruhsat) fotoğrafıdır.
Aşağıdaki JSON anahtarlarına göre gördüğün tüm bilgileri çıkar. Bulamadığın alan için null kullan.
Sadece geçerli JSON döndür, markdown veya açıklama ekleme.

ÖNEMLİ KURALLAR:
- (E) ŞASE NO ile (P.5) MOTOR NO'yu asla karıştırma. Şase No (sasiNo) belgede (E) ŞASE NO yazan yerdeki 17 haneli VIN'dir (genelde NLH vb. harfle başlar). Motor No (motorNo) (P.5) MOTOR NO yazan yerdeki numaradır (örn. D4F ile başlayabilir). Her birini kendi alanından oku.
- (Y.2) TESCİL SIRA NO sadece rakamlardan oluşan uzun numaradır; rakam rakam aynen kopyala, boşluk/tire koyma. O harfi 0 (sıfır) değildir.
- Belge Seri No (belgeSeriNo): Ruhsatın SAĞ tarafında, QR kodun (barkod) hemen ALTINDA yer alır. Orada "belge seri:" yazan yerde 2 harf (örn. hf) ve "No" yazan yerde 6 rakam (örn. 964933) vardır. Sadece bu 2 harf + 6 rakamı birleştir (örn. HF964933). Araya N veya başka karakter ekleme; (Y.2) Tescil Sıra No ile karıştırma.
- marka SADECE (D.1) MARKASI olsun (örn. HYUNDAI). PBT, i20 gibi tip/ticari adı ekleme.

{
  "plaka": "34KN5930 formatında",
  "tcKimlik": "11 haneli TC kimlik no",
  "sahibiAdiSoyadi": "Ad Soyad",
  "ruhsatSeriNo": "(Y.2) TESCİL SIRA NO — sadece rakamlar, boşluksuz (örn. 20240807102652626393)",
  "belgeSeriNo": "Ruhsatın SAĞ tarafında QR kodun ALTINDA 'belge seri:' (2 harf) ve 'No' (6 rakam) alanı; sadece 2 harf + 6 rakam örn. HF964933",
  "marka": "SADECE (D.1) MARKASI, örn HYUNDAI (tip/ticari adı ekleme)",
  "tipi": "(D.2) TİPİ + (D.3) TİCARİ ADI (örn PBT, i20)",
  "modelYili": "örn 2013",
  "markaTip": "tip + ticari adı (D.2 + D.3), marka değil",
  "kullanimTarzi": "örn OTOMOBİL (AF ÇOK AMAÇLI)",
  "kullanimAmaci": "kullanım amacı",
  "tescilTarihi": "gg/aa/yyyy",
  "sasiNo": "SADECE (E) ŞASE NO alanındaki 17 haneli VIN",
  "motorNo": "SADECE (P.5) MOTOR NO alanındaki numara",
  "renk": "örn BEYAZ",
  "km": "belgede km yazıyorsa sadece sayı, yoksa null"
}`;

function syncLeadFieldsFromRuhsat(ruhsatData) {
  if (!ruhsatData || typeof ruhsatData !== "object") return {};
  const o = {};
  if (ruhsatData.tcKimlik && String(ruhsatData.tcKimlik).replace(/\D/g, "").length === 11) o.tc = String(ruhsatData.tcKimlik).replace(/\D/g, "");
  if (ruhsatData.sahibiAdiSoyadi && String(ruhsatData.sahibiAdiSoyadi).trim()) {
    const parts = String(ruhsatData.sahibiAdiSoyadi).trim().split(/\s+/);
    if (parts.length >= 1) o.firstName = parts[0];
    if (parts.length >= 2) o.lastName = parts.slice(1).join(" ");
  }
  if (ruhsatData.ruhsatSeriNo) {
    const digits = String(ruhsatData.ruhsatSeriNo).replace(/\D/g, "");
    o.ruhsatSeriNo = digits.length > 0 ? digits : ruhsatData.ruhsatSeriNo;
  }
  if (ruhsatData.marka) o.marka = ruhsatData.marka;
  if (ruhsatData.tipi) o.model = ruhsatData.tipi;
  if (ruhsatData.modelYili) o.model = o.model ? `${o.model} ${ruhsatData.modelYili}` : String(ruhsatData.modelYili);
  if (ruhsatData.plaka && String(ruhsatData.plaka).replace(/\s/g, "").length >= 5) o.plate = String(ruhsatData.plaka).replace(/\s/g, "").toUpperCase().trim();
  if (ruhsatData.km != null && String(ruhsatData.km).trim()) o.km = String(ruhsatData.km).replace(/\D/g, "").trim() || null;
  return o;
}

async function extractRuhsatFromImage(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY .env içinde boş veya yok; ruhsat AI atlanıyor. .env dosyasına OPENAI_API_KEY=sk-... ekleyin.");
    return {};
  }
  try {
    const buf = fs.readFileSync(filePath);
    const base64 = buf.toString("base64");
    const ext = (path.extname(filePath) || "").toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: RUHSAT_PROMPT },
              { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${err}`);
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return {};
    const parsed = JSON.parse(raw);

    if (parsed.ruhsatSeriNo) {
      const digits = String(parsed.ruhsatSeriNo).replace(/\D/g, "");
      parsed.ruhsatSeriNo = digits.length > 0 ? digits : parsed.ruhsatSeriNo;
    }
    if (parsed.belgeSeriNo) {
      const s = String(parsed.belgeSeriNo).replace(/\s/g, "").toUpperCase();
      const match = s.match(/^([A-Z]{2})(\d{6})$/);
      if (match) {
        parsed.belgeSeriNo = match[1] + match[2];
      } else {
        const letters = (s.match(/[A-Za-z]/g) || []).join("").toUpperCase().slice(0, 2);
        const digits = (s.match(/\d/g) || []).join("").slice(0, 6);
        if (letters.length === 2 && digits.length === 6) parsed.belgeSeriNo = letters + digits;
        else delete parsed.belgeSeriNo;
      }
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v != null && String(v).trim() !== "" && v !== "null")
    );
  } catch (err) {
    console.error("Ruhsat AI analiz hatası:", err.message);
    return {};
  }
}

module.exports = { extractRuhsatFromImage, syncLeadFieldsFromRuhsat };
