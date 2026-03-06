# Figma MCP ile UI Geliştirme

**Figma MCP ücretsizdir.** Cursor, Figma tasarımına erişip tasarımdan koda dönüştürmenize yardım edebilir.

## 1. Figma API anahtarı al

1. [Figma](https://figma.com) hesabına gir.
2. **Settings** (profil ikonu) → **Personal access tokens** (veya [Figma → Settings → Security](https://www.figma.com/settings) içinde).
3. **Generate new token** ile yeni token oluştur, adını yaz (örn. `Cursor MCP`), kopyala.

Bu token’ı güvenli tut; paylaşma ve repoya ekleme.

## 2. Cursor’da Figma MCP’yi aç

1. Cursor’da **Settings** → **MCP** (veya `Ctrl+,` → "MCP" ara).
2. MCP sunucuları için kullanılan config dosyasını aç (örn. `~/.cursor/mcp.json` veya Cursor ayarlarında gösterilen path).
3. Aşağıdaki bloğu ekle veya `mcpServers` içine `figma-developer-mcp` ekle:

```json
{
  "mcpServers": {
    "figma-developer-mcp": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp", "--stdio"],
      "env": {
        "FIGMA_API_KEY": "BURAYA_FIGMA_TOKEN_YAPIŞTIR"
      }
    }
  }
}
```

4. `BURAYA_FIGMA_TOKEN_YAPIŞTIR` yerine kendi Figma Personal Access Token’ını yapıştır.
5. Cursor’u yeniden başlat veya MCP’yi yeniden yükle.

## 3. Nasıl kullanılır?

1. **Figma’da** admin paneli ekranını tasarla (veya mevcut bir frame’i kullan).
2. Frame veya sayfaya sağ tık → **Copy link** (veya Figma URL’sini kopyala).
3. **Cursor’da** Composer’ı aç, Figma linkini yapıştır.
4. Örnek prompt: *“Bu Figma tasarımına göre admin-app’teki teklifler tablosu ve header’ı güncelle; renkler ve spacing buna uysun.”*

Cursor, Figma MCP ile tasarım bilgisini alıp `admin-app/src/App.tsx` ve `style.css` için uygun kodu önerebilir veya üretebilir.

## Proje tarafı

- UI kodu: **`admin-app/`** (React + `src/style.css`).
- Figma’dan üretilen/uyarlanan kod bu klasörde tutulur; backend (`index.js`, `db.js`) değişmez.

## Kaynaklar

- [Figma MCP – Cursor IDE](https://mcpcursor.com/server/figma-mcp)
- [Figma Developer Docs – MCP](https://developers.figma.com/docs/figma-mcp-server/)
