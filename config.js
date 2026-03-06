/** OpenAI API anahtarı - .env dosyasından okur */
const fs = require("fs");
const path = require("path");

function loadKey() {
  const dirs = [__dirname, process.cwd()];
  if (require.main && require.main.filename) dirs.push(path.dirname(require.main.filename));
  for (const dir of dirs) {
    const envPath = path.join(dir, ".env");
    try {
      if (!fs.existsSync(envPath)) continue;
      const c = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
      const m = c.match(/OPENAI_API_KEY\s*=\s*(.+)$/m);
      if (m) {
        const v = m[1].split("#")[0].trim().replace(/^["']|["']$/g, "").replace(/\r/g, "");
        if (v.startsWith("sk-")) return v;
      }
    } catch (_) {}
  }
  const env = process.env.OPENAI_API_KEY || "";
  return env.trim().startsWith("sk-") ? env.trim() : "";
}

module.exports = { OPENAI_API_KEY: loadKey() };
