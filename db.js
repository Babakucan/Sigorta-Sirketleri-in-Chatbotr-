const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "sigorta.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    image_path TEXT,
    plate TEXT,
    plate_verified INTEGER DEFAULT 0,
    tc TEXT,
    marka_km TEXT,
    package_choice TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    offered_price REAL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT,
    type TEXT DEFAULT 'text',
    file_path TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    label TEXT,
    price REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(chat_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_ts ON conversations(timestamp DESC);
`);

try { db.exec("ALTER TABLE leads ADD COLUMN offered_price REAL"); } catch (_) {}
try { db.exec("ALTER TABLE packages ADD COLUMN label TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE leads ADD COLUMN ruhsat_data TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE leads ADD COLUMN first_name TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE leads ADD COLUMN last_name TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE leads ADD COLUMN marka TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE leads ADD COLUMN model TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE leads ADD COLUMN km TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE leads ADD COLUMN ruhsat_seri_no TEXT"); } catch (_) {}

const defaultPackages = [
  { key: "pkg_eko", name: "Ekonomik", description: "Çarpışma, yangın, hırsızlık. Temel kapsam.", label: "Ekonomik kapsam", price: 0, discount_percent: 0, sort_order: 1 },
  { key: "pkg_genis", name: "Standart (Önerilen)", description: "İkame araç, yol yardımı, cam muafiyeti, mini onarım dahil.", label: "Önerilen", price: 0, discount_percent: 0, sort_order: 2 },
  { key: "pkg_full", name: "Full Kapsam", description: "Doğal afet, kemirgen, ferdi kaza dahil tam kapsam.", label: "Tam kapsam", price: 0, discount_percent: 0, sort_order: 3 },
];
const existing = db.prepare("SELECT COUNT(*) as c FROM packages").get();
if (existing.c === 0) {
  const ins = db.prepare("INSERT INTO packages (key, name, description, label, price, discount_percent, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)");
  defaultPackages.forEach((p) => ins.run(p.key, p.name, p.description, p.label || null, p.price, p.discount_percent, p.sort_order));
} else {
  const upd = db.prepare("UPDATE packages SET name = ?, description = ?, label = ? WHERE key = ?");
  defaultPackages.forEach((p) => upd.run(p.name, p.description, p.label || null, p.key));
}

function getLeads(limit = 200) {
  const stmt = db.prepare(
    "SELECT * FROM leads ORDER BY created_at DESC LIMIT ?"
  );
  return stmt.all(limit).map(row => mapRowToLead(row));
}

function mapRowToLead(row) {
  return {
    id: row.id,
    chatId: row.chat_id,
    createdAt: row.created_at,
    imagePath: row.image_path,
    plate: row.plate,
    plateVerified: Boolean(row.plate_verified),
    tc: row.tc,
    markaKm: row.marka_km,
    packageChoice: row.package_choice,
    phone: row.phone,
    status: row.status,
    offeredPrice: row.offered_price != null ? row.offered_price : null,
    ruhsatData: row.ruhsat_data ? (() => { try { return JSON.parse(row.ruhsat_data); } catch { return null; } })() : null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    marka: row.marka ?? null,
    model: row.model ?? null,
    km: row.km ?? null,
    ruhsatSeriNo: row.ruhsat_seri_no ?? null,
  };
}

function insertLead(lead) {
  const stmt = db.prepare(`
    INSERT INTO leads (chat_id, created_at, image_path, plate, plate_verified, tc, marka_km, package_choice, phone, status, offered_price, ruhsat_data, first_name, last_name, marka, model, km, ruhsat_seri_no)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    lead.chatId,
    lead.createdAt ?? Date.now(),
    lead.imagePath ?? null,
    lead.plate ?? null,
    lead.plateVerified ? 1 : 0,
    lead.tc ?? null,
    lead.markaKm ?? null,
    lead.packageChoice ?? null,
    lead.phone ?? null,
    lead.status ?? "new",
    lead.offeredPrice ?? null,
    lead.ruhsatData != null ? JSON.stringify(lead.ruhsatData) : null,
    lead.firstName ?? null,
    lead.lastName ?? null,
    lead.marka ?? null,
    lead.model ?? null,
    lead.km ?? null,
    lead.ruhsatSeriNo ?? null
  );
  return info.lastInsertRowid;
}

function getLeadById(id) {
  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
  return row ? mapRowToLead(row) : null;
}

const COL_MAP = {
  chatId: "chat_id", createdAt: "created_at", imagePath: "image_path", markaKm: "marka_km", packageChoice: "package_choice",
  plateVerified: "plate_verified", offeredPrice: "offered_price", ruhsatData: "ruhsat_data",
  firstName: "first_name", lastName: "last_name", marka: "marka", model: "model", km: "km", ruhsatSeriNo: "ruhsat_seri_no",
};

function updateLead(id, updates) {
  const allowed = ["plate", "plateVerified", "tc", "markaKm", "packageChoice", "phone", "status", "imagePath", "offeredPrice", "ruhsatData", "firstName", "lastName", "marka", "model", "km", "ruhsatSeriNo"];
  const set = [];
  const values = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      const col = COL_MAP[key] || key;
      set.push(`${col} = ?`);
      values.push(col === "plate_verified" ? (updates[key] ? 1 : 0) : col === "ruhsat_data" ? (updates[key] != null ? JSON.stringify(updates[key]) : null) : updates[key]);
    }
  }
  if (set.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE leads SET ${set.join(", ")} WHERE id = ?`).run(...values);
}

function getConversations(limit = 200) {
  const stmt = db.prepare(
    "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?"
  );
  return stmt.all(limit).map(row => ({
    chatId: row.chat_id,
    role: row.role,
    text: row.text,
    type: row.type || "text",
    filePath: row.file_path,
    timestamp: row.timestamp,
  }));
}

function addConversation(msg) {
  const stmt = db.prepare(`
    INSERT INTO conversations (chat_id, role, text, type, file_path, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    msg.chatId,
    msg.role,
    msg.text ?? "",
    msg.type ?? "text",
    msg.filePath ?? null,
    msg.timestamp ?? Date.now()
  );
  const count = db.prepare("SELECT COUNT(*) as c FROM conversations").get();
  if (count.c > 500) {
    db.prepare("DELETE FROM conversations WHERE id IN (SELECT id FROM conversations ORDER BY timestamp ASC LIMIT 100)").run();
  }
}

function getPackages() {
  const rows = db.prepare("SELECT * FROM packages ORDER BY sort_order ASC").all();
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || "",
    label: row.label || "",
    price: row.price,
    discountPercent: row.discount_percent,
    sortOrder: row.sort_order,
  }));
}

function updatePackage(id, updates) {
  const allowed = ["name", "description", "label", "price", "discountPercent", "sortOrder"];
  const colMap = { discountPercent: "discount_percent", sortOrder: "sort_order" };
  const set = [];
  const values = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      const col = colMap[key] || key;
      set.push(`${col} = ?`);
      values.push(updates[key]);
    }
  }
  if (set.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE packages SET ${set.join(", ")} WHERE id = ?`).run(...values);
}

function insertPackage(p) {
  const stmt = db.prepare(`
    INSERT INTO packages (key, name, description, label, price, discount_percent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM packages").get();
  const sortOrder = p.sortOrder != null ? p.sortOrder : (maxOrder.m + 1);
  stmt.run(
    p.key || "pkg_yeni",
    p.name || "",
    p.description || "",
    p.label ?? null,
    p.price ?? 0,
    p.discountPercent ?? 0,
    sortOrder
  );
  return db.prepare("SELECT last_insert_rowid() as id").get().id;
}

module.exports = {
  db,
  getLeads,
  getLeadById,
  insertLead,
  updateLead,
  getConversations,
  addConversation,
  getPackages,
  updatePackage,
  insertPackage,
};
