const { getSetting } = require("../db");
const {
  saveTelegramMessageId,
  getOldTelegramMessageIds,
  deleteTelegramMessageIdRecord,
} = require("../db");

async function sendAndTrackTelegram(telegram, chatId, text, extra = {}) {
  const sent = await telegram.sendMessage(chatId, String(text), extra);
  const ts = (sent && sent.date) ? sent.date * 1000 : Date.now();
  saveTelegramMessageId(chatId, sent.message_id, ts);
  void runTelegramMessageCleanup(telegram);
  return sent;
}

async function runTelegramMessageCleanup(telegram) {
  const days = parseInt(getSetting("conversation_saklama_gunu") || "30", 10);
  if (!days || days <= 0) return;
  const rows = getOldTelegramMessageIds(days);
  for (const row of rows) {
    try {
      await telegram.deleteMessage(row.chat_id, row.message_id);
    } catch (e) {
      if (!String(e?.message || "").includes("message to delete not found")) {
        console.warn("[telegram] deleteMessage:", row.chat_id, row.message_id, e?.message);
      }
    }
    deleteTelegramMessageIdRecord(row.id);
  }
  if (rows.length > 0) console.log("[telegram] Silinen mesaj sayısı:", rows.length, "gün:", days);
}

module.exports = { sendAndTrackTelegram, runTelegramMessageCleanup };
