const path = require("path");
const fs = require("fs");
const { OPENAI_API_KEY } = require("./config.js");

require("dotenv").config({ path: path.join(__dirname, ".env") });
if (OPENAI_API_KEY) console.log("OPENAI_API_KEY: yüklendi (ruhsat AI aktif)");

const express = require("express");
const { Telegraf, Markup } = require("telegraf");
const { getLeads, getLeadById, insertLead, updateLead, getConversations, addConversation, getPackages, updatePackage, insertPackage } = require("./db");

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
  completed: "Tamamlandı",
};

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
    `Harika haber! Seçtiğiniz ${pkgName} için en uygun teklifimiz hazır: ${Math.round(amount).toLocaleString("tr-TR")} TL. ` +
    "Bu teklif 20 farklı şirketten taranarak en iyi fiyat olarak belirlenmiştir. Onaylıyor musunuz?";
  try {
    await req.app.locals.bot.telegram.sendMessage(lead.chatId, msg);
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

function createLead({ chatId, imagePath, plate, status }) {
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
  });
  return getLeadById(id);
}

function findLeadById(id) {
  return getLeadById(id);
}

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

const MENU_TEXT =
   "Merhaba! Araç sigortası dijital asistanına hoş geldiniz. Aracınız ve güvenliğiniz için buradayım.\n\n" +
   "Size nasıl yardımcı olabilirim? Lütfen aşağıdan bir işlem seçin.";

 function menuInlineKeyboard() {
   return Markup.inlineKeyboard([
     [Markup.button.callback("Yeni Teklif Al", "menu_1")],
     [Markup.button.callback("Hasar / Yol Yardım", "menu_2")],
     [Markup.button.callback("Poliçe Sorgulama", "menu_3")],
     [Markup.button.callback("Belge Talebi", "menu_4")],
     [Markup.button.callback("Canlı Destek", "menu_5")],
   ]);
 }

 bot.start((ctx) => {
   const chatId = ctx.chat.id;
   addMessage(chatId, "user", "/start");
   addMessage(chatId, "bot", MENU_TEXT);
   return ctx.reply(MENU_TEXT, menuInlineKeyboard());
 });

 bot.on("callback_query", async (ctx) => {
   const data = ctx.callbackQuery?.data;
   const chatId = ctx.callbackQuery?.message?.chat?.id;
   if (!data || !chatId) return ctx.answerCbQuery();

   await ctx.answerCbQuery();

   if (data === "menu_1") {
     addMessage(chatId, "user", "[Menü: Yeni Teklif]");
     const lead = createLead({ chatId, status: "awaiting_name" });
     setChatState(chatId, { mode: "ask_name", leadId: lead.id });
     const reply =
       "Merhaba! Size daha iyi hizmet verebilmek için önce adınız ve soyadınızı alabilir miyim? (Örn: Ahmet Yılmaz)";
     addMessage(chatId, "bot", reply);
     await ctx.telegram.sendMessage(chatId, reply);
     return;
   }
   if (data === "menu_2") {
     addMessage(chatId, "user", "[Menü: Hasar]");
     const reply =
       "Çok geçmiş olsun. Güvenli bir alanda mısınız?\n\n" +
       "Hasar sürecini hızlandırmak için:\n" +
       "• Konum paylaşabilirsiniz (en yakın çekici yönlendirmesi)\n" +
       "• Hasar fotoğrafı gönderebilirsiniz\n" +
       "• Acil çekici için: 0850 XXX XX XX\n\n" +
       "İsterseniz aşağıdan Canlı Destek ile temsilciye bağlanabilirsiniz.";
     addMessage(chatId, "bot", reply);
     await ctx.telegram.sendMessage(chatId, reply, menuInlineKeyboard());
     return;
   }
   if (data === "menu_3") {
     addMessage(chatId, "user", "[Menü: Poliçe]");
     const reply =
       "Poliçe bilgi ve kapsam sorgulama özelliği yakında devreye alınacak.\n\n" +
       "Şimdilik teklif almak veya canlı destek için aşağıdaki menüyü kullanabilirsiniz.";
     addMessage(chatId, "bot", reply);
     await ctx.telegram.sendMessage(chatId, reply, menuInlineKeyboard());
     return;
   }
   if (data === "menu_4") {
     addMessage(chatId, "user", "[Menü: Belge]");
     const reply =
       "Belge talebi (poliçe PDF, kartuş, makbuz) özelliği yakında eklenecek.\n\n" +
       "Canlı destekten belge talebinde bulunmak için aşağıdaki menüden 5'e tıklayabilirsiniz.";
     addMessage(chatId, "bot", reply);
     await ctx.telegram.sendMessage(chatId, reply, menuInlineKeyboard());
     return;
   }
   if (data === "menu_5") {
     addMessage(chatId, "user", "[Menü: Canlı Destek]");
     const reply =
       "Hemen sizi bir temsilcimize yönlendiriyoruz. Bekleme süresi yaklaşık 2 dakika. Lütfen ayrılmayın.\n\n" +
       "Temsilcimiz en kısa sürede dönüş yapacaktır.";
     addMessage(chatId, "bot", reply);
     await ctx.telegram.sendMessage(chatId, reply);
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
         "\n\nHangi kapsamda koruma istersiniz? Aşağıdaki butonlardan seçin.";
       addMessage(chatId, "bot", reply);
       await ctx.telegram.sendMessage(chatId, reply, packageInlineKeyboard());
       return;
     }
     if (data === "pkg_ara") {
       lead.packageChoice = "Beni Ara";
       lead.status = "completed";
       updateLead(lead.id, { packageChoice: "Beni Ara", status: "completed" });
       setChatState(chatId, null);
       const reply =
         "Talebiniz alındı. Temsilcimiz en kısa sürede sizi arayıp size özel fiyat ve indirim seçeneklerini sunacaktır.";
       addMessage(chatId, "bot", reply);
       await ctx.telegram.sendMessage(chatId, reply);
       return;
     }
     const pkgMap = Object.fromEntries(getPackages().map((p) => [p.key, p.name]));
     const pkg = pkgMap[data];
     if (pkg) {
       lead.packageChoice = pkg;
       updateLead(lead.id, { packageChoice: pkg, status: "fiyat_bekleniyor" });
       setChatState(chatId, null);
       const reply =
         "Tercihiniz kaydedildi. Teklifiniz hazırlanıyor; en kısa sürede size dönüş yapacağız.";
       addMessage(chatId, "bot", reply);
       await ctx.telegram.sendMessage(chatId, reply);
     }
   }
 });

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userText = ctx.message.text || "";
  addMessage(chatId, "user", userText);

  const state = chatStates[chatId];

  if (state && state.mode === "ask_name") {
    const fullName = userText.trim();
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!fullName || fullName.length < 2) {
      const reply = "Lütfen adınızı ve soyadınızı yazın (örn: Ahmet Yılmaz).";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    } else {
      const parts = fullName.trim().split(/\s+/);
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      updateLead(lead.id, { firstName, lastName, status: "awaiting_plate" });
      setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
      const reply =
        `Teşekkürler ${firstName}! ✍️ İşlemi başlatmak için aracınızın plakasını yazar mısınız? (Örn: 34ABC123)\n\n` +
        "İsterseniz ruhsat fotoğrafı da gönderebilirsiniz; bilgileri görselden otomatik okuruz.";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
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
        const hasRuhsatSeri = ruhsatData.ruhsatSeriNo && String(ruhsatData.ruhsatSeriNo).trim();
        const hasKullanim = (ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci) && String(ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci).trim();
        if (!hasRuhsatSeri) {
          setChatState(chatId, { mode: "ask_ruhsat_seri", leadId: lead.id });
          const reply = `Teşekkürler. Plakanız ${lead.plate} olarak kaydedildi.\n\nSon olarak, resmi sorgulama için ruhsatınızın Seri Kod ve Numarasını yazar mısınız? (Örn: AA 123456 veya 2024080710265626393)`;
          addMessage(chatId, "bot", reply);
          await ctx.reply(reply);
          return;
        }
        if (!hasKullanim) {
          setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
          const reply = `Teşekkürler.\n\nAracınızın kullanım tarzı nedir? (Örn: Hususi otomobil, kamyonet)`;
          addMessage(chatId, "bot", reply);
          await ctx.reply(reply);
          return;
        }
        updated.status = "awaiting_marka_km";
        updateLead(lead.id, { status: "awaiting_marka_km" });
        setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
        const reply = `Teşekkürler. Plakanız ${lead.plate} olarak kaydedildi.\n\nAracınızın markası ve yaklaşık km bilgisini yazar mısınız? (Örn: Toyota Corolla 45000 km)`;
        addMessage(chatId, "bot", reply);
        await ctx.reply(reply);
        return;
      }
      setChatState(chatId, { mode: "ask_tc", leadId: lead.id });
      const reply =
        `Teşekkürler. Plakanız ${lead.plate} olarak kaydedildi.\n\n` +
        "Size özel hasarsızlık indirimlerini sorgulayabilmemiz için T.C. Kimlik Numaranızı alabilir miyim? (11 rakam)";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    } else if (["h", "hayır"].includes(answer)) {
      lead.status = "plate_rejected";
      updateLead(lead.id, { status: "plate_rejected" });
      setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
      const reply =
        "Anladım. Lütfen plakanızı doğru şekilde yazın (örnek: 34 ABC 123).";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    } else {
      const reply = 'Lütfen plakanın doğruluğu için "E" (evet) veya "H" (hayır) yazın.';
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    }
  } else if (state && state.mode === "ask_plate") {
    const plate = normalizeAndValidatePlate(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!plate) {
      const reply =
        "Plaka formatı yetersiz. Lütfen sadece rakam ve harfleri yazın (örnek: 34ABC123 veya 06ANK06). Boşluk kullanabilirsiniz.";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
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
        const hasRuhsatSeri = ruhsatData.ruhsatSeriNo && String(ruhsatData.ruhsatSeriNo).trim();
        const hasKullanim = (ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci) && String(ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci).trim();
        if (!hasRuhsatSeri) {
          setChatState(chatId, { mode: "ask_ruhsat_seri", leadId: lead.id });
          const msg = "Teşekkürler. Ruhsat Seri Kod ve Numarasını yazar mısınız? (Örn: AA 123456 veya 2024080710265626393)";
          addMessage(chatId, "bot", msg);
          await ctx.reply(msg);
          return;
        }
        if (!hasKullanim) {
          setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
          const msg = "Aracınızın kullanım tarzı nedir? (Örn: Hususi otomobil, kamyonet)";
          addMessage(chatId, "bot", msg);
          await ctx.reply(msg);
          return;
        }
        updateLead(lead.id, { status: "awaiting_marka_km" });
        setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
        const msg = "Teşekkürler.\n\nAracınızın markası ve yaklaşık km bilgisini yazar mısınız? (Örn: Toyota Corolla 45000 km)";
        addMessage(chatId, "bot", msg);
        await ctx.reply(msg);
        return;
      }
      setChatState(chatId, { mode: "ask_tc", leadId: lead.id });
      const reply =
        "Teşekkürler! 🚗 Şimdi, size özel hasarsızlık indirimlerini sorgulayabilmemiz için T.C. Kimlik Numaranızı alabilir miyim? (11 rakam)";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    }
  }

  if (state && state.mode === "ask_tc") {
    const tc = validateTc(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!tc) {
      const reply = "Geçerli bir TC Kimlik Numarası girin (sadece 11 rakam).";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
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
      const hasRuhsatSeri = ruhsatData.ruhsatSeriNo && String(ruhsatData.ruhsatSeriNo).trim();
      const hasKullanim = (ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci) && String(ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci).trim();
      if (!hasRuhsatSeri) {
        setChatState(chatId, { mode: "ask_ruhsat_seri", leadId: lead.id });
        const reply =
          "Son olarak, resmi sorgulama için ruhsatınızın en altında yer alan Seri Kod ve Numarayı yazar mısınız? (Örn: AA 123456 veya BZ 987654)";
        addMessage(chatId, "bot", reply);
        await ctx.reply(reply);
        return;
      }
      if (!hasKullanim) {
        setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
        const reply =
          "Aracınızın kullanım tarzı nedir? (Örn: Hususi otomobil, kamyonet, ticari taksi)";
        addMessage(chatId, "bot", reply);
        await ctx.reply(reply);
        return;
      }
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const reply =
        "Teşekkürler.\n\nAracınızın markası ve yaklaşık km bilgisini yazar mısınız? (Örn: Toyota Corolla 45000 km)";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    }
  }

  if (state && state.mode === "ask_ruhsat_seri") {
    const seriNo = normalizeAndValidateRuhsatSeriNo(userText);
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!seriNo) {
      const reply =
        "Ruhsat seri kodu 2 harf ve 6 rakamdan oluşur (örn: AA 123456). Lütfen bu formatta yazın.";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    } else {
      const ruhsatData = { ...(lead.ruhsatData || {}), ruhsatSeriNo: seriNo };
      lead.ruhsatData = ruhsatData;
      updateLead(lead.id, { ruhsatData, ruhsatSeriNo: seriNo });
      const hasKullanim = (ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci) && String(ruhsatData.kullanimTarzi || ruhsatData.kullanimAmaci).trim();
      if (!hasKullanim) {
        setChatState(chatId, { mode: "ask_kullanim_tarzi", leadId: lead.id });
        const reply =
          "Aracınızın kullanım tarzı nedir? (Örn: Hususi otomobil, kamyonet, ticari taksi)";
        addMessage(chatId, "bot", reply);
        await ctx.reply(reply);
        return;
      }
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const reply =
        "Teşekkürler.\n\nAracınızın markası ve yaklaşık km bilgisini yazar mısınız? (Örn: Toyota Corolla 45000 km)";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    }
  }

  if (state && state.mode === "ask_kullanim_tarzi") {
    const kullanim = userText.trim();
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (!kullanim || kullanim.length < 2) {
      const reply = "Lütfen kullanım tarzını kısaca yazın (örn: Hususi, Ticari, Taksi).";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    } else {
      const ruhsatData = { ...(lead.ruhsatData || {}), kullanimTarzi: kullanim };
      lead.ruhsatData = ruhsatData;
      updateLead(lead.id, { ruhsatData });
      lead.status = "awaiting_marka_km";
      updateLead(lead.id, { status: "awaiting_marka_km" });
      setChatState(chatId, { mode: "ask_marka_km", leadId: lead.id });
      const reply =
        "Harika! Tüm bilgileri aldım. 🏁 Uzmanlarımız şimdi sizin için en iyi fiyatı çalışıyor.\n\n" +
        "Son olarak aracınızın markası ve yaklaşık km bilgisini yazar mısınız? (Örn: Toyota Corolla 45000 km)";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    }
  }

  if (state && state.mode === "ask_marka_km") {
    const markaKm = userText.trim();
    const lead = findLeadById(state.leadId);
    if (!lead) {
      setChatState(chatId, null);
    } else if (markaKm.length < 3) {
      const reply = "Lütfen marka ve km bilgisini kısaca yazın (örn: Honda Civic 62000 km).";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    } else {
      // 45000 km, 125.000 km, 45000 kilometre, veya sadece 45000 (4–6 rakam)
      const kmWithUnit = markaKm.match(/(\d[\d.\s]*?)\s*(?:km|kilometre)\s*$/i);
      const kmOnly = markaKm.match(/\b(\d{4,6})\s*$/);
      const kmMatch = kmWithUnit || kmOnly;
      const kmRaw = kmMatch ? String(kmMatch[1]).replace(/[\s.]/g, "") : null;
      const km = kmRaw && /^\d+$/.test(kmRaw) ? kmRaw : null;
      const marka = kmMatch ? markaKm.replace(kmMatch[0], "").trim() : markaKm;
      const updates = { markaKm, status: "fiyat_bekleniyor" };
      if (marka) updates.marka = marka;
      if (km) updates.km = km;
      updateLead(lead.id, updates);
      setChatState(chatId, null);
      const reply =
        "Bilgileriniz alındı. Teklifiniz hazırlanacak; en kısa sürede size dönüş yapacağız.";
      addMessage(chatId, "bot", reply);
      await ctx.reply(reply);
      return;
    }
  }

  // Menü seçimleri (aktif state yokken)
  const menuChoice = userText.trim();
  if (["1", "1️⃣ yeni teklif al", "teklif", "yeni teklif"].includes(menuChoice.toLowerCase())) {
    const lead = createLead({ chatId, status: "awaiting_name" });
    setChatState(chatId, { mode: "ask_name", leadId: lead.id });
    const reply =
      "Merhaba! Size daha iyi hizmet verebilmek için önce adınız ve soyadınızı alabilir miyim? (Örn: Ahmet Yılmaz)";
    addMessage(chatId, "bot", reply);
    await ctx.reply(reply);
    return;
  }
  if (["2", "2️⃣ hasar / yol yardım", "hasar", "kaza"].includes(menuChoice.toLowerCase())) {
    const reply =
      "Çok geçmiş olsun. Güvenli bir alanda mısınız?\n\n" +
      "Hasar sürecini hızlandırmak için:\n" +
      "• Konum paylaşabilirsiniz (en yakın çekici yönlendirmesi)\n" +
      "• Hasar fotoğrafı gönderebilirsiniz\n" +
      "• Acil çekici için: 0850 XXX XX XX\n\n" +
      "İsterseniz \"5\" veya \"Canlı Destek\" yazarak temsilciye bağlanabilirsiniz.";
    addMessage(chatId, "bot", reply);
    await ctx.reply(reply);
    return;
  }
  if (["3", "3️⃣ poliçe sorgulama", "poliçe", "sorgulama"].includes(menuChoice.toLowerCase())) {
    const reply =
      "Poliçe bilgi ve kapsam sorgulama özelliği yakında devreye alınacak.\n\n" +
      "Şimdilik teklif almak için \"1\" yazabilir veya \"5\" ile canlı destek talep edebilirsiniz.";
    addMessage(chatId, "bot", reply);
    await ctx.reply(reply);
    return;
  }
  if (["4", "4️⃣ belge talebi", "belge", "poliçe pdf"].includes(menuChoice.toLowerCase())) {
    const reply =
      "Belge talebi (poliçe PDF, kartuş, makbuz) özelliği yakında eklenecek.\n\n" +
      "\"5\" yazarak canlı destekten belge talebinde bulunabilirsiniz.";
    addMessage(chatId, "bot", reply);
    await ctx.reply(reply);
    return;
  }
  if (["5", "5️⃣ canlı destek", "canlı destek", "temsilci"].includes(menuChoice.toLowerCase())) {
    const reply =
      "Hemen sizi bir temsilcimize yönlendiriyoruz. Bekleme süresi yaklaşık 2 dakika. Lütfen ayrılmayın.\n\n" +
      "Temsilcimiz en kısa sürede dönüş yapacaktır.";
    addMessage(chatId, "bot", reply);
    await ctx.reply(reply);
    return;
  }

  // Fallback: sadece butonlar, tekrarlı liste yok
  const reply = "Aşağıdaki butonlardan seçin:";
  addMessage(chatId, "bot", reply);
  await ctx.reply(reply, menuInlineKeyboard());
});

function packageInlineKeyboard() {
  const packages = getPackages();
  const rows = packages.map((p) => [Markup.button.callback(p.name, p.key)]);
  rows.push([
    Markup.button.callback("Detay", "pkg_detay"),
    Markup.button.callback("Beni Ara", "pkg_ara"),
  ]);
  return Markup.inlineKeyboard(rows);
}

async function sendPackageCompletion(ctx, chatId, lead, pkg) {
  const reply = "Tercihiniz kaydedildi. Teklifiniz hazırlanıyor; en kısa sürede size dönüş yapacağız.";
  addMessage(chatId, "bot", reply);
  await ctx.reply(reply);
}

/** Ruhsat fotoğrafından AI görsel analiz ile bilgileri çıkarır (OpenAI Vision API) */
const RUHSAT_PROMPT = `Bu görsel Türkiye Trafik Tescil Belgesi (ruhsat) fotoğrafıdır.
Aşağıdaki JSON anahtarlarına göre gördüğün tüm bilgileri çıkar. Bulamadığın alan için null kullan.
Sadece geçerli JSON döndür, markdown veya açıklama ekleme.

ÖNEMLİ KURALLAR:
- (E) ŞASE NO ile (P.5) MOTOR NO'yu asla karıştırma. Şase No (sasiNo) belgede (E) ŞASE NO yazan yerdeki 17 haneli VIN'dir (genelde NLH vb. harfle başlar). Motor No (motorNo) (P.5) MOTOR NO yazan yerdeki numaradır (örn. D4F ile başlayabilir). Her birini kendi alanından oku.
- (Y.2) TESCİL SIRA NO sadece rakamlardan oluşan uzun numaradır; rakam rakam aynen kopyala, boşluk/tire koyma. O harfi 0 (sıfır) değildir.
- Belge Seri No (belgeSeriNo): Ruhsatın SAĞ tarafında, QR kodun (barkod) hemen ALTINDA yer alır. Orada \"belge seri:\" yazan yerde 2 harf (örn. hf) ve \"No\" yazan yerde 6 rakam (örn. 964933) vardır. Sadece bu 2 harf + 6 rakamı birleştir (örn. HF964933). Araya N veya başka karakter ekleme; (Y.2) Tescil Sıra No ile karıştırma.
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

    // Tescil Sıra No (Y.2): sadece rakamlar (karışan O/l vb. temizlenir)
    if (parsed.ruhsatSeriNo) {
      const digits = String(parsed.ruhsatSeriNo).replace(/\D/g, "");
      parsed.ruhsatSeriNo = digits.length > 0 ? digits : parsed.ruhsatSeriNo;
    }
    // Belge Seri No: "belge seri: hf" (2 harf) + "No 964933" (6 rakam) → HF964933; araya N vb. eklenmez
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

bot.on("photo", async (ctx) => {
  const chatId = ctx.chat.id;
  const photo = ctx.message.photo;
  const largest = photo[photo.length - 1];
  const fileId = largest.file_id;

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
      ruhsatData = await extractRuhsatFromImage(savedPath) || {};
      if (Object.keys(ruhsatData).length > 0) {
        updateLead(lead.id, { ruhsatData, ...syncLeadFieldsFromRuhsat(ruhsatData) });
        lead.ruhsatData = ruhsatData;
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
      "Ruhsat fotoğrafınız alındı." + summaryBlock + "\n\n" +
      `Görselden okunan plaka: ${guessedPlate}\n\n` +
      'Doğruysa "E", yanlışsa "H" yazın.';
    addMessage(chatId, "bot", reply);
    await ctx.reply(reply);
  } else {
    lead.status = "awaiting_plate";
    updateLead(lead.id, { status: "awaiting_plate" });
    setChatState(chatId, { mode: "ask_plate", leadId: lead.id });
    const reply =
      "Ruhsat fotoğrafınız alındı." + summaryBlock + "\n\n" +
      "Plakayı otomatik okuyamadım. Lütfen plakanızı yazın (örnek: 34 ABC 123).";
    addMessage(chatId, "bot", reply);
    await ctx.reply(reply);
  }
});

bot.launch().then(() => {
   console.log("Telegram bot started.");
 }).catch((err) => {
   console.error("Telegram bot baslatilamadi (sunucu yine de calisiyor):", err.message);
 });

 app.listen(PORT, "0.0.0.0", () => {
   console.log(`Server: http://localhost:${PORT}  ve  http://127.0.0.1:${PORT}`);
   console.log(`Admin panel: http://127.0.0.1:${PORT}/app/`);
   console.log("(Bu terminali kapatmayin.)");
  console.log("Baglanamazsan: 1) Adres olarak http://127.0.0.1:" + PORT + "/app/ ac. 2) Opera yerine Chrome/Edge dene. 3) .env icinde PORT=3001 yazip tekrar baslat.");
 });
