const path = require("path");
const fs = require("fs");
const { OPENAI_API_KEY } = require("./config.js");

require("dotenv").config({ path: path.join(__dirname, ".env") });
if (OPENAI_API_KEY) console.log("OPENAI_API_KEY: yüklendi (ruhsat AI aktif)");
console.log("[Boot] index.js " + new Date().toISOString());

const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const { getLeads, getLeadById, insertLead, updateLead, getConversations, addConversation, getPackages, updatePackage, insertPackage, getSetting, setSetting, getOrAssignVariant, hasAnyLeadForChat } = require("./db");
const { extractRuhsatFromImage, syncLeadFieldsFromRuhsat } = require("./lib/ruhsat");
const { sendAndTrackTelegram, runTelegramMessageCleanup } = require("./lib/telegram");

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
 
 const app = express();
 const PORT = process.env.PORT || 3000;
 const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret";
 const ADMIN_USER = process.env.ADMIN_USER || "admin";
 const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
 const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

 const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
 const sessions = new Map();

 function createSessionToken() {
   const token = require("crypto").randomBytes(32).toString("hex");
   sessions.set(token, { createdAt: Date.now() });
   return token;
 }

 function isSessionValid(token) {
   if (!token) return false;
   const s = sessions.get(token);
   if (!s) return false;
   if (Date.now() - s.createdAt > SESSION_TTL_MS) {
     sessions.delete(token);
     return false;
   }
   return true;
 }

 if (!TELEGRAM_BOT_TOKEN) {
   console.error("Missing TELEGRAM_BOT_TOKEN in environment.");
   process.exit(1);
 }

 const chatStates = {};

/** Aynı fotoğraf tekrar gönderildiğinde AI maliyetini önlemek: (chatId:file_unique_id) -> { leadId, ruhsatData, timestamp } */
const photoCache = new Map();
const PHOTO_CACHE_TTL_MS = 10 * 60 * 1000; // 10 dakika

function getCachedPhotoResult(chatId, fileUniqueId) {
  const key = `${chatId}:${fileUniqueId}`;
  const entry = photoCache.get(key);
  if (!entry || Date.now() - entry.timestamp > PHOTO_CACHE_TTL_MS) return null;
  return entry;
}
function setCachedPhotoResult(chatId, fileUniqueId, leadId, ruhsatData) {
  photoCache.set(`${chatId}:${fileUniqueId}`, { leadId, ruhsatData, timestamp: Date.now() });
}

 
 app.use(express.urlencoded({ extended: true }));
 app.use(express.json());
 
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Simple auth middleware for admin routes
app.use("/admin", (req, res, next) => {
  if (req.method === "GET" && (req.path === "" || req.path === "/")) {
    return res.redirect(302, "/app/");
  }
  const authHeader = req.headers["x-admin-secret"] || req.query.secret;
  if (authHeader !== ADMIN_SECRET) {
    return res
      .status(401)
      .send("Erişim reddedildi. Yönetim paneline erişim için doğru gizli anahtar gerekir (URL’de ?secret=...).");
  }
   next();
 });
 
const STATUS_LABELS = {
  new: "Yeni",
  awaiting_name: "İsim bekleniyor",
  photo_received: "Fotoğraf alındı",
  awaiting_plate: "Plaka bekleniyor",
  plate_confirmed: "Plaka onaylandı",
  plate_rejected: "Plaka düzeltilecek",
  plate_manual: "Plaka elle girildi",
  awaiting_tc: "TC bekleniyor",
  awaiting_marka_km: "Marka/km bekleniyor",
  awaiting_package: "Paket seçimi bekleniyor",
  fiyat_bekleniyor: "Fiyat Bekleniyor",
  teklif_gonderildi: "Teklif Gönderildi",
  arama_bekliyor: "Aranma Bekleniyor",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
};

const GUN_ADLARI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function getMesaiSettings() {
  const start = getSetting("mesai_baslangic") || "09:00";
  const end = getSetting("mesai_bitis") || "18:00";
  const daysStr = getSetting("mesai_gunler") || "1,2,3,4,5";
  const days = daysStr.split(",").map((d) => parseInt(d.trim(), 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
  return { start, end, days: days.length ? days : [1, 2, 3, 4, 5] };
}

function getMesaiAraligi() {
  const { start, end, days } = getMesaiSettings();
  const gunStr = days.map((d) => GUN_ADLARI[d]).filter(Boolean).join("-") || "Pzt-Cum";
  return `${start}-${end}, ${gunStr}`;
}

function parseTime(str) {
  const m = String(str).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function isWithinMesai(now) {
  const d = now instanceof Date ? now : new Date(now);
  const day = d.getDay();
  const mins = d.getHours() * 60 + d.getMinutes();
  const { start, end, days } = getMesaiSettings();
  if (!days.includes(day)) return false;
  const startMins = parseTime(start);
  const endMins = parseTime(end);
  if (startMins == null || endMins == null) return true;
  return mins >= startMins && mins < endMins;
}

/** Mesai ayarlarından sonraki N mesai gününü döner. Özel tarih seçimi için. */
function getOzelTarihGunler(now, limit = 5) {
  const d = now instanceof Date ? now : new Date(now);
  const { days } = getMesaiSettings();
  const out = [];
  for (let i = 0; i <= 14 && out.length < limit; i++) {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    if (!days.includes(x.getDay())) continue;
    const label = i === 0 ? "Bugün" : i === 1 ? "Yarın" : i === 2 ? "Öbür gün" : formatOzelTarihGun(x);
    out.push({ offset: i, label, date: x });
  }
  return out;
}

function formatOzelTarihGun(d) {
  const day = d.getDate();
  const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  return `${day} ${months[d.getMonth()]}`;
}

/** Belirtilen gün için mesai saat aralığındaki slotları döner (HHMM). Bugünse geçmiş saatler atlanır. */
function getOzelTarihSaatler(dayOffset, now) {
  const base = new Date(now);
  base.setDate(base.getDate() + dayOffset);
  base.setHours(0, 0, 0, 0);
  const { start, end } = getMesaiSettings();
  const startMins = parseTime(start) ?? 9 * 60;
  const endMins = parseTime(end) ?? 18 * 60;
  const slots = [];
  const nowMins = (now.getHours() * 60 + now.getMinutes());
  for (let m = startMins; m < endMins; m += 60) {
    if (dayOffset === 0 && m <= nowMins) continue;
    const h = Math.floor(m / 60);
    const min = m % 60;
    const hhmm = String(h).padStart(2, "0") + String(min).padStart(2, "0");
    const label = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    slots.push({ hhmm, label });
  }
  return slots;
}

function getTahminiAramaSuresi(now) {
  const d = now instanceof Date ? now : new Date(now);
  const { start, end, days } = getMesaiSettings();
  const startMins = parseTime(start);
  const endMins = parseTime(end);
  const day = d.getDay();
  const mins = d.getHours() * 60 + d.getMinutes();
  for (let ahead = 0; ahead <= 7; ahead++) {
    const next = new Date(d);
    next.setDate(next.getDate() + ahead);
    const nextDay = next.getDay();
    if (!days.includes(nextDay)) continue;
    if (ahead === 0 && mins < (startMins ?? 0)) {
      const h = Math.floor((startMins ?? 0) / 60), m = (startMins ?? 0) % 60;
      return `Bugün ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} sonrası`;
    }
    if (ahead === 0 && mins >= (endMins ?? 24 * 60)) continue;
    if (ahead === 0) return "Yarın mesai başlangıcından itibaren";
    const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
    const h = Math.floor((startMins ?? 0) / 60), m = (startMins ?? 0) % 60;
    return `${dayNames[nextDay]} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} sonrası`;
  }
  return "Mesai saatleri içinde";
}

app.get("/ping", (req, res) => {
  res.send("OK");
});

app.get("/", (req, res) => {
  res.redirect(302, "/app/");
});

function apiAuth(req, res, next) {
  const token = req.headers["authorization"]?.replace(/^Bearer\s+/i, "")?.trim();
  if (!isSessionValid(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    const token = createSessionToken();
    return res.json({ token });
  }
  return res.status(401).json({ error: "Geçersiz kullanıcı adı veya şifre." });
});

app.get("/api/leads", apiAuth, (req, res) => {
  res.json(getLeads());
});
app.get("/api/conversations", apiAuth, (req, res) => {
  res.json(getConversations());
});

app.get("/api/packages", apiAuth, (req, res) => {
  res.json(getPackages());
});
app.post("/api/packages", apiAuth, (req, res) => {
  const p = req.body || {};
  const key = (p.key || "").trim().replace(/\s+/g, "_") || "pkg_yeni";
  try {
    const id = insertPackage({
      key,
      name: p.name || "",
      description: p.description || "",
      price: Number(p.price) || 0,
      discountPercent: Number(p.discountPercent) || 0,
      sortOrder: p.sortOrder != null ? Number(p.sortOrder) : undefined,
    });
    const list = getPackages();
    const created = list.find((x) => x.id === id) || list[list.length - 1];
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) return res.status(400).json({ error: "Bu paket anahtari zaten var." });
    throw err;
  }
});
app.put("/api/packages", apiAuth, (req, res) => {
  const list = req.body;
  if (!Array.isArray(list)) return res.status(400).json({ error: "Paket listesi gerekli." });
  for (const p of list) {
    if (p.id != null && p.id > 0 && (p.price != null || p.discountPercent != null || p.name != null || p.description != null || p.label != null)) {
      const updates = {};
      if (p.name != null) updates.name = p.name;
      if (p.description != null) updates.description = p.description;
      if (p.label != null) updates.label = p.label;
      if (p.price != null) updates.price = Number(p.price);
      if (p.discountPercent != null) updates.discountPercent = Number(p.discountPercent);
      if (p.sortOrder != null) updates.sortOrder = Number(p.sortOrder);
      if (Object.keys(updates).length) updatePackage(p.id, updates);
    }
  }
  res.json(getPackages());
});

app.get("/api/settings", apiAuth, (req, res) => {
  res.json({
    mesai_baslangic: getSetting("mesai_baslangic") || "09:00",
    mesai_bitis: getSetting("mesai_bitis") || "18:00",
    mesai_gunler: getSetting("mesai_gunler") || "1,2,3,4,5",
    mesaj_hemen_mesai_ici: getSetting("mesaj_hemen_mesai_ici") || "Müşteri temsilcilerimiz en kısa sürede sizi arayacak.",
    mesaj_hemen_mesai_dis: getSetting("mesaj_hemen_mesai_dis") || "Üzgünüz, şu anda mesai saatleri içinde değiliz. {mesaiAraligi} aralığında Özel tarih seçerek aranma zamanı oluşturabilirsiniz.",
    mesaj_ozel_tarih_istek: getSetting("mesaj_ozel_tarih_istek") || "Aranma zamanı seçin (mesai: {start}-{end})",
    mesaj_ozel_tarih_onay: getSetting("mesaj_ozel_tarih_onay") || "Tercihiniz kaydedildi. {tarih} tarihinde sizi arayacağız.",
    conversation_saklama_gunu: getSetting("conversation_saklama_gunu") || "30",
  });
});

app.put("/api/settings", apiAuth, (req, res) => {
  const { mesai_baslangic, mesai_bitis, mesai_gunler, mesaj_hemen_mesai_ici, mesaj_hemen_mesai_dis, mesaj_ozel_tarih_istek, mesaj_ozel_tarih_onay, conversation_saklama_gunu } = req.body || {};
  if (mesai_baslangic !== undefined) setSetting("mesai_baslangic", mesai_baslangic);
  if (mesai_bitis !== undefined) setSetting("mesai_bitis", mesai_bitis);
  if (mesai_gunler !== undefined) setSetting("mesai_gunler", mesai_gunler);
  if (mesaj_hemen_mesai_ici !== undefined) setSetting("mesaj_hemen_mesai_ici", mesaj_hemen_mesai_ici);
  if (mesaj_hemen_mesai_dis !== undefined) setSetting("mesaj_hemen_mesai_dis", mesaj_hemen_mesai_dis);
  if (mesaj_ozel_tarih_istek !== undefined) setSetting("mesaj_ozel_tarih_istek", mesaj_ozel_tarih_istek);
  if (mesaj_ozel_tarih_onay !== undefined) setSetting("mesaj_ozel_tarih_onay", mesaj_ozel_tarih_onay);
  if (conversation_saklama_gunu !== undefined) setSetting("conversation_saklama_gunu", String(conversation_saklama_gunu));
  res.json({
    mesai_baslangic: getSetting("mesai_baslangic") || "09:00",
    mesai_bitis: getSetting("mesai_bitis") || "18:00",
    mesai_gunler: getSetting("mesai_gunler") || "1,2,3,4,5",
    mesaj_hemen_mesai_ici: getSetting("mesaj_hemen_mesai_ici") || "Müşteri temsilcilerimiz en kısa sürede sizi arayacak.",
    mesaj_hemen_mesai_dis: getSetting("mesaj_hemen_mesai_dis") || "Üzgünüz, şu anda mesai saatleri içinde değiliz. {mesaiAraligi} aralığında Özel tarih seçerek aranma zamanı oluşturabilirsiniz.",
    mesaj_ozel_tarih_istek: getSetting("mesaj_ozel_tarih_istek") || "Aranma zamanı seçin (mesai: {start}-{end})",
    mesaj_ozel_tarih_onay: getSetting("mesaj_ozel_tarih_onay") || "Tercihiniz kaydedildi. {tarih} tarihinde sizi arayacağız.",
    conversation_saklama_gunu: getSetting("conversation_saklama_gunu") || "30",
  });
});

app.post("/api/leads/:id/send-quote", apiAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { price } = req.body || {};
  if (!id || !Number.isFinite(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ error: "Geçerli bir teklif ID ve fiyat gerekli." });
  }
  const lead = getLeadById(id);
  if (!lead) return res.status(404).json({ error: "Teklif bulunamadı." });
  const amount = Number(price);
  updateLead(id, { offeredPrice: amount, status: "teklif_gonderildi" });
  const pkgName = lead.packageChoice || "seçtiğiniz paket";
  const msg =
    `Harika haber! 🎉 Seçtiğiniz ${pkgName} için en uygun teklifimiz hazır: ${Math.round(amount).toLocaleString("tr-TR")} TL. ` +
    "Bu teklif 20 farklı şirketten taranarak en iyi fiyat olarak belirlenmiştir.";
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "📞 Evet, arasın", callback_data: "arama_evet_" + id }, { text: "Hayır", callback_data: "arama_hayir_" + id }],
    ],
  };
  try {
    await sendAndTrackTelegram(req.app.locals.bot.telegram, lead.chatId, msg);
    await sendAndTrackTelegram(req.app.locals.bot.telegram, lead.chatId, "Müşteri temsilcimiz sizi arasın mı? 📞", { reply_markup: replyMarkup });
  } catch (err) {
    console.error("Send quote Telegram error:", err.message);
    return res.status(500).json({ error: "Müşteriye mesaj gönderilemedi: " + err.message });
  }
  res.json(getLeadById(id));
});

app.get("/api/leads/:id/photo", apiAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const lead = getLeadById(id);
  if (!lead || !lead.imagePath || !fs.existsSync(lead.imagePath)) {
    return res.status(404).send("Not found");
  }
  res.sendFile(path.resolve(lead.imagePath));
});

/** Ruhsat fotoğrafından AI analiz tekrar çalıştırır; mevcut lead’i ruhsatData ve tc/isim vb. ile günceller */
app.post("/api/leads/:id/reparse-ruhsat", apiAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Geçersiz teklif ID." });
  const lead = getLeadById(id);
  if (!lead) return res.status(404).json({ error: "Teklif bulunamadı." });
  if (!lead.imagePath || !fs.existsSync(lead.imagePath)) {
    return res.status(400).json({ error: "Bu teklifte ruhsat görseli yok." });
  }
  try {
    const ruhsatData = await extractRuhsatFromImage(lead.imagePath) || {};
    const sync = syncLeadFieldsFromRuhsat(ruhsatData);
    updateLead(id, { ruhsatData, ...sync });
    const updated = getLeadById(id);
    res.json(updated);
  } catch (e) {
    console.error("Reparse ruhsat:", e.message);
    res.status(500).json({ error: "Ruhsat analiz edilemedi: " + (e.message || "Bilinmeyen hata") });
  }
});

app.patch("/api/leads/:id", apiAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Geçersiz teklif ID." });
  const lead = getLeadById(id);
  if (!lead) return res.status(404).json({ error: "Teklif bulunamadı." });
  const { km, packageChoice } = req.body || {};
  const updates = {};
  if (km !== undefined) updates.km = km == null || String(km).trim() === "" ? null : String(km).trim();
  if (packageChoice !== undefined) updates.packageChoice = packageChoice == null || String(packageChoice).trim() === "" ? null : String(packageChoice).trim();
  if (Object.keys(updates).length) updateLead(id, updates);
  res.json(getLeadById(id));
});

// Serve uploaded photos only for admin (secret required by middleware)
app.get("/admin/photo/:filename", (req, res) => {
  const raw = req.params.filename;
  const safe = path.basename(raw).replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!safe) return res.status(400).send("Bad request");
  const filePath = path.join(UPLOAD_DIR, safe);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  res.sendFile(path.resolve(filePath));
});

// Yeni React admin arayüzüne yönlendir (eski HTML /admin artık kullanılmıyor)
app.get("/admin", (req, res) => {
  res.redirect(302, "/app/");
});

 // Admin SPA (React): build with "cd admin-app && npm run build"
 const adminDist = path.join(__dirname, "admin-app", "dist");
 if (fs.existsSync(adminDist)) {
   app.use("/app", express.static(adminDist));
   app.get(/^\/app(\/.*)?$/, (req, res) => {
     res.sendFile(path.join(adminDist, "index.html"));
   });
 }

 // Telegram bot setup
 const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
 app.locals.bot = bot;
 
function addMessage(chatId, role, text, opts = {}) {
  addConversation({
    chatId,
    role,
    text: text || (opts.type === "photo" ? "[Fotoğraf]" : ""),
    type: opts.type || "text",
    filePath: opts.filePath || null,
    timestamp: Date.now(),
  });
}

const IN_FLOW_MODES = ["ask_name", "ask_plate", "confirm_plate", "ask_tc", "ask_tescil_sira", "ask_belge_seri", "ask_ruhsat_seri", "ask_kullanim_tarzi", "ask_marka_km", "awaiting_package"];

function createLead({ chatId, imagePath, plate, status, requestType }) {
  const id = insertLead({
    chatId,
    createdAt: Date.now(),
    imagePath: imagePath || null,
    plate: plate || null,
    plateVerified: false,
    tc: null,
    markaKm: null,
    packageChoice: null,
    phone: null,
    status: status || "new",
    requestType: requestType || "teklif",
  });
  return getLeadById(id);
}

function findLeadById(id) {
  return getLeadById(id);
}

function setChatState(chatId, state) {
  if (!state) {
    delete chatStates[chatId];
  } else {
    chatStates[chatId] = state;
  }
}

/** Manuel giriş validasyonu: Plaka — boşlukları sil, büyük harfe çevir; en az 5 karakter (örn. 34ABC123, 06ANK06). */
function normalizeAndValidatePlate(input) {
  if (!input || typeof input !== "string") return null;
  const normalized = input.replace(/\s/g, "").toUpperCase().trim();
  if (normalized.length < 5) return null;
  if (!/^\d{2}[A-Z]{1,3}\d{2,4}$/.test(normalized)) return null;
  return normalized;
}

/** TC Kimlik No: sadece 11 rakam. */
function validateTc(input) {
  if (!input || typeof input !== "string") return null;
  const raw = input.replace(/\s/g, "");
  return /^\d{11}$/.test(raw) ? raw : null;
}

/** Ruhsat Seri Kodu ve No: 2 harf + 6 rakam (örn. AA 123456 veya AA123456). */
function normalizeAndValidateRuhsatSeriNo(input) {
  if (!input || typeof input !== "string") return null;
  const normalized = input.replace(/\s/g, "").toUpperCase().trim();
  if (!/^[A-Z]{2}\d{6}$/.test(normalized)) return null;
  return normalized.slice(0, 2) + " " + normalized.slice(2);
}

/** (Y.2) Tescil Sıra No: sadece rakamlar, 10–25 hane. */
function validateTescilSiraNo(input) {
  if (!input || typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 25 ? digits : null;
}

/** Ruhsat verisinde marka bilgisi var mı (ruhsattan okunmuşsa sadece km sorulur). */
function hasMarkaFromRuhsat(lead) {
  const rd = lead.ruhsatData || {};
  return !!(lead.marka && String(lead.marka).trim()) || !!(rd.marka && String(rd.marka).trim()) || !!(rd.markaTip && String(rd.markaTip).trim());
}

/** Ruhsat sonrası sıradaki eksik alan: "tescil" | "belge" | "kullanim" | "marka_km". */
function nextMissingRuhsatField(lead) {
  const rd = lead.ruhsatData || {};
  if (!(rd.ruhsatSeriNo && String(rd.ruhsatSeriNo).trim()) && !(lead.ruhsatSeriNo && String(lead.ruhsatSeriNo).trim())) return "tescil";
  if (!(rd.belgeSeriNo && String(rd.belgeSeriNo).trim())) return "belge";
  if (!(rd.kullanimTarzi || rd.kullanimAmaci) || !String(rd.kullanimTarzi || rd.kullanimAmaci).trim()) return "kullanim";
  return "marka_km";
}

const MENU_TEXT_WELCOME =
  "Merhaba! 🚗 Araç sigortası dijital asistanına hoş geldiniz.\n\n" +
  "Size nasıl yardımcı olabilirim? Teklif almak, hasar bildirimi veya canlı destek için aşağıdaki menüden seçim yapabilirsiniz. 😊";

const MENU_TEXT_RETURNING =
  "Tekrar hoş geldiniz! 😊 Size nasıl yardımcı olabilirim?\n\n" +
  "Lütfen aşağıdan bir işlem seçin.";

 function menuInlineKeyboard() {
   return Markup.inlineKeyboard([
     [Markup.button.callback("📋 Yeni Teklif", "menu_1"), Markup.button.callback("🚗 Hasar", "menu_2")],
     [Markup.button.callback("📄 Poliçe", "menu_3"), Markup.button.callback("📑 Belge", "menu_4")],
     [Markup.button.callback("💬 Canlı Destek", "menu_5")],
   ]);
 }

 function menuTransitionConfirmKeyboard(menuData) {
   return Markup.inlineKeyboard([
     [Markup.button.callback("Evet, iptal et", "cancel_and_menu_" + menuData)],
     [Markup.button.callback("Hayır, devam et", "cancel_no")],
   ]);
 }

 function isInFlow(state) {
   return state && state.mode && IN_FLOW_MODES.includes(state.mode);
 }

 function cancelLeadAndClearState(chatId) {
   const state = chatStates[chatId];
   if (state && state.leadId) {
     const lead = getLeadById(state.leadId);
     if (lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId)) {
       updateLead(lead.id, { status: "cancelled" });
     }
   }
   setChatState(chatId, null);
 }

 bot.start((ctx) => {
   const chatId = ctx.chat.id;
   addMessage(chatId, "user", "/start");
   const isFirstTime = !hasAnyLeadForChat(chatId);
   const menuText = isFirstTime ? MENU_TEXT_WELCOME : MENU_TEXT_RETURNING;
   addMessage(chatId, "bot", menuText);
   return sendAndTrackTelegram(ctx.telegram, ctx.chat.id, menuText, menuInlineKeyboard());
 });

 bot.on("callback_query", async (ctx) => {
   const data = ctx.callbackQuery?.data;
   const chatId = ctx.callbackQuery?.message?.chat?.id;
   if (data?.startsWith("arama_")) console.log("[callback] arama:", data, "chatId:", chatId);
   if (!data || !chatId) return ctx.answerCbQuery();

   try {
   try { await ctx.answerCbQuery(); } catch (e) { if (!String(e?.message || "").includes("too old")) console.warn("answerCbQuery:", e?.message); }

  if (data.startsWith("arama_evet_")) {
    const leadId = parseInt(data.replace("arama_evet_", ""), 10);
    const lead = leadId ? getLeadById(leadId) : null;
    const chatMatch = lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId);
    if (!lead) console.warn("[arama_evet] Lead bulunamadi:", leadId);
    else if (!chatMatch) console.warn("[arama_evet] chatId eslesmedi:", { leadChatId: lead.chatId, ctxChatId: chatId, types: [typeof lead.chatId, typeof chatId] });
    if (lead && chatMatch) {
       const now = new Date();
       const mesaiIci = isWithinMesai(now);
       const rows = [
         [Markup.button.callback("⏱️ Hemen", "arama_zaman_hemen_" + leadId)],
         [Markup.button.callback("📅 Özel tarih", "arama_zaman_ozel_tarih_" + leadId)],
       ];
       const mesaj = mesaiIci ? "Temsilcimiz sizi ne zaman arasın? 📞" : "Üzgünüz, şu anda mesai saatleri dışındayız. 😅 Temsilcimiz sizi ne zaman arasın?";
       await sendAndTrackTelegram(ctx.telegram, chatId, mesaj, Markup.inlineKeyboard(rows));
     }
     return;
   }
   if (data.startsWith("arama_zaman_")) {
     const rest = data.replace("arama_zaman_", "");
     const lastUnderscore = rest.lastIndexOf("_");
     const choice = lastUnderscore >= 0 ? rest.slice(0, lastUnderscore) : rest;
     const leadId = parseInt(lastUnderscore >= 0 ? rest.slice(lastUnderscore + 1) : "", 10);
     const lead = leadId ? getLeadById(leadId) : null;
     const chatMatch = lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId);
     if (!lead) console.warn("[arama_zaman] Lead bulunamadi:", leadId, "data:", data);
     else if (!chatMatch) console.warn("[arama_zaman] chatId eslesmedi:", { leadChatId: lead.chatId, ctxChatId: chatId });
     if (lead && chatMatch && choice === "ozel_tarih") {
       const now = new Date();
       const gunler = getOzelTarihGunler(now);
       if (gunler.length === 0) {
         await sendAndTrackTelegram(ctx.telegram, chatId, "Şu an için uygun mesai günü bulunamadı. 😅 Lütfen daha sonra tekrar deneyin.");
         return;
       }
       const rows = gunler.map((g) => [Markup.button.callback(g.label, "arama_ozel_gun_" + g.offset + "_" + lead.id)]);
       const { start, end } = getMesaiSettings();
       const istekTpl = getSetting("mesaj_ozel_tarih_istek") || "Aranma zamanı seçin (mesai: {start}-{end})";
       const istekMsg = istekTpl.replace(/\{start\}/g, start).replace(/\{end\}/g, end);
       await sendAndTrackTelegram(ctx.telegram, chatId, istekMsg, Markup.inlineKeyboard(rows));
       return;
     }
     if (lead && chatMatch && choice === "hemen") {
       const now = new Date();
       const mesaiIci = isWithinMesai(now);
       if (mesaiIci) {
         const msg = getSetting("mesaj_hemen_mesai_ici") || "Müşteri temsilcilerimiz en kısa sürede sizi arayacak. 📞 Teşekkürler! 😊";
         await sendAndTrackTelegram(ctx.telegram, chatId, msg);
         updateLead(lead.id, { status: "arama_bekliyor", aramaTercihi: "Hemen" });
         console.log("[arama_zaman] OK - lead", lead.id, "status=arama_bekliyor", "tercih=Hemen");
       } else {
         const template = getSetting("mesaj_hemen_mesai_dis") || "Üzgünüz, şu anda mesai saatleri içinde değiliz. {mesaiAraligi} aralığında Özel tarih seçerek aranma zamanı oluşturabilirsiniz.";
         const msg = template.replace(/\{mesaiAraligi\}/g, getMesaiAraligi());
         const rows = [[Markup.button.callback("Özel tarih", "arama_zaman_ozel_tarih_" + lead.id)]];
         await sendAndTrackTelegram(ctx.telegram, chatId, msg, Markup.inlineKeyboard(rows));
       }
     }
     return;
   }
   if (data.startsWith("arama_ozel_gun_")) {
     const parts = data.replace("arama_ozel_gun_", "").split("_");
     const dayOffset = parseInt(parts[0], 10);
     const leadId = parseInt(parts[1], 10);
     const lead = leadId ? getLeadById(leadId) : null;
     const chatMatch = lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId);
     if (lead && chatMatch) {
       const now = new Date();
       const saatler = getOzelTarihSaatler(dayOffset, now);
       if (saatler.length === 0) {
         await sendAndTrackTelegram(ctx.telegram, chatId, "Bu gün için uygun saat kalmadı. 😅 Lütfen başka bir gün seçin.");
         return;
       }
       const perRow = 4;
       const rows = [];
       for (let i = 0; i < saatler.length; i += perRow) {
         const chunk = saatler.slice(i, i + perRow);
         rows.push(chunk.map((s) => Markup.button.callback(s.label, "arama_ozel_saat_" + dayOffset + "_" + s.hhmm + "_" + lead.id)));
       }
       const gunler = getOzelTarihGunler(now);
       const gunLabel = gunler.find((g) => g.offset === dayOffset)?.label || `${dayOffset} gün sonra`;
       await sendAndTrackTelegram(ctx.telegram, chatId, `${gunLabel} için saat seçin: ⏰`, Markup.inlineKeyboard(rows));
     }
     return;
   }
   if (data.startsWith("arama_ozel_saat_")) {
     const rest = data.replace("arama_ozel_saat_", "");
     const match = rest.match(/^(\d+)_(\d{4})_(\d+)$/);
     if (!match) return;
     const dayOffset = parseInt(match[1], 10);
     const hhmm = match[2];
     const leadId = parseInt(match[3], 10);
     const lead = leadId ? getLeadById(leadId) : null;
     const chatMatch = lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId);
     if (lead && chatMatch) {
       const now = new Date();
       const d = new Date(now);
       d.setDate(d.getDate() + dayOffset);
       const h = parseInt(hhmm.slice(0, 2), 10);
       const m = parseInt(hhmm.slice(2, 4), 10);
       d.setHours(h, m, 0, 0);
       const gunler = getOzelTarihGunler(new Date(), 1);
       const gunLabel = dayOffset === 0 ? "Bugün" : dayOffset === 1 ? "Yarın" : formatOzelTarihGun(d);
       const saatLabel = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
       const aramaTercihi = `${gunLabel} ${saatLabel}`;
       updateLead(lead.id, { status: "arama_bekliyor", aramaTercihi });
       const onayTpl = getSetting("mesaj_ozel_tarih_onay") || "Tercihiniz kaydedildi. {tarih} tarihinde sizi arayacağız.";
       await sendAndTrackTelegram(ctx.telegram, chatId, onayTpl.replace(/\{tarih\}/g, aramaTercihi));
       console.log("[arama_ozel_saat] OK - lead", lead.id, "aramaTercihi=", aramaTercihi);
     }
     return;
   }
   if (data.startsWith("arama_hayir_")) {
     await sendAndTrackTelegram(ctx.telegram, chatId, "Tamam, anladım. 😊 İhtiyacınız olursa her zaman bize ulaşabilirsiniz. İyi günler dilerim! 🙏");
     return;
   }

   if (data === "teklif_yontem_yaz") {
     if (isInFlow(chatStates[chatId])) {
       const reply = "Şu anda devam eden bir işleminiz var. İptal edip yeni işleme geçmek ister misiniz?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard([
         [Markup.button.callback("Evet, iptal et", "teklif_yontem_yaz_confirm")],
         [Markup.button.callback("Hayır, devam", "cancel_no")],
       ]));
       return;
     }
     addMessage(chatId, "user", "[Yöntem: Bilgileri yazarak]");
     const lead = createLead({ chatId, status: "awaiting_name", requestType: "teklif" });
     setChatState(chatId, { mode: "ask_name", leadId: lead.id });
     const reply = "Harika! 😊 Önce adınız ve soyadınızı alabilir miyim lütfen? (Örn: Ahmet Yılmaz)";
     addMessage(chatId, "bot", reply);
     await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     return;
   }
  if (data === "teklif_yontem_yaz_confirm") {
    cancelLeadAndClearState(chatId);
    const reply = "İşleminiz iptal edilmiştir. 😊 Size nasıl yardımcı olabilirim?";
    addMessage(chatId, "bot", reply);
    await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuInlineKeyboard());
    return;
   }
   if (data === "teklif_yontem_ruhsat") {
     if (isInFlow(chatStates[chatId])) {
       const reply = "Şu anda devam eden bir işleminiz var. İptal edip yeni işleme geçmek ister misiniz?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard([
         [Markup.button.callback("Evet, iptal et", "teklif_yontem_ruhsat_confirm")],
         [Markup.button.callback("Hayır, devam", "cancel_no")],
       ]));
       return;
     }
     addMessage(chatId, "user", "[Yöntem: Ruhsat fotoğrafı]");
     const lead = createLead({ chatId, status: "awaiting_plate", requestType: "teklif" });
     setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
     const reply = "📸 Lütfen ruhsat fotoğrafınızı gönderin. Plaka, TC ve diğer bilgileri görselden otomatik okuyacağım.";
     addMessage(chatId, "bot", reply);
     await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     return;
   }
  if (data === "teklif_yontem_ruhsat_confirm") {
    cancelLeadAndClearState(chatId);
    const reply = "İşleminiz iptal edilmiştir. 😊 Size nasıl yardımcı olabilirim?";
    addMessage(chatId, "bot", reply);
    await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuInlineKeyboard());
    return;
   }

  if (data === "main_menu") {
    cancelLeadAndClearState(chatId);
    addMessage(chatId, "bot", MENU_TEXT_RETURNING);
     await sendAndTrackTelegram(ctx.telegram, chatId, MENU_TEXT_RETURNING, menuInlineKeyboard());
     return;
   }

   if (data === "cancel_no") {
     try {
       await ctx.telegram.editMessageText(chatId, ctx.callbackQuery.message.message_id, void 0, "Tamam, mevcut işleminize devam edebilirsiniz.");
     } catch (e) {
       if (!String(e?.message || "").includes("message is not modified")) console.warn("cancel_no edit:", e?.message);
     }
     return;
   }

  if (data && data.startsWith("cancel_and_menu_") && /^cancel_and_menu_[1-5]$/.test(data)) {
    cancelLeadAndClearState(chatId);
    const reply = "İşleminiz iptal edildi. 😊 Size nasıl yardımcı olabilirim?";
    addMessage(chatId, "bot", reply);
    await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuInlineKeyboard());
    return;
  }

   if (data.startsWith("manual_plate_")) {
     const leadId = parseInt(data.replace("manual_plate_", ""), 10);
     const lead = leadId ? getLeadById(leadId) : null;
     if (lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId)) {
       setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
       const reply = "📸 Fotoğrafınız alındı, teşekkürler! Plaka kısmını net okuyamadım. Lütfen plakanızı yazar mısınız? (Örn: 34ABC123)";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     }
     return;
   }
   if (data.startsWith("manual_tc_")) {
     const leadId = parseInt(data.replace("manual_tc_", ""), 10);
     const lead = leadId ? getLeadById(leadId) : null;
     if (lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId)) {
       setChatState(chatId, { mode: "ask_tc", leadId: lead.id });
       const reply = "🆔 TC Kimlik No 11 haneli olmalı. Lütfen sadece rakamları yazar mısınız?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     }
     return;
   }
   if (data.startsWith("manual_tescil_")) {
     const leadId = parseInt(data.replace("manual_tescil_", ""), 10);
     const lead = leadId ? getLeadById(leadId) : null;
     if (lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId)) {
       setChatState(chatId, { mode: "ask_tescil_sira", leadId: lead.id });
       const reply = "📄 (Y.2) TESÇİL SIRA NO kısmını net göremedim. Ruhsatınızdaki (Y.2) numarayı lütfen sadece rakamlarla yazar mısınız? (Genelde 16-20 hane)";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     }
     return;
   }
   if (data.startsWith("manual_belge_")) {
     const leadId = parseInt(data.replace("manual_belge_", ""), 10);
     const lead = leadId ? getLeadById(leadId) : null;
     if (lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId)) {
       setChatState(chatId, { mode: "ask_belge_seri", leadId: lead.id });
       const reply = "Belge Seri No kısmını tam okuyamadım. Sağ altta 2 harf + 6 rakam var (örnek: HF 964933). Lütfen yazar mısınız? 📄";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     }
     return;
   }
   if (data.startsWith("retry_upload_")) {
     const leadId = parseInt(data.replace("retry_upload_", ""), 10);
     const lead = leadId ? getLeadById(leadId) : null;
     if (lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId)) {
       setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
       const reply = "📸 Lütfen ruhsat fotoğrafınızı tekrar gönderin; bilgileri görüntüden okumayı deneyeceğim. 😊";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     }
     return;
   }

   if (data === "menu_1") {
     const state = chatStates[chatId];
     if (isInFlow(state)) {
       const reply = "Şu anda devam eden bir işleminiz var. İptal edip yeni işleme geçmek ister misiniz?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuTransitionConfirmKeyboard("1"));
       return;
     }
     addMessage(chatId, "user", "[Menü: Yeni Teklif]");
    const teklifTanitim =
      "Merhaba! 😊 Ben araç sigortası konusunda yanınızdayım. Size en uygun teklifi sunabilmem için birkaç bilgiye ihtiyacım var; " +
      "ardından paket seçiminize göre fiyat sunacağız.\n\n" +
      "Nasıl devam etmek istersiniz?";
     const yontemKlavye = Markup.inlineKeyboard([
       [Markup.button.callback("✍️ Bilgileri yazarak", "teklif_yontem_yaz")],
       [Markup.button.callback("📸 Ruhsat fotoğrafı göndererek", "teklif_yontem_ruhsat")],
       [Markup.button.callback("🏠 Ana Menü", "main_menu")],
     ]);
     addMessage(chatId, "bot", teklifTanitim);
     await sendAndTrackTelegram(ctx.telegram, chatId, teklifTanitim, yontemKlavye);
     return;
   }
   if (data === "menu_2") {
     const state = chatStates[chatId];
     if (isInFlow(state)) {
       const reply = "Şu anda devam eden bir işleminiz var. İptal edip yeni işleme geçmek ister misiniz?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuTransitionConfirmKeyboard("2"));
       return;
     }
     addMessage(chatId, "user", "[Menü: Hasar]");
     const reply =
       "Çok geçmiş olsun! 🙏 Güvenli bir alanda mısınız?\n\n" +
       "Hasar sürecini hızlandırmak için:\n" +
       "📍 Konum paylaşabilirsiniz (en yakın çekici yönlendirmesi)\n" +
       "📸 Hasar fotoğrafı gönderebilirsiniz\n" +
       "📞 Acil çekici için: 0850 XXX XX XX\n\n" +
       "İsterseniz aşağıdan Canlı Destek ile temsilciye bağlanabilirsiniz. 😊";
     addMessage(chatId, "bot", reply);
     await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuInlineKeyboard());
     return;
   }
   if (data === "menu_3") {
     const state = chatStates[chatId];
     if (isInFlow(state)) {
       const reply = "Şu anda devam eden bir işleminiz var. İptal edip yeni işleme geçmek ister misiniz?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuTransitionConfirmKeyboard("3"));
       return;
     }
     addMessage(chatId, "user", "[Menü: Poliçe]");
     const reply =
       "📄 Poliçe bilgi ve kapsam sorgulama özelliği yakında devreye alınacak.\n\n" +
       "Şimdilik teklif almak veya canlı destek için aşağıdaki menüyü kullanabilirsiniz. 😊";
     addMessage(chatId, "bot", reply);
     await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuInlineKeyboard());
     return;
   }
   if (data === "menu_4") {
     const state = chatStates[chatId];
     if (isInFlow(state)) {
       const reply = "Şu anda devam eden bir işleminiz var. İptal edip yeni işleme geçmek ister misiniz?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuTransitionConfirmKeyboard("4"));
       return;
     }
     addMessage(chatId, "user", "[Menü: Belge]");
     const reply =
       "📑 Belge talebi (poliçe PDF, kartuş, makbuz) özelliği yakında eklenecek.\n\n" +
       "Canlı destekten belge talebinde bulunmak için aşağıdaki menüden Canlı Destek'e tıklayabilirsiniz. 😊";
     addMessage(chatId, "bot", reply);
     await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuInlineKeyboard());
     return;
   }
   if (data === "menu_5") {
     const state = chatStates[chatId];
     if (isInFlow(state)) {
       const reply = "Şu anda devam eden bir işleminiz var. İptal edip yeni işleme geçmek ister misiniz?";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply, menuTransitionConfirmKeyboard("5"));
       return;
     }
     addMessage(chatId, "user", "[Menü: Canlı Destek]");
     const reply =
       "Hemen sizi bir temsilcimize yönlendiriyoruz. 💬 Bekleme süresi yaklaşık 2 dakika. Lütfen ayrılmayın.\n\n" +
       "Temsilcimiz en kısa sürede dönüş yapacaktır. 😊";
     addMessage(chatId, "bot", reply);
     await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     return;
   }

   if (data.startsWith("pkg_")) {
     const state = chatStates[chatId];
     const lead = state?.leadId ? findLeadById(state.leadId) : null;
     if (!lead) return;

    if (data === "pkg_detay") {
      const pkgs = getPackages();
      const reply =
        pkgs.map((p) => `${p.name}: ${p.description}`).join("\n\n") +
        "\n\nHangi kapsamda koruma istersiniz? Aşağıdaki butonlardan seçin. 😊";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, packageInlineKeyboard(false));
      return;
    }
     if (data === "pkg_ara") {
       lead.packageChoice = "Beni Ara";
       lead.status = "completed";
       updateLead(lead.id, { packageChoice: "Beni Ara", status: "completed" });
       setChatState(chatId, null);
       const reply =
         "Talebiniz alındı. 📞 Temsilcimiz en kısa sürede sizi arayıp size özel fiyat ve indirim seçeneklerini sunacaktır. Teşekkürler! 😊";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply);
       return;
     }
     const pkgMap = Object.fromEntries(getPackages().map((p) => [p.key, p.name]));
     const pkg = pkgMap[data];
     if (pkg) {
       lead.packageChoice = pkg;
       updateLead(lead.id, { packageChoice: pkg, status: "fiyat_bekleniyor" });
       setChatState(chatId, null);
       const reply =
         "Tercihiniz kaydedildi. 😊 Teklifiniz hazırlanıyor; en kısa sürede size dönüş yapacağız.";
       addMessage(chatId, "bot", reply);
       await sendAndTrackTelegram(ctx.telegram, chatId, reply);
     }
   }
   } catch (err) {
     console.error("callback_query error:", err.message || err);
   }
 });

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userText = ctx.message.text || "";
  addMessage(chatId, "user", userText);

  const selamlar = ["merhaba", "selam", "hi", "hey", "günaydın", "iyi günler", "iyi akşamlar"];
  if (selamlar.some((s) => userText.trim().toLowerCase() === s)) {
    const state = chatStates[chatId];
    if (isInFlow(state)) {
      const reply = "Devam eden teklifiniz var. Menüye dönmek istediğinize emin misiniz? Mevcut işlem iptal olacak.";
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("Menüye dön", "main_menu")],
        [Markup.button.callback("Devam et", "cancel_no")],
      ]);
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply, keyboard);
      return;
    }
    setChatState(chatId, null);
    const isFirstTime = !hasAnyLeadForChat(chatId);
    const menuText = isFirstTime ? MENU_TEXT_WELCOME : MENU_TEXT_RETURNING;
    addMessage(chatId, "bot", menuText);
    await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, menuText, menuInlineKeyboard());
    return;
  }

  const state = chatStates[chatId];

  if (state && state.mode === "ask_name") {
    const fullName = userText.trim();
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!fullName || fullName.length < 2) {
      const reply = "Lütfen adınızı ve soyadınızı yazar mısınız? ✍️ (Örn: Ahmet Yılmaz)";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    } else {
      const parts = fullName.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      updateLead(lead.id, { firstName, lastName, status: "awaiting_plate" });
      setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
      const reply =
        `Teşekkürler ${firstName}! 😊 İşlemi başlatmak için aracınızın plakasını yazar mısınız? (Örn: 34ABC123)\n\n` +
        "İsterseniz ruhsat fotoğrafı da gönderebilirsiniz; bilgileri görselden otomatik okuruz. 📸";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  }

  if (state && state.mode === "confirm_plate") {
    const answer = userText.trim().toLowerCase();
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (["e", "evet", "doğru", "dogru"].includes(answer)) {
      lead.plate = state.plateGuess;
      lead.plateVerified = true;
      lead.status = "plate_confirmed";
      updateLead(lead.id, { plate: lead.plate, plateVerified: true, status: "plate_confirmed" });
      const updated = getLeadById(lead.id);
      const ruhsatData = updated.ruhsatData || {};
      const hasTc = updated.tc && String(updated.tc).replace(/\D/g, "").length === 11;
      if (hasTc) {
        const next = nextMissingRuhsatField(updated);
        if (next === "tescil") {
          setChatState(chatId, { mode: "ask_tescil_sira", leadId: lead.id });
          const reply = `Teşekkürler! 😊 Plakanız ${lead.plate} olarak kaydedildi.\n\n(Y.2) TESÇİL SIRA NO kısmını net göremedim. Lütfen ruhsatınızdaki (Y.2) numarayı sadece rakamlarla yazar mısınız? (Genelde 16-20 hane) 📄`;
          const rows = [
            [Markup.button.callback("✍️ Tescil No'yu elle yazayım", "manual_tescil_" + lead.id)],
            [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
          ];
          addMessage(chatId, "bot", reply);
          await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
          return;
        }
        if (next === "belge") {
          setChatState(chatId, { mode: "ask_belge_seri", leadId: lead.id });
          const reply = `Teşekkürler! 😊 Plakanız ${lead.plate} olarak kaydedildi.\n\nBelge Seri No kısmını tam okuyamadım. Sağ altta 2 harf + 6 rakam var (örnek: HF 964933). Lütfen yazar mısınız? 📄`;
          const rows = [
            [Markup.button.callback("✍️ Belge No'yu elle yazayım", "manual_belge_" + lead.id)],
            [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
          ];
          addMessage(chatId, "bot", reply);
          await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
          return;
        }
        if (next === "kullanim") {
          setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
          const reply = `Görselden okuyamadım. 😅 Aracınızın kullanım tarzını lütfen yazar mısınız? (Örn: Hususi otomobil, kamyonet)`;
          addMessage(chatId, "bot", reply);
          await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
          return;
        }
        updated.status = "awaiting_marka_km";
        updateLead(lead.id, { status: "awaiting_marka_km" });
        setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
        const hasMarka = hasMarkaFromRuhsat(updated);
        const reply = hasMarka
          ? `Teşekkürler! 😊 Plakanız ${lead.plate} olarak kaydedildi.\n\nAracınızın yaklaşık km bilgisini lütfen yazar mısınız? (Örn: 45000 km) 🚗`
          : `Teşekkürler! 😊 Plakanız ${lead.plate} olarak kaydedildi.\n\nAracınızın markası ve yaklaşık km bilgisini lütfen yazar mısınız? (Örn: Toyota Corolla 45000 km) 🚗`;
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
        return;
      }
      setChatState(chatId, { mode: "ask_tc", leadId: lead.id });
      const reply =
        `Teşekkürler! 😊 Plakanız ${lead.plate} olarak kaydedildi.\n\n` +
        "Size özel hasarsızlık indirimlerini sorgulayabilmem için T.C. Kimlik Numaranızı alabilir miyim lütfen? (11 rakam) 🆔";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    } else if (["h", "hayır"].includes(answer)) {
      lead.status = "plate_rejected";
      updateLead(lead.id, { status: "plate_rejected" });
      setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
      const reply = "Anladım. 😊 Lütfen plakayı doğru şekilde yazar mısınız? (Örn: 34ABC123 veya 06ANK06)";
      const rows = [
        [Markup.button.callback("✍️ Plakayı elle yazayım", "manual_plate_" + lead.id)],
        [Markup.button.callback("🏠 Ana Menü", "main_menu")],
      ];
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
      return;
    } else {
      const reply = 'Plaka doğruysa "E", yanlışsa "H" yazar mısınız lütfen? 😊';
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  } else if (state && state.mode === "ask_plate") {
    const plate = normalizeAndValidatePlate(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!plate) {
      const reply = "Plaka formatı hatalı görünüyor. 😅 Lütfen sadece rakam ve harfleri yazar mısınız? (Örn: 34ABC123 veya 06ANK06)";
      const rows = [
        [Markup.button.callback("✍️ Plakayı elle yazayım", "manual_plate_" + lead.id)],
        [Markup.button.callback("🏠 Ana Menü", "main_menu")],
      ];
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
      return;
    } else {
      lead.plate = plate;
      lead.plateVerified = false;
      lead.status = "plate_manual";
      updateLead(lead.id, { plate, plateVerified: false, status: "plate_manual" });
      const updated = getLeadById(lead.id);
      const ruhsatData = updated.ruhsatData || {};
      const hasTc = updated.tc && String(updated.tc).replace(/\D/g, "").length === 11;
      if (hasTc) {
        const next = nextMissingRuhsatField(updated);
        if (next === "tescil") {
          setChatState(chatId, { mode: "ask_tescil_sira", leadId: lead.id });
          const msg = "(Y.2) TESÇİL SIRA NO kısmını net göremedim. 📄 Lütfen ruhsatınızdaki (Y.2) numarayı sadece rakamlarla yazar mısınız? (Genelde 16-20 hane)";
          const rows = [
            [Markup.button.callback("✍️ Tescil No'yu elle yazayım", "manual_tescil_" + lead.id)],
            [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
          ];
          addMessage(chatId, "bot", msg);
          await sendAndTrackTelegram(ctx.telegram, chatId, msg, Markup.inlineKeyboard(rows));
          return;
        }
        if (next === "belge") {
          setChatState(chatId, { mode: "ask_belge_seri", leadId: lead.id });
          const msg = "Belge Seri No kısmını tam okuyamadım. Sağ altta 2 harf + 6 rakam var (örnek: HF 964933). Lütfen yazar mısınız? 📄";
          const rows = [
            [Markup.button.callback("✍️ Belge No'yu elle yazayım", "manual_belge_" + lead.id)],
            [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
          ];
          addMessage(chatId, "bot", msg);
          await sendAndTrackTelegram(ctx.telegram, chatId, msg, Markup.inlineKeyboard(rows));
          return;
        }
        if (next === "kullanim") {
          setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
          const msg = "Görselden okuyamadım. 😅 Aracınızın kullanım tarzını lütfen yazar mısınız? (Örn: Hususi otomobil, kamyonet)";
          addMessage(chatId, "bot", msg);
          await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, msg);
          return;
        }
        updateLead(lead.id, { status: "awaiting_marka_km" });
        setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
        const hasMarka = hasMarkaFromRuhsat(updated);
        const msg = hasMarka ? "Teşekkürler! 😊\n\nAracınızın yaklaşık km bilgisini lütfen yazar mısınız? (Örn: 45000 km) 🚗" : "Teşekkürler! 😊\n\nAracınızın markası ve yaklaşık km bilgisini lütfen yazar mısınız? (Örn: Toyota Corolla 45000 km) 🚗";
        addMessage(chatId, "bot", msg);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, msg);
        return;
      }
      setChatState(chatId, { mode: "ask_tc", leadId: lead.id });
      const reply =
        "Teşekkürler! 🚗 Şimdi, size özel hasarsızlık indirimlerini sorgulayabilmemiz için T.C. Kimlik Numaranızı alabilir miyim? (11 rakam)";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  }

  if (state && state.mode === "ask_tc") {
    const tc = validateTc(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!tc) {
      const reply = "TC Kimlik No 11 haneli olmalı. 🆔 Bir rakam eksik olabilir mi? Lütfen kontrol edip tekrar yazar mısınız?";
      const rows = [
        [Markup.button.callback("✍️ Tekrar yazayım", "manual_tc_" + lead.id)],
        [Markup.button.callback("🏠 Ana Menü", "main_menu")],
      ];
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
      return;
    } else {
      lead.tc = tc;
      const ruhsatData = lead.ruhsatData || {};
      if (ruhsatData.tcKimlik !== tc) {
        ruhsatData.tcKimlik = tc;
        updateLead(lead.id, { tc, ruhsatData });
      } else {
        updateLead(lead.id, { tc });
      }
      const updatedAfterTc = getLeadById(lead.id);
      const next = nextMissingRuhsatField(updatedAfterTc);
      if (next === "tescil") {
        setChatState(chatId, { mode: "ask_tescil_sira", leadId: lead.id });
        const reply = "Son olarak, (Y.2) TESÇİL SIRA NO kısmını net göremedim. 📄 Lütfen ruhsatınızdaki (Y.2) numarayı sadece rakamlarla yazar mısınız? (Genelde 16-20 hane)";
        const rows = [
          [Markup.button.callback("✍️ Tescil No'yu elle yazayım", "manual_tescil_" + lead.id)],
          [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
        ];
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
        return;
      }
      if (next === "belge") {
        setChatState(chatId, { mode: "ask_belge_seri", leadId: lead.id });
        const reply = "Belge Seri No kısmını tam okuyamadım. Sağ altta 2 harf + 6 rakam var (örnek: HF 964933). Lütfen yazar mısınız? 📄";
        const rows = [
          [Markup.button.callback("✍️ Belge No'yu elle yazayım", "manual_belge_" + lead.id)],
          [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
        ];
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
        return;
      }
      if (next === "kullanim") {
        setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
        const reply = "Görselden okuyamadım. 😅 Aracınızın kullanım tarzını lütfen yazar mısınız? (Örn: Hususi otomobil, kamyonet, ticari taksi)";
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
        return;
      }
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const hasMarka = hasMarkaFromRuhsat(updatedAfterTc);
      const reply = hasMarka ? "Teşekkürler! 😊\n\nAracınızın yaklaşık km bilgisini lütfen yazar mısınız? (Örn: 45000 km) 🚗" : "Teşekkürler! 😊\n\nAracınızın markası ve yaklaşık km bilgisini lütfen yazar mısınız? (Örn: Toyota Corolla 45000 km) 🚗";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  }

  if (state && state.mode === "ask_tescil_sira") {
    const tescilNo = validateTescilSiraNo(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!tescilNo) {
      const reply = "(Y.2) TESÇİL SIRA NO formatı hatalı görünüyor. 😅 Lütfen sadece rakamlarla yazar mısınız? (Genelde 16-20 hane, örn: 1234567890123)";
      const rows = [
        [Markup.button.callback("✍️ Tekrar yazayım", "manual_tescil_" + lead.id)],
        [Markup.button.callback("🏠 Ana Menü", "main_menu")],
      ];
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
      return;
    } else {
      const ruhsatData = { ...(lead.ruhsatData || {}), ruhsatSeriNo: tescilNo };
      lead.ruhsatData = ruhsatData;
      updateLead(lead.id, { ruhsatData, ruhsatSeriNo: tescilNo });
      const updated = getLeadById(lead.id);
      const next = nextMissingRuhsatField(updated);
      if (next === "belge") {
        setChatState(chatId, { mode: "ask_belge_seri", leadId: lead.id });
        const reply = "Belge Seri No kısmını tam okuyamadım. Sağ altta 2 harf + 6 rakam var (örnek: HF 964933). Lütfen yazar mısınız? 📄";
        const rows = [
          [Markup.button.callback("✍️ Belge No'yu elle yazayım", "manual_belge_" + lead.id)],
          [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
        ];
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
        return;
      }
      if (next === "kullanim") {
        setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
        const reply = "Görselden okunamadı: Aracınızın kullanım tarzı nedir? (Örn: Hususi otomobil, kamyonet)";
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
        return;
      }
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const hasMarka = hasMarkaFromRuhsat(updated);
      const reply = hasMarka ? "Aracınızın yaklaşık km bilgisini lütfen yazar mısınız? (Örn: 45000 km) 🚗" : "Aracınızın markası ve yaklaşık km bilgisini lütfen yazar mısınız? (Örn: Toyota Corolla 45000 km) 🚗";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  }

  if (state && state.mode === "ask_belge_seri") {
    const belgeSeri = normalizeAndValidateRuhsatSeriNo(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!belgeSeri) {
      const reply = "Belge Seri No kısmını tam okuyamadım. Sağ altta 2 harf + 6 rakam var (örnek: HF 964933). Lütfen yazar mısınız? 📄";
      const rows = [
        [Markup.button.callback("✍️ Tekrar yazayım", "manual_belge_" + lead.id)],
        [Markup.button.callback("🏠 Ana Menü", "main_menu")],
      ];
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
      return;
    } else {
      const normalized = belgeSeri.replace(/\s/g, "");
      const ruhsatData = { ...(lead.ruhsatData || {}), belgeSeriNo: normalized };
      lead.ruhsatData = ruhsatData;
      updateLead(lead.id, { ruhsatData });
      const updated = getLeadById(lead.id);
      const next = nextMissingRuhsatField(updated);
      if (next === "kullanim") {
        setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
        const reply = "Görselden okunamadı: Aracınızın kullanım tarzı nedir? (Örn: Hususi otomobil, kamyonet)";
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
        return;
      }
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const hasMarka = hasMarkaFromRuhsat(updated);
      const reply = hasMarka ? "Aracınızın yaklaşık km bilgisini lütfen yazar mısınız? (Örn: 45000 km) 🚗" : "Aracınızın markası ve yaklaşık km bilgisini lütfen yazar mısınız? (Örn: Toyota Corolla 45000 km) 🚗";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  }

  if (state && state.mode === "ask_ruhsat_seri") {
    const seriNo = normalizeAndValidateRuhsatSeriNo(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!seriNo) {
      const reply = "Belge Seri No kısmını tam okuyamadım. 2 harf + 6 rakam (örnek: AA 123456). Lütfen yazar mısınız? 📄";
      const rows = [
        [Markup.button.callback("✍️ Tekrar yazayım", "manual_belge_" + lead.id)],
        [Markup.button.callback("🏠 Ana Menü", "main_menu")],
      ];
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
      return;
    } else {
      const normalized = seriNo.replace(/\s/g, "");
      const ruhsatData = { ...(lead.ruhsatData || {}), belgeSeriNo: normalized };
      lead.ruhsatData = ruhsatData;
      updateLead(lead.id, { ruhsatData });
      const updated = getLeadById(lead.id);
      const next = nextMissingRuhsatField(updated);
      if (next === "kullanim") {
        setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
        const reply = "Görselden okuyamadım. 😅 Aracınızın kullanım tarzını lütfen yazar mısınız? (Örn: Hususi otomobil, kamyonet, ticari taksi)";
        addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
        return;
      }
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const hasMarka = hasMarkaFromRuhsat(updated);
      const reply = hasMarka ? "Teşekkürler! 😊\n\nAracınızın yaklaşık km bilgisini lütfen yazar mısınız? (Örn: 45000 km) 🚗" : "Teşekkürler! 😊\n\nAracınızın markası ve yaklaşık km bilgisini lütfen yazar mısınız? (Örn: Toyota Corolla 45000 km) 🚗";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  }

  if (state && state.mode === "ask_kullanim_tarzi") {
    const kullanim = userText.trim();
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!kullanim || kullanim.length < 2) {
      const reply = "Lütfen kullanım tarzını kısaca yazar mısınız? (Örn: Hususi, Ticari, Taksi) 😊";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    } else {
      const ruhsatData = { ...(lead.ruhsatData || {}), kullanimTarzi: kullanim };
      lead.ruhsatData = ruhsatData;
      updateLead(lead.id, { ruhsatData });
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const hasMarka = hasMarkaFromRuhsat(lead);
      const reply = hasMarka
        ? "Harika! Tüm bilgileri aldım. 🏁 Son olarak aracınızın yaklaşık km bilgisini yazar mısınız? (Örn: 45000 km)"
        : "Harika! Tüm bilgileri aldım. 🏁 Son olarak aracınızın markası ve yaklaşık km bilgisini yazar mısınız? (Örn: Toyota Corolla 45000 km)";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
      return;
    }
  }

  if (state && state.mode === "ask_marka_km") {
    const markaKm = userText.trim();
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else {
      const hasMarka = hasMarkaFromRuhsat(lead);
      // 45000 km, 125.000 km, 45000 kilometre, veya sadece 45000 (4–6 rakam)
      const kmWithUnit = markaKm.match(/(\d[\d.\s]*?)\s*(?:km|kilometre)\s*$/i);
      const kmOnly = markaKm.match(/\b(\d{4,7})\s*$/) || (hasMarka && markaKm.match(/^(\d{4,7})$/));
      const kmMatch = kmWithUnit || kmOnly;
      const kmRaw = kmMatch ? String(kmMatch[1]).replace(/[\s.]/g, "") : null;
      const km = kmRaw && /^\d+$/.test(kmRaw) ? kmRaw : null;
      const marka = hasMarka ? null : (kmMatch ? markaKm.replace(kmMatch[0], "").trim() : markaKm);

      if (hasMarka) {
        if (!km) {
          const reply = "Lütfen yaklaşık km bilgisini yazar mısınız? (Örn: 45000 veya 45000 km) 🚗";
          addMessage(chatId, "bot", reply);
          await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
          return;
        }
      } else {
        if (markaKm.length < 3 || !km) {
          const reply = "Lütfen marka ve km bilgisini kısaca yazar mısınız? (Örn: Honda Civic 62000 km) 🚗";
          addMessage(chatId, "bot", reply);
          await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
          return;
        }
      }

      const updates = { markaKm: markaKm || (lead.markaKm || ""), status: "awaiting_package" };
      if (marka) updates.marka = marka;
      if (km) updates.km = km;
      updateLead(lead.id, updates);
      setChatState(chatId, { mode: "awaiting_package", leadId: lead.id });
      const reply =
        "Bilgileriniz alındı. 😊 Hangi sigorta paketini tercih ediyorsunuz? Aşağıdaki butonlardan seçin.";
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply, packageInlineKeyboard());
      return;
    }
  }

  // Menü seçimleri (aktif state yokken)
  const menuChoice = userText.trim();
  if (["1", "1️⃣ yeni teklif al", "teklif", "yeni teklif"].includes(menuChoice.toLowerCase())) {
    const lead = createLead({ chatId, status: "awaiting_name" });
    setChatState(chatId, { mode: "ask_name", leadId: lead.id });
    const reply =
      "Merhaba! 😊 Size daha iyi hizmet verebilmek için önce adınız ve soyadınızı alabilir miyim lütfen? (Örn: Ahmet Yılmaz)";
    addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
    return;
  }
  if (["2", "2️⃣ hasar / yol yardım", "hasar", "kaza"].includes(menuChoice.toLowerCase())) {
    const reply =
      "Çok geçmiş olsun! 🙏 Güvenli bir alanda mısınız?\n\n" +
      "Hasar sürecini hızlandırmak için:\n" +
      "📍 Konum paylaşabilirsiniz (en yakın çekici yönlendirmesi)\n" +
      "📸 Hasar fotoğrafı gönderebilirsiniz\n" +
      "📞 Acil çekici için: 0850 XXX XX XX\n\n" +
      "İsterseniz \"5\" veya \"Canlı Destek\" yazarak temsilciye bağlanabilirsiniz. 😊";
    addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
    return;
  }
  if (["3", "3️⃣ poliçe sorgulama", "poliçe", "sorgulama"].includes(menuChoice.toLowerCase())) {
    const reply =
      "📄 Poliçe bilgi ve kapsam sorgulama özelliği yakında devreye alınacak.\n\n" +
      "Şimdilik teklif almak için \"1\" yazabilir veya \"5\" ile canlı destek talep edebilirsiniz. 😊";
    addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
    return;
  }
  if (["4", "4️⃣ belge talebi", "belge", "poliçe pdf"].includes(menuChoice.toLowerCase())) {
    const reply =
      "📑 Belge talebi (poliçe PDF, kartuş, makbuz) özelliği yakında eklenecek.\n\n" +
      "\"5\" yazarak canlı destekten belge talebinde bulunabilirsiniz. 😊";
    addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
    return;
  }
  if (["5", "5️⃣ canlı destek", "canlı destek", "temsilci"].includes(menuChoice.toLowerCase())) {
    const reply =
      "Hemen sizi bir temsilcimize yönlendiriyoruz. 💬 Bekleme süresi yaklaşık 2 dakika. Lütfen ayrılmayın.\n\n" +
      "Temsilcimiz en kısa sürede dönüş yapacaktır. 😊";
    addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
    return;
  }

  // Fallback: sadece butonlar, tekrarlı liste yok
  const reply = "Size nasıl yardımcı olabilirim? Aşağıdaki butonlardan seçin: 😊";
  addMessage(chatId, "bot", reply);
  await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply, menuInlineKeyboard());
});

/** includeDetay: true = ilk sefer (Detay butonu var), false = Detay tıklandıktan sonra (sadece paketler). Beni Ara hiç gösterilmez. */
function packageInlineKeyboard(includeDetay = true) {
  const packages = getPackages();
  const rows = packages.map((p) => [Markup.button.callback(p.name, p.key)]);
  if (includeDetay) rows.push([Markup.button.callback("Detay", "pkg_detay")]);
  return Markup.inlineKeyboard(rows);
}

async function sendPackageCompletion(ctx, chatId, lead, pkg) {
  const reply = "Tercihiniz kaydedildi. 😊 Teklifiniz hazırlanıyor; en kısa sürede size dönüş yapacağız.";
  addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
}

bot.on("photo", async (ctx) => {
  const chatId = ctx.chat.id;
  const photo = ctx.message.photo;
  const largest = photo[photo.length - 1];
  const fileId = largest.file_id;
  const fileUniqueId = largest.file_unique_id || String(fileId);

  // Aynı fotoğraf tekrar gönderildiyse AI çağrısı yapma (maliyet tasarrufu)
  const cached = getCachedPhotoResult(chatId, fileUniqueId);
  if (cached) {
    const lead = getLeadById(cached.leadId);
    if (lead && (String(lead.chatId) === String(chatId) || lead.chatId == chatId)) {
      addMessage(chatId, "user", "[Fotoğraf]");
      const ruhsatData = cached.ruhsatData || {};
      const guessedPlate = (ruhsatData.plaka && ruhsatData.plaka.trim()) ? ruhsatData.plaka.trim() : null;
      const ruhsatSummary = [];
      if (ruhsatData.ruhsatSeriNo) ruhsatSummary.push(`Tescil Sıra No: ${ruhsatData.ruhsatSeriNo}`);
      if (ruhsatData.belgeSeriNo) ruhsatSummary.push(`Belge Seri No: ${ruhsatData.belgeSeriNo}`);
      if (ruhsatData.markaTip) ruhsatSummary.push(`Marka/Tip: ${ruhsatData.markaTip}`);
      if (ruhsatData.modelYili) ruhsatSummary.push(`Model Yılı: ${ruhsatData.modelYili}`);
      if (ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci) ruhsatSummary.push(`Kullanım: ${ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci}`);
      if (ruhsatData.sasiNo) ruhsatSummary.push(`Şasi: ${ruhsatData.sasiNo}`);
      if (ruhsatData.motorNo) ruhsatSummary.push(`Motor No: ${ruhsatData.motorNo}`);
      const summaryBlock = ruhsatSummary.length > 0 ? "\n\n📋 Okunan ruhsat bilgileri:\n" + ruhsatSummary.join("\n") : "";
      setChatState(chatId, { mode: "confirm_plate", leadId: lead.id, plateGuess: guessedPlate });
      const reply = "Bu fotoğrafı az önce işlemiştik. 😊 Mevcut teklifinize devam edebilirsiniz." + (guessedPlate ? summaryBlock + `\n\nPlaka: ${guessedPlate}\nDoğruysa "E", yanlışsa "H" yazın.` : summaryBlock + "\n\nPlakayı elle yazmak için aşağıdaki butonu kullanabilirsiniz.");
      const kb = guessedPlate ? {} : Markup.inlineKeyboard([[Markup.button.callback("✍️ Plakayı elle yazayım", "manual_plate_" + lead.id)], [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)]]);
      addMessage(chatId, "bot", reply);
      await sendAndTrackTelegram(ctx.telegram, chatId, reply, kb);
      return;
    }
  }

  let savedPath = null;
  try {
    const file = await ctx.telegram.getFile(fileId);
    const filePath = file.file_path;
    const ext = path.extname(filePath) || ".jpg";
    const baseName = `${chatId}_${Date.now()}${ext}`;
    savedPath = path.join(UPLOAD_DIR, baseName);

    const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Download failed");
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(savedPath, buf);
  } catch (err) {
    console.error("Photo download error:", err.message);
  }

  addMessage(chatId, "user", "[Fotoğraf]", {
    type: "photo",
    filePath: savedPath,
  });

  const existingState = chatStates[chatId];
  let lead;
  if (existingState && existingState.mode === "ask_plate" && existingState.leadId) {
    lead = findLeadById(existingState.leadId);
    if (lead) {
      lead.imagePath = savedPath;
      lead.status = "photo_received";
      updateLead(lead.id, { imagePath: savedPath, status: "photo_received" });
    }
  }
  if (!lead) {
    lead = createLead({
      chatId,
      imagePath: savedPath,
      status: "photo_received",
    });
  }

  // Ruhsat AI analiz: varsayılan açık. RUHSAT_AI_ON_PHOTO=false yaparsanız fotoğrafta çağrılmaz (sadece admin "Ruhsattan tekrar oku" ile)
  let ruhsatData = {};
  const aiOnPhoto = process.env.RUHSAT_AI_ON_PHOTO !== "false" && process.env.RUHSAT_AI_ON_PHOTO !== "0";
  if (savedPath && aiOnPhoto) {
    try {
      const loadingMsg = await ctx.telegram.sendMessage(chatId, "Ruhsat fotoğrafınız inceleniyor, lütfen bekleyin... 🔍");
      ruhsatData = await extractRuhsatFromImage(savedPath) || {};
      try { await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id); } catch (_) {}
      if (Object.keys(ruhsatData).length > 0) {
        updateLead(lead.id, { ruhsatData, ...syncLeadFieldsFromRuhsat(ruhsatData) });
        lead.ruhsatData = ruhsatData;
        setCachedPhotoResult(chatId, fileUniqueId, lead.id, ruhsatData);
      }
    } catch (e) {
      console.error("Ruhsat AI analiz:", e.message);
    }
  }

  const guessedPlate = (ruhsatData.plaka && ruhsatData.plaka.trim()) ? ruhsatData.plaka.trim() : null;

  const ruhsatSummary = [];
  if (ruhsatData.ruhsatSeriNo) ruhsatSummary.push(`Tescil Sıra No: ${ruhsatData.ruhsatSeriNo}`);
  if (ruhsatData.belgeSeriNo) ruhsatSummary.push(`Belge Seri No: ${ruhsatData.belgeSeriNo}`);
  if (ruhsatData.markaTip) ruhsatSummary.push(`Marka/Tip: ${ruhsatData.markaTip}`);
  if (ruhsatData.modelYili) ruhsatSummary.push(`Model Yılı: ${ruhsatData.modelYili}`);
  if (ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci) ruhsatSummary.push(`Kullanım: ${ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci}`);
  if (ruhsatData.sasiNo) ruhsatSummary.push(`Şasi: ${ruhsatData.sasiNo}`);
  if (ruhsatData.motorNo) ruhsatSummary.push(`Motor No: ${ruhsatData.motorNo}`);
  const summaryBlock = ruhsatSummary.length > 0 ? "\n\n📋 Okunan ruhsat bilgileri:\n" + ruhsatSummary.join("\n") : "";

  if (guessedPlate) {
    setChatState(chatId, {
      mode: "confirm_plate",
      leadId: lead.id,
      plateGuess: guessedPlate,
    });
    const reply =
      "Ruhsat fotoğrafınız alındı, teşekkürler! 📸" + summaryBlock + "\n\n" +
      `Görselden okunan plaka: ${guessedPlate}\n\n` +
      'Plaka doğruysa "E", yanlışsa "H" yazar mısınız lütfen? 😊';
    addMessage(chatId, "bot", reply);
        await sendAndTrackTelegram(ctx.telegram, ctx.chat.id, reply);
  } else {
    lead.status = "awaiting_plate";
    updateLead(lead.id, { status: "awaiting_plate" });
    setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
    const isNothingRead = ruhsatSummary.length === 0;
    const reply = isNothingRead
      ? "Ruhsat fotoğrafınız alındı, teşekkürler! 📸 Görüntü biraz bulanık olabilir; bilgileri net okuyamadım. İsterseniz tekrar çekebilir veya elle girebilirsiniz. 😊"
      : "Ruhsat fotoğrafınız alındı, teşekkürler! 📸" + summaryBlock + "\n\nPlaka kısmını net okuyamadım. Lütfen plakanızı yazar mısınız? (Örn: 34ABC123)";
    const rows = [
      [Markup.button.callback("✍️ Plakayı elle yazayım", "manual_plate_" + lead.id)],
      [Markup.button.callback("📸 Tekrar fotoğraf çek", "retry_upload_" + lead.id)],
    ];
    addMessage(chatId, "bot", reply);
    await sendAndTrackTelegram(ctx.telegram, chatId, reply, Markup.inlineKeyboard(rows));
  }
});

bot.launch().then(async () => {
   console.log("Telegram bot started.");
   try { await runTelegramMessageCleanup(bot.telegram); } catch (e) { console.warn("[telegram] Başlangıç temizliği:", e?.message); }
 }).catch((err) => {
   console.error("Telegram bot baslatilamadi (sunucu yine de calisiyor):", err.message);
 });

 app.listen(PORT, "0.0.0.0", () => {
   console.log(`Server: http://localhost:${PORT}  ve  http://127.0.0.1:${PORT}`);
   console.log(`Admin panel: http://127.0.0.1:${PORT}/app/`);
   console.log("(Bu terminali kapatmayin.)");
  console.log("Baglanamazsan: 1) Adres olarak http://127.0.0.1:" + PORT + "/app/ ac. 2) Opera yerine Chrome/Edge dene. 3) .env icinde PORT=3001 yazip tekrar baslat.");
 });
