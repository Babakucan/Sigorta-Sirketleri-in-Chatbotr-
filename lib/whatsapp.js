/**
 * WhatsApp Cloud API entegrasyonu.
 * .env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN
 * Webhook: GET/POST /webhook/whatsapp (Meta Console'da bu URL'yi kaydedin)
 */
const path = require("path");
const fs = require("fs");

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

function getToken() {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!t) throw new Error("WHATSAPP_ACCESS_TOKEN .env içinde tanımlı olmalı.");
  return t;
}

function getPhoneNumberId() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID .env içinde tanımlı olmalı.");
  return id;
}

function normalizeChatId(chatId) {
  const to = String(chatId).replace(/\D/g, "");
  if (!to) throw new Error("Geçersiz chatId (telefon numarası).");
  return to;
}

async function sendWhatsAppRequest(body) {
  const token = getToken();
  const phoneNumberId = getPhoneNumberId();
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API: ${res.status} ${errText}`);
  }
  return res.json();
}

/** chatId: alıcı numarası (905551234567 gibi, + olmadan) */
async function sendMessage(chatId, text) {
  const to = normalizeChatId(chatId);

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: String(text) },
  };

  return sendWhatsAppRequest(body);
}

/**
 * Butonlu veya listeli interaktif mesaj gönderir.
 * choices: [{ label, action }]
 */
async function sendInteractiveMessage(chatId, text, choices) {
  const to = normalizeChatId(chatId);
  const safeChoices = Array.isArray(choices) ? choices : [];

  if (!safeChoices.length) {
    return sendMessage(chatId, text);
  }

  // 3 veya daha az seçenek varsa button tipi kullan.
  if (safeChoices.length <= 3) {
    const buttons = safeChoices.map((c, idx) => ({
      type: "reply",
      reply: {
        id: String(c.action ?? `btn_${idx + 1}`),
        title: String(c.label).slice(0, 20) || `Seçenek ${idx + 1}`,
      },
    }));

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: String(text) },
        action: { buttons },
      },
    };

    return sendWhatsAppRequest(body);
  }

  // Daha fazla seçenek varsa list tipi kullan.
  const rows = safeChoices.map((c, idx) => ({
    id: String(c.action ?? `row_${idx + 1}`),
    title: String(c.label).slice(0, 24) || `Seçenek ${idx + 1}`,
  }));

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: String(text) },
      action: {
        button: "Seçim yap",
        sections: [
          {
            title: "Menü",
            rows,
          },
        ],
      },
    },
  };

  return sendWhatsAppRequest(body);
}

/** Medya ID'si ile dosyayı indirir, uploads'a kaydeder. Döner: { filePath, fileUniqueId } */
async function downloadMedia(mediaId) {
  const token = getToken();
  const metaUrl = `${GRAPH_API_BASE}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error("Medya URL alınamadı: " + (await metaRes.text()));
  const meta = await metaRes.json();
  const mediaUrl = meta.url;
  if (!mediaUrl) throw new Error("Medya URL boş.");

  const fileRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error("Medya indirilemedi.");
  const contentType = fileRes.headers.get("content-type") || "";
  const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
  const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `wa_${mediaId}_${Date.now()}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const buf = Buffer.from(await fileRes.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return { filePath, fileUniqueId: mediaId };
}

/** Webhook doğrulama: Meta GET ile verify_token kontrolü yapar. */
function getVerifyToken() {
  return process.env.WHATSAPP_VERIFY_TOKEN || "sigorta-verify-token";
}

module.exports = {
  sendMessage,
  sendInteractiveMessage,
  downloadMedia,
  getVerifyToken,
};
