import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'

const API_BASE = ''

/** Ruhsat AI ile okunan alanlar (TRAMER / risk analizi için) */
type RuhsatData = {
  plaka?: string
  ruhsatSeriNo?: string
  belgeSeriNo?: string
  tescilTarihi?: string
  trafigeCikisTarihi?: string
  tcKimlik?: string
  sahibiAdiSoyadi?: string
  marka?: string
  tipi?: string
  markaTip?: string
  modelYili?: string
  motorNo?: string
  sasiNo?: string
  kullanimAmaci?: string
  kullanimTarzi?: string
  aracKodu?: string
  renk?: string
}

type Lead = {
  id: number
  chatId: string
  createdAt: number
  imagePath: string | null
  plate: string | null
  plateVerified: boolean
  tc: string | null
  markaKm: string | null
  packageChoice: string | null
  phone: string | null
  status: string
  offeredPrice: number | null
  ruhsatData?: RuhsatData | null
  firstName?: string | null
  lastName?: string | null
  marka?: string | null
  model?: string | null
  km?: string | null
  ruhsatSeriNo?: string | null
  aramaTercihi?: string | null
}

type Conversation = {
  chatId: string
  role: string
  text: string
  type: string
  filePath: string | null
  timestamp: number
}

type Package = {
  id: number
  key: string
  name: string
  description: string
  price: number
  discountPercent: number
  sortOrder: number
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Yeni',
  awaiting_name: 'İsim bekleniyor',
  photo_received: 'Fotoğraf alındı',
  awaiting_plate: 'Plaka bekleniyor',
  plate_confirmed: 'Plaka onaylandı',
  plate_rejected: 'Plaka düzeltilecek',
  plate_manual: 'Plaka elle girildi',
  awaiting_tc: 'TC bekleniyor',
  awaiting_marka_km: 'Marka/km bekleniyor',
  awaiting_package: 'Paket seçimi bekleniyor',
  fiyat_bekleniyor: 'Fiyat Bekleniyor',
  teklif_gonderildi: 'Teklif Gönderildi',
  arama_bekliyor: 'Aranma Bekleniyor',
  completed: 'Tamamlandı',
  cancelled: 'İptal edildi',
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('tr-TR')
}

function formatRelativeTime(ts: number): string {
  const now = Date.now()
  const d = new Date(ts)
  const diffMs = now - ts
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000))
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (60 * 1000))
      if (diffMins < 1) return 'Az önce'
      if (diffMins < 60) return `${diffMins} dk önce`
    }
    return diffHours < 1 ? '1 saatten az' : `${diffHours} saat önce`
  }
  if (diffDays === 1) return 'Dün'
  if (diffDays < 7) return `${diffDays} gün önce`
  if (diffDays < 14) return '1 hafta önce'
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function useApi(token: string | null) {
  const headers = (): HeadersInit => {
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  }

  const fetchLeads = useCallback(async (): Promise<Lead[]> => {
    if (!token) return []
    const res = await fetch(`${API_BASE}/api/leads`, { headers: headers() })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) throw new Error('Leads alınamadı')
    return res.json()
  }, [token])

  const fetchConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!token) return []
    const res = await fetch(`${API_BASE}/api/conversations`, { headers: headers() })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) throw new Error('Konuşmalar alınamadı')
    return res.json()
  }, [token])

  const fetchPackages = useCallback(async (): Promise<Package[]> => {
    if (!token) return []
    const res = await fetch(`${API_BASE}/api/packages`, { headers: headers() })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) throw new Error('Paketler alınamadı')
    return res.json()
  }, [token])

  const createPackage = useCallback(async (p: Partial<Package>): Promise<Package> => {
    if (!token) throw new Error('Unauthorized')
    const res = await fetch(`${API_BASE}/api/packages`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: p.key || 'pkg_yeni',
        name: p.name ?? '',
        description: p.description ?? '',
        price: p.price ?? 0,
        discountPercent: p.discountPercent ?? 0,
        sortOrder: p.sortOrder,
      }),
    })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Paket eklenemedi')
    }
    return res.json()
  }, [token])

  const savePackages = useCallback(async (packages: Package[]): Promise<Package[]> => {
    if (!token) return []
    const toCreate = packages.filter((p) => !p.id || p.id === 0)
    const toUpdate = packages.filter((p) => p.id && p.id > 0)
    for (const p of toCreate) {
      const key = (p.key || 'pkg_yeni').trim().replace(/\s+/g, '_') || 'pkg_yeni'
      await createPackage({ ...p, key, name: p.name || 'Yeni paket', sortOrder: p.sortOrder ?? toCreate.indexOf(p) + toUpdate.length + 1 })
    }
    if (toUpdate.length > 0) {
      const res = await fetch(`${API_BASE}/api/packages`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(toUpdate),
      })
      if (res.status === 401) throw new Error('SESSION_EXPIRED')
      if (!res.ok) throw new Error('Kaydetme başarısız')
    }
    const res = await fetch(`${API_BASE}/api/packages`, { headers: headers() })
    if (!res.ok) throw new Error('Paketler alınamadı')
    return res.json()
  }, [token, createPackage])

  const sendLeadQuote = useCallback(async (leadId: number, price: number): Promise<void> => {
    if (!token) return
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/send-quote`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ price }),
    })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Gönderilemedi')
    }
  }, [token])

  const getLeadPhotoUrl = useCallback(async (leadId: number): Promise<string | null> => {
    if (!token) return null
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/photo`, { headers: headers() })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }, [token])

  const reparseRuhsat = useCallback(async (leadId: number): Promise<Lead | null> => {
    if (!token) return null
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/reparse-ruhsat`, { method: 'POST', headers: headers() })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Ruhsat okunamadı')
    }
    return res.json()
  }, [token])

  const updateLead = useCallback(async (leadId: number, updates: { km?: string | null; packageChoice?: string | null }): Promise<Lead> => {
    if (!token) throw new Error('Unauthorized')
    const res = await fetch(`${API_BASE}/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) throw new Error('Güncellenemedi')
    return res.json()
  }, [token])

  type Settings = { mesai_baslangic: string; mesai_bitis: string; mesai_gunler: string; mesaj_hemen_mesai_ici?: string; mesaj_hemen_mesai_dis?: string; mesaj_ozel_tarih_istek?: string; mesaj_ozel_tarih_onay?: string; conversation_saklama_gunu?: string }
  const fetchSettings = useCallback(async (): Promise<Settings> => {
    if (!token) throw new Error('Unauthorized')
    const res = await fetch(`${API_BASE}/api/settings`, { headers: headers() })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) throw new Error('Ayarlar alınamadı')
    return res.json()
  }, [token])
  const saveSettings = useCallback(async (s: Partial<Settings>): Promise<Settings> => {
    if (!token) throw new Error('Unauthorized')
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    if (res.status === 401) throw new Error('SESSION_EXPIRED')
    if (!res.ok) throw new Error('Ayarlar kaydedilemedi')
    return res.json()
  }, [token])

  return { fetchLeads, fetchConversations, fetchPackages, savePackages, createPackage, sendLeadQuote, getLeadPhotoUrl, reparseRuhsat, updateLead, fetchSettings, saveSettings }
}

function LeadDetailModal({
  lead,
  onClose,
  getLeadPhotoUrl,
  formatDate,
  STATUS_LABELS,
  quotePrice,
  setQuotePrice,
  quoteError,
  onSendQuote,
  sendingQuote,
  onReparseRuhsat,
  reparseLoading,
}: {
  lead: Lead
  onClose: () => void
  getLeadPhotoUrl: (id: number) => Promise<string | null>
  formatDate: (ts: number) => string
  STATUS_LABELS: Record<string, string>
  quotePrice: string
  setQuotePrice: (v: string) => void
  quoteError: string
  onSendQuote: () => void
  sendingQuote: boolean
  onReparseRuhsat?: (leadId: number) => Promise<Lead | null>
  reparseLoading?: boolean
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const photoUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!lead.imagePath) {
      setPhotoUrl(null)
      return
    }
    let cancelled = false
    getLeadPhotoUrl(lead.id).then((url) => {
      if (!cancelled && url) {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = url
        setPhotoUrl(url)
      }
    })
    return () => {
      cancelled = true
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = null
      }
      setPhotoUrl(null)
    }
  }, [lead.id, lead.imagePath, getLeadPhotoUrl])

  const isim = lead.firstName ?? (lead.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/)[0]) ?? '—'
  const soyisim = lead.lastName ?? (lead.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/).slice(1).join(' ')) ?? '—'
  const plaka = lead.plate ?? lead.ruhsatData?.plaka ?? '—'
  const tc = lead.tc ?? lead.ruhsatData?.tcKimlik ?? '—'
  const marka = lead.marka ?? lead.ruhsatData?.markaTip ?? lead.ruhsatData?.marka ?? lead.markaKm ?? '—'
  const model = lead.model ?? lead.ruhsatData?.tipi ?? lead.ruhsatData?.modelYili ?? '—'
  const km = lead.km ?? '—'
  const tescilSiraNo = lead.ruhsatSeriNo ?? lead.ruhsatData?.ruhsatSeriNo ?? '—'
  const belgeSeriNo = lead.ruhsatData?.belgeSeriNo ?? '—'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content lead-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Teklif detayı #{lead.id}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Kapat">×</button>
        </div>
        <div className="modal-body two-col">
          <div className="detail-form-col">
            <h4>Müşteri ve araç bilgileri</h4>
            <dl className="detail-form-dl">
              <dt>İsim</dt><dd>{isim}</dd>
              <dt>Soyisim</dt><dd>{soyisim}</dd>
              <dt>Plaka</dt><dd><code>{plaka}</code></dd>
              <dt>TC</dt><dd><code>{tc}</code></dd>
              <dt>Marka</dt><dd>{marka}</dd>
              <dt>Model</dt><dd>{model}</dd>
              <dt>KM</dt><dd>{km}</dd>
              <dt>Tescil Sıra No</dt><dd><code>{tescilSiraNo}</code></dd>
              <dt>Belge Seri No</dt><dd><code>{belgeSeriNo}</code></dd>
              <dt>Kullanım</dt><dd>{lead.ruhsatData?.kullanimTarzi ?? lead.ruhsatData?.kullanimAmaci ?? '—'}</dd>
              <dt>Paket</dt><dd>{lead.packageChoice ?? '—'}</dd>
              <dt>Durum</dt><dd>{STATUS_LABELS[lead.status] ?? lead.status}</dd>
              {lead.status === 'arama_bekliyor' && lead.aramaTercihi && (
                <><dt>Arama tercihi</dt><dd>{lead.aramaTercihi}</dd></>
              )}
              <dt>Tarih</dt><dd>{formatDate(lead.createdAt)}</dd>
              {lead.ruhsatData?.sasiNo && <><dt>Şasi (VIN)</dt><dd><code>{lead.ruhsatData.sasiNo}</code></dd></>}
              {lead.ruhsatData?.motorNo && <><dt>Motor no</dt><dd><code>{lead.ruhsatData.motorNo}</code></dd></>}
            </dl>
            <h4 style={{ marginTop: '1rem' }}>Teklif fiyatı & gönder</h4>
            <label className="quote-price-label">Teklif fiyatı (TL)</label>
            <div className="quote-price-row">
              <input
                type="text"
                inputMode="decimal"
                className="quote-price-input"
                value={quotePrice}
                onChange={(e) => setQuotePrice(e.target.value)}
                placeholder="Örn: 12500"
                aria-label="Teklif fiyatı TL"
              />
              <button type="button" className="btn-send-quote" onClick={onSendQuote} disabled={sendingQuote}>
                {sendingQuote ? 'Gönderiliyor…' : 'Müşteriye Gönder'}
              </button>
            </div>
            {quoteError && <p className="error">{quoteError}</p>}
          </div>
          <div className="detail-photo-col">
            <h4>Ruhsat fotoğrafı</h4>
            {photoUrl ? (
              <img src={photoUrl} alt="Ruhsat" className="detail-ruhsat-img" />
            ) : lead.imagePath ? (
              <p className="muted">Yükleniyor…</p>
            ) : (
              <p className="muted">Bu talepte ruhsat görseli yok.</p>
            )}
            {lead.imagePath && onReparseRuhsat && (
              <button
                type="button"
                className="btn-reparse-ruhsat"
                onClick={() => onReparseRuhsat(lead.id)}
                disabled={reparseLoading}
              >
                {reparseLoading ? 'Okunuyor…' : 'Ruhsattan tekrar oku'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.token) {
        onLogin(data.token)
      } else {
        setError(data.error || 'Giriş başarısız. Kullanıcı adı ve şifreyi kontrol edin.')
      }
    } catch {
      setError('Bağlantı hatası.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Sigorta Admin</h1>
        <p>Yönetim paneline giriş yapın</p>
        <form onSubmit={handleSubmit}>
          <label>
            Kullanıcı adı
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adı"
              autoComplete="username"
              autoFocus
              required
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifre"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ConversationsView({ conversations, formatDate, initialChatId, leads = [] }: { conversations: Conversation[]; formatDate: (ts: number) => string; initialChatId?: string | null; leads?: Lead[] }) {
  const chatIdToName = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of leads) {
      const chatId = String(l.chatId)
      const sahibi = (l.ruhsatData?.sahibiAdiSoyadi ?? '').trim().split(/\s+/)
      const ad = (l.firstName ?? sahibi[0] ?? '').trim()
      const soyad = (l.lastName ?? sahibi.slice(1).join(' ') ?? '').trim()
      const full = [ad, soyad].filter(Boolean).join(' ')
      if (full) map.set(chatId, full)
    }
    return map
  }, [leads])
  const { byChat, chatIds } = useMemo(() => {
    const map = new Map<string, Conversation[]>()
    for (const m of conversations) {
      if (!map.has(m.chatId)) map.set(m.chatId, [])
      map.get(m.chatId)!.push(m)
    }
    const ids = Array.from(map.keys()).sort((a, b) => {
      const lastA = Math.max(...map.get(a)!.map((x) => x.timestamp))
      const lastB = Math.max(...map.get(b)!.map((x) => x.timestamp))
      return lastB - lastA
    })
    return { byChat: map, chatIds: ids }
  }, [conversations])
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  useEffect(() => {
    if (chatIds.length > 0 && (!selectedChat || !chatIds.includes(selectedChat)))
      setSelectedChat(chatIds[0])
  }, [chatIds, selectedChat])
  useEffect(() => {
    if (initialChatId && chatIds.includes(initialChatId))
      setSelectedChat(initialChatId)
  }, [initialChatId, chatIds])
  const activeChat = (selectedChat && byChat.has(selectedChat) ? selectedChat : chatIds[0]) ?? null
  const messages = activeChat ? [...byChat.get(activeChat)!].sort((a, b) => a.timestamp - b.timestamp) : []

  return (
    <div className="conversations-view">
      <aside className="chat-list">
        <h3>Kullanıcılar</h3>
        {chatIds.length === 0 ? (
          <p className="muted">Henüz konuşma yok.</p>
        ) : (
          <ul>
            {chatIds.map((cid) => {
              const msgs = byChat.get(cid)!
              const last = msgs.reduce((a, m) => (m.timestamp > a ? m.timestamp : a), 0)
              const preview = msgs.filter((m) => m.text)[msgs.length - 1]?.text?.slice(0, 30) || '—'
              const displayName = chatIdToName.get(cid) ?? `ID: ${cid}`
              return (
                <li key={cid}>
                  <button
                    type="button"
                    className={activeChat === cid ? 'active' : ''}
                    onClick={() => setSelectedChat(cid)}
                  >
                    <span className="chat-id">{displayName}</span>
                    <span className="preview">{preview}{preview.length >= 30 ? '…' : ''}</span>
                    <span className="time">{formatDate(last)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
      <section className="chat-thread">
        {activeChat ? (
          <>
            <div className="thread-header">
              <strong>Konuşma — {chatIdToName.get(activeChat) ?? activeChat}</strong>
            </div>
            <div className="thread-messages">
              {messages.map((m, i) => (
                <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'bot'}`}>
                  <span className="bubble-role">{m.role === 'user' ? 'Müşteri' : 'Bot'}</span>
                  <p className="bubble-text">{m.text || (m.type === 'photo' ? '📷 Fotoğraf' : '—')}</p>
                  <span className="bubble-time">{formatDate(m.timestamp)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Soldan bir kullanıcı seçin.</p>
        )}
      </section>
    </div>
  )
}

function PackagesView({
  packages,
  loading,
  loadError,
  onRetry,
  onChange,
  onSave,
  onAddPackage,
  saving,
  saveError,
  saveSuccess,
}: {
  packages: Package[]
  loading: boolean
  loadError: string
  onRetry: () => void
  onChange: (id: number, updates: Partial<Package>) => void
  onSave: () => void
  onAddPackage: () => void
  saving: boolean
  saveError: string
  saveSuccess: boolean
}) {
  return (
    <div className="packages-view">
      <p className="muted packages-desc">
        Telegram’da müşteriye gösterilen paketler. Değişiklikleri kaydettikten sonra bot menüsünde anında görünür.
        Gerçek teklif fiyatı TRAMER / temsilci tarafından belirlenir.
      </p>
      {loadError && <p className="error">{loadError}</p>}
      {loadError && packages.length === 0 && (
        <button type="button" onClick={onRetry} className="retry-btn">Tekrar dene</button>
      )}
      {saveError && <p className="error">{saveError}</p>}
      {saveSuccess && <p className="save-success">Kaydedildi. Telegram’da güncel paketler görünecek.</p>}
      {loading && <p className="muted">Paketler yükleniyor…</p>}
      {!loading && packages.length > 0 && (
        <>
          <div className="packages-toolbar">
            <button type="button" onClick={onAddPackage} className="btn-add-package">+ Yeni paket ekle</button>
            <button type="button" onClick={onSave} disabled={saving} className="save-packages">
              {saving ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
            </button>
          </div>
          <div className="packages-table-wrap">
            <table className="packages-table">
              <thead>
                <tr>
                  <th>Anahtar</th>
                  <th>Paket adı</th>
                  <th>Açıklama</th>
                  <th>Liste fiyatı (₺)</th>
                  <th>İndirim %</th>
                  <th>Görünen fiyat</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => {
                  const finalPrice = p.price > 0 ? p.price * (1 - (p.discountPercent || 0) / 100) : 0
                  return (
                    <tr key={p.id ? p.id : `new-${packages.indexOf(p)}`}>
                      <td>
                        <input
                          className="input-key"
                          value={p.key}
                          onChange={(e) => onChange(p.id, { key: e.target.value })}
                          placeholder="pkg_adi"
                          readOnly={p.id > 0}
                          title={p.id > 0 ? 'Mevcut paket anahtarı değiştirilemez' : ''}
                        />
                      </td>
                      <td>
                        <input
                          value={p.name}
                          onChange={(e) => onChange(p.id, { name: e.target.value })}
                          placeholder="Paket adı"
                        />
                      </td>
                      <td>
                        <input
                          className="input-desc"
                          value={p.description}
                          onChange={(e) => onChange(p.id, { description: e.target.value })}
                          placeholder="Açıklama"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={p.price || ''}
                          onChange={(e) => onChange(p.id, { price: e.target.value === '' ? 0 : Number(e.target.value) })}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={p.discountPercent ?? ''}
                          onChange={(e) => onChange(p.id, { discountPercent: e.target.value === '' ? 0 : Number(e.target.value) })}
                          placeholder="0"
                        />
                      </td>
                      <td className="final-price-cell">
                        {p.price > 0 ? <strong>{Math.round(finalPrice).toLocaleString('tr-TR')} ₺</strong> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Dashboard({ token, onLogout, theme, setTheme }: { token: string; onLogout: () => void; theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void }) {
  const { fetchLeads, fetchConversations, fetchPackages, savePackages, sendLeadQuote, getLeadPhotoUrl, reparseRuhsat, fetchSettings, saveSettings } = useApi(token)
  const [leads, setLeads] = useState<Lead[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [packagesLoadError, setPackagesLoadError] = useState('')
  const [packagesSaveError, setPackagesSaveError] = useState('')
  const [savingPackages, setSavingPackages] = useState(false)
  const [tab, setTab] = useState<'leads' | 'conversations' | 'packages' | 'settings'>('leads')
  const [conversationChatId, setConversationChatId] = useState<string | null>(null)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [quotePrice, setQuotePrice] = useState<string>('')
  const [sendingQuote, setSendingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [reparseLoading, setReparseLoading] = useState(false)
  const [packagesSaveSuccess, setPackagesSaveSuccess] = useState(false)
  const [leadDateFrom, setLeadDateFrom] = useState('')
  const [leadDateTo, setLeadDateTo] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [mesaiBaslangic, setMesaiBaslangic] = useState('09:00')
  const [mesaiBitis, setMesaiBitis] = useState('18:00')
  const [mesaiGunler, setMesaiGunler] = useState<number[]>([1, 2, 3, 4, 5])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaveError, setSettingsSaveError] = useState('')
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState(false)
  const [mesajHemenMesaiIci, setMesajHemenMesaiIci] = useState('')
  const [mesajHemenMesaiDis, setMesajHemenMesaiDis] = useState('')
  const [mesajOzelTarihIstek, setMesajOzelTarihIstek] = useState('')
  const [mesajOzelTarihOnay, setMesajOzelTarihOnay] = useState('')
  const [conversationSaklamaGunu, setConversationSaklamaGunu] = useState('30')

  const filteredLeads = useMemo(() => {
    let list = leads
    if (leadDateFrom) {
      const from = new Date(leadDateFrom)
      from.setHours(0, 0, 0, 0)
      list = list.filter((l) => l.createdAt >= from.getTime())
    }
    if (leadDateTo) {
      const to = new Date(leadDateTo)
      to.setHours(23, 59, 59, 999)
      list = list.filter((l) => l.createdAt <= to.getTime())
    }
    const q = leadSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((l) => {
        const isim = (l.firstName ?? l.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/)[0] ?? '').toLowerCase()
        const soyisim = (l.lastName ?? l.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/).slice(1).join(' ') ?? '').toLowerCase()
        const plaka = (l.plate ?? l.ruhsatData?.plaka ?? '').toLowerCase().replace(/\s/g, '')
        const tc = (l.tc ?? l.ruhsatData?.tcKimlik ?? '').replace(/\s/g, '')
        const marka = (l.marka ?? l.ruhsatData?.markaTip ?? l.ruhsatData?.marka ?? l.markaKm ?? '').toLowerCase()
        const model = (l.model ?? l.ruhsatData?.tipi ?? '').toLowerCase()
        const ruhsat = (l.ruhsatSeriNo ?? l.ruhsatData?.ruhsatSeriNo ?? '').toLowerCase()
        const searchNorm = q.replace(/\s/g, '')
        return (
          isim.includes(q) || soyisim.includes(q) ||
          (plaka && plaka.includes(searchNorm)) ||
          (tc && tc.includes(searchNorm)) ||
          marka.includes(q) || model.includes(q) ||
          ruhsat.includes(q)
        )
      })
    }
    return list
  }, [leads, leadDateFrom, leadDateTo, leadSearch])
  const fiyatBekleyenCount = useMemo(() => leads.filter((l) => l.status === 'fiyat_bekleniyor').length, [leads])

  const setDateRange = useCallback((from: string, to: string) => {
    setLeadDateFrom(from)
    setLeadDateTo(to)
  }, [])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setErr('')
    try {
      const [l, c] = await Promise.all([fetchLeads(), fetchConversations()])
      setLeads(l)
      setConversations(c)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Yüklenemedi'
      setErr(msg === 'SESSION_EXPIRED' ? 'Oturum süresi doldu. Tekrar giriş yapın.' : msg)
      if (msg === 'SESSION_EXPIRED') onLogout()
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [fetchLeads, fetchConversations, onLogout])

  const loadPackages = useCallback(async () => {
    setPackagesLoadError('')
    setPackagesLoading(true)
    try {
      const pkgs = await fetchPackages()
      setPackages(pkgs)
    } catch (e) {
      setPackages([])
      setPackagesLoadError('Paketler alınamadı. Sunucunun güncel olduğundan emin olun (npm run build, npm start) ve tekrar deneyin.')
    } finally {
      setPackagesLoading(false)
    }
  }, [fetchPackages])

  useEffect(() => {
    if (tab === 'packages') loadPackages()
  }, [tab, loadPackages])

  const handlePackageChange = useCallback((id: number, updates: Partial<Package>) => {
    setPackages((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }, [])

  const handleSavePackages = useCallback(async () => {
    setPackagesSaveError('')
    setPackagesSaveSuccess(false)
    setSavingPackages(true)
    try {
      const updated = await savePackages(packages)
      setPackages(updated)
      setPackagesSaveSuccess(true)
      setTimeout(() => setPackagesSaveSuccess(false), 3000)
    } catch (e) {
      setPackagesSaveError(e instanceof Error ? e.message : 'Kaydetme başarısız')
    } finally {
      setSavingPackages(false)
    }
  }, [packages, savePackages])

  const handleAddPackage = useCallback(() => {
    setPackages((prev) => [
      ...prev,
      { id: 0, key: `pkg_yeni_${prev.length + 1}`, name: '', description: '', price: 0, discountPercent: 0, sortOrder: prev.length + 1 },
    ])
  }, [])

  const handlePackagesRetry = useCallback(() => {
    setPackagesLoadError('')
    loadPackages()
  }, [loadPackages])

  useEffect(() => {
    if (!detailLead) {
      setQuotePrice('')
      return
    }
    setQuotePrice(detailLead.offeredPrice != null ? String(detailLead.offeredPrice) : '')
  }, [detailLead])

  const handleReparseRuhsat = useCallback(
    async (leadId: number): Promise<Lead | null> => {
      setReparseLoading(true)
      setQuoteError('')
      try {
        const updated = await reparseRuhsat(leadId)
        if (updated) setDetailLead(updated)
        return updated
      } catch (e) {
        setQuoteError(e instanceof Error ? e.message : 'Ruhsat tekrar okunamadı')
        return null
      } finally {
        setReparseLoading(false)
      }
    },
    [reparseRuhsat]
  )

  const handleSendQuote = useCallback(async () => {
    if (!detailLead || !quotePrice.trim()) return
    const num = Number(quotePrice.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(num) || num < 0) {
      setQuoteError('Geçerli bir fiyat girin.')
      return
    }
    setQuoteError('')
    setSendingQuote(true)
    try {
      await sendLeadQuote(detailLead.id, num)
      setDetailLead(null)
      load()
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Gönderilemedi')
    } finally {
      setSendingQuote(false)
    }
  }, [detailLead, quotePrice, sendLeadQuote, load])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (tab !== 'leads') return
    const interval = setInterval(() => load({ silent: true }), 10000)
    return () => clearInterval(interval)
  }, [tab, load])

  useEffect(() => {
    if (tab !== 'settings') return
    setSettingsLoading(true)
    setSettingsSaveError('')
    fetchSettings()
      .then((s) => {
        setMesaiBaslangic(s.mesai_baslangic || '09:00')
        setMesaiBitis(s.mesai_bitis || '18:00')
        const days = (s.mesai_gunler || '1,2,3,4,5').split(',').map((d) => parseInt(d.trim(), 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6)
        setMesaiGunler(days.length ? days : [1, 2, 3, 4, 5])
        setMesajHemenMesaiIci(s.mesaj_hemen_mesai_ici ?? '')
        let hemenDis = s.mesaj_hemen_mesai_dis ?? ''
        let ozelIstek = s.mesaj_ozel_tarih_istek ?? ''
        // Yanlışlıkla "Özel tarih" alanına kaydedilmiş "Mesai dışındayken" metnini Hemen kartına geri al
        if (ozelIstek && ozelIstek.includes('mesai saatleri içinde değiliz')) {
          hemenDis = ozelIstek
          ozelIstek = 'Aranma zamanı seçin (mesai: {start}-{end})'
        }
        setMesajHemenMesaiDis(hemenDis)
        setMesajOzelTarihIstek(ozelIstek)
        setMesajOzelTarihOnay(s.mesaj_ozel_tarih_onay ?? '')
        setConversationSaklamaGunu(s.conversation_saklama_gunu ?? '30')
      })
      .catch(() => setSettingsSaveError('Ayarlar yüklenemedi'))
      .finally(() => setSettingsLoading(false))
  }, [tab, fetchSettings])

  const handleSaveSettings = async () => {
    setSettingsSaveError('')
    setSettingsSaveSuccess(false)
    try {
      await saveSettings({
        mesai_baslangic: mesaiBaslangic,
        mesai_bitis: mesaiBitis,
        mesai_gunler: mesaiGunler.sort((a, b) => a - b).join(','),
        mesaj_hemen_mesai_ici: mesajHemenMesaiIci,
        mesaj_hemen_mesai_dis: mesajHemenMesaiDis,
        mesaj_ozel_tarih_istek: mesajOzelTarihIstek,
        mesaj_ozel_tarih_onay: mesajOzelTarihOnay,
        conversation_saklama_gunu: conversationSaklamaGunu,
      })
      setSettingsSaveSuccess(true)
      setTimeout(() => setSettingsSaveSuccess(false), 3000)
    } catch (err) {
      setSettingsSaveError(err instanceof Error ? err.message : 'Kaydedilemedi')
    }
  }

  return (
    <div className="dashboard">
      <header>
        <h1>Sigorta Admin</h1>
        <div className="header-actions">
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <button type="button" onClick={() => load()} disabled={loading}>Yenile</button>
          <button type="button" onClick={() => onLogout()} className="outline">Çıkış</button>
        </div>
      </header>
      {err && <p className="error">{err}</p>}
      <nav>
        <button type="button" className={tab === 'leads' ? 'active' : ''} onClick={() => setTab('leads')}>Teklifler ({leads.length})</button>
        <button type="button" className={tab === 'conversations' ? 'active' : ''} onClick={() => setTab('conversations')}>Konuşmalar</button>
        <button type="button" className={tab === 'packages' ? 'active' : ''} onClick={() => setTab('packages')}>Paket fiyatları</button>
        <button type="button" className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Ayarlar</button>
      </nav>
      {loading ? (
        <p>Yükleniyor…</p>
      ) : tab === 'leads' ? (
        <div className="leads-view">
          {leads.length === 0 ? (
            <p className="leads-empty">Henüz teklif yok.</p>
          ) : (
            <>
              <div className="leads-view-bar">
                <p className="leads-view-summary">
                  <strong>{leads.length}</strong> teklif
                  {fiyatBekleyenCount > 0 && (
                    <> · <strong className="leads-view-pending">{fiyatBekleyenCount}</strong> fiyat bekliyor</>
                  )}
                  {filteredLeads.length !== leads.length && (
                    <> · gösterilen: <strong>{filteredLeads.length}</strong></>
                  )}
                </p>
                <div className="leads-view-filters-row">
                  <label className="leads-view-date-group">
                    <span className="leads-view-date-label">Başlangıç</span>
                    <input
                      type="date"
                      className="leads-view-date"
                      value={leadDateFrom}
                      onChange={(e) => setLeadDateFrom(e.target.value)}
                      aria-label="Başlangıç tarihi"
                    />
                  </label>
                  <label className="leads-view-date-group">
                    <span className="leads-view-date-label">Bitiş</span>
                    <input
                      type="date"
                      className="leads-view-date"
                      value={leadDateTo}
                      onChange={(e) => setLeadDateTo(e.target.value)}
                      aria-label="Bitiş tarihi"
                    />
                  </label>
                  <div className="leads-view-date-presets">
                    <button type="button" className={!leadDateFrom && !leadDateTo ? 'active' : ''} onClick={() => setDateRange('', '')}>Tümü</button>
                    <button type="button" onClick={() => { const d = new Date(); const s = d.toISOString().slice(0, 10); setDateRange(s, s); }}>Bugün</button>
                    <button type="button" onClick={() => { const d = new Date(); const end = d.toISOString().slice(0, 10); d.setDate(d.getDate() - 6); const start = d.toISOString().slice(0, 10); setDateRange(start, end); }}>Bu hafta</button>
                    <button type="button" onClick={() => { const d = new Date(); const end = d.toISOString().slice(0, 10); d.setDate(1); const start = d.toISOString().slice(0, 10); setDateRange(start, end); }}>Bu ay</button>
                  </div>
                  <input
                    type="search"
                    className="leads-view-search"
                    placeholder="İsim, plaka, marka..."
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    aria-label="Ara"
                  />
                </div>
              </div>
              {filteredLeads.length === 0 ? (
                <p className="leads-empty">Bu filtreye uyan teklif yok.</p>
              ) : (
                <div className="leads-grid">
                  {filteredLeads.map((row) => {
                    const isim = row.firstName ?? row.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/)[0] ?? '—'
                    const soyisim = row.lastName ?? row.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/).slice(1).join(' ') ?? '—'
                    const fullName = [isim, soyisim].filter(Boolean).join(' ').trim() || '—'
                    const initial = (isim?.[0] ?? soyisim?.[0] ?? '?').toUpperCase()
                    const plaka = row.plate ?? row.ruhsatData?.plaka ?? '—'
                    const statusLabel = row.status === 'fiyat_bekleniyor' ? 'Fiyat Bekleniyor' : (STATUS_LABELS[row.status] ?? row.status)
                    return (
                      <article key={row.id} className="lead-card">
                        <div className="lead-card-header">
                          <span className="lead-card-avatar">{initial}</span>
                          <div className="lead-card-title-wrap">
                            <span className="lead-card-name">{fullName}</span>
                            <span className="lead-card-plaka">{plaka}</span>
                            <span className="lead-card-date" title={formatDate(row.createdAt)}>{formatRelativeTime(row.createdAt)}</span>
                          </div>
                          <span className={`lead-card-status ${row.status === 'fiyat_bekleniyor' || row.status === 'arama_bekliyor' ? 'lead-card-status-warning' : row.status === 'cancelled' ? 'lead-card-status-cancelled' : ''}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <dl className="lead-card-fields">
                          <div><dt>TC</dt><dd>{row.tc ?? row.ruhsatData?.tcKimlik ?? '—'}</dd></div>
                          <div><dt>Marka</dt><dd>{row.marka ?? row.ruhsatData?.markaTip ?? row.ruhsatData?.marka ?? row.markaKm ?? '—'}</dd></div>
                          <div><dt>Model</dt><dd>{row.model ?? row.ruhsatData?.tipi ?? '—'}</dd></div>
                          <div><dt>KM</dt><dd>{row.km ?? '—'}</dd></div>
                          <div><dt>Tescil Sıra No</dt><dd>{row.ruhsatSeriNo ?? row.ruhsatData?.ruhsatSeriNo ?? '—'}</dd></div>
                          <div><dt>Belge Seri No</dt><dd>{row.ruhsatData?.belgeSeriNo ?? '—'}</dd></div>
                          {row.status === 'arama_bekliyor' && row.aramaTercihi && (
                            <div><dt>Arama tercihi</dt><dd>{row.aramaTercihi}</dd></div>
                          )}
                        </dl>
                        <div className="lead-card-actions">
                          <button type="button" className="lead-btn lead-btn-primary" onClick={() => { setDetailLead(row); setQuotePrice(row.offeredPrice != null ? String(row.offeredPrice) : ''); setQuoteError(''); }}>
                            Detay
                          </button>
                          <button type="button" className="lead-btn lead-btn-secondary" onClick={() => { setConversationChatId(row.chatId); setTab('conversations'); }}>
                            Mesajlar
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      ) : tab === 'conversations' ? (
        <ConversationsView conversations={conversations} formatDate={formatDate} initialChatId={conversationChatId} leads={leads} />
      ) : tab === 'settings' ? (
        <div className="settings-view">
          {settingsLoading ? (
            <p className="settings-loading">Yükleniyor…</p>
          ) : (
            <form className="settings-form" onSubmit={(e) => { e.preventDefault(); handleSaveSettings(); }}>
              <div className="settings-grid">
                <article className="settings-card">
                  <header className="settings-card-header">
                    <h2>Hemen mesajları</h2>
                    <p className="settings-card-desc">Müşteri "Hemen" seçeneğine bastığında göreceği mesajlar. Mesai dışı mesajda <code>{'{mesaiAraligi}'}</code> otomatik doldurulur.</p>
                  </header>
                  <div className="settings-card-body">
                    <div className="settings-field">
                      <label className="settings-field-label">Mesai içindeyken</label>
                      <textarea className="settings-textarea" value={mesajHemenMesaiIci} onChange={(e) => setMesajHemenMesaiIci(e.target.value)} rows={4} placeholder="Müşteri temsilcilerimiz en kısa sürede sizi arayacak." />
                    </div>
                    <div className="settings-field">
                      <label className="settings-field-label">Mesai dışındayken</label>
                      <textarea className="settings-textarea" value={mesajHemenMesaiDis} onChange={(e) => setMesajHemenMesaiDis(e.target.value)} rows={4} placeholder="Üzgünüz, şu anda mesai saatleri içinde değiliz. {mesaiAraligi} aralığında Özel tarih seçerek aranma zamanı oluşturabilirsiniz." />
                    </div>
                    <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={handleSaveSettings}>Kaydet</button>
                  </div>
                </article>
                <article className="settings-card">
                  <header className="settings-card-header">
                    <h2>Özel tarih mesajları</h2>
                    <p className="settings-card-desc">Müşteri "Özel tarih" butonuna bastığında göreceği mesajlar. <code>{'{start}'}</code>, <code>{'{end}'}</code> = mesai saatleri, <code>{'{tarih}'}</code> = seçilen gün/saat.</p>
                  </header>
                  <div className="settings-card-body">
                    <div className="settings-field">
                      <label className="settings-field-label">Gün/saat seçim istemi</label>
                      <textarea className="settings-textarea settings-textarea-lg" value={mesajOzelTarihIstek} onChange={(e) => setMesajOzelTarihIstek(e.target.value)} rows={5} placeholder={'Aranma zamanı seçin (mesai: {start}-{end})'} />
                    </div>
                    <div className="settings-field">
                      <label className="settings-field-label">Onay mesajı</label>
                      <textarea className="settings-textarea" value={mesajOzelTarihOnay} onChange={(e) => setMesajOzelTarihOnay(e.target.value)} rows={3} placeholder={'Tercihiniz kaydedildi. {tarih} tarihinde sizi arayacağız.'} />
                    </div>
                    <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={handleSaveSettings}>Kaydet</button>
                  </div>
                </article>
              </div>
              <article className="settings-card settings-card-mesai">
                <header className="settings-card-header">
                  <h2>Mesai saatleri</h2>
                  <p className="settings-card-desc">Müşteri "Evet, arasın" dediğinde mesai dışındaysa Özel tarih seçenekleri bu saatlere göre hesaplanır.</p>
                </header>
                <div className="settings-card-body settings-mesai-body">
                  <div className="settings-mesai-time">
                    <div className="settings-field-inline">
                      <label className="settings-field-label">Başlangıç</label>
                      <input type="time" value={mesaiBaslangic} onChange={(e) => setMesaiBaslangic(e.target.value)} className="settings-time-input" />
                    </div>
                    <span className="settings-mesai-sep">–</span>
                    <div className="settings-field-inline">
                      <label className="settings-field-label">Bitiş</label>
                      <input type="time" value={mesaiBitis} onChange={(e) => setMesaiBitis(e.target.value)} className="settings-time-input" />
                    </div>
                  </div>
                  <div className="settings-field">
                    <span className="settings-field-label">Mesai günleri</span>
                    <div className="settings-days">
                      {[
                        { v: 0, label: 'Paz' },
                        { v: 1, label: 'Pzt' },
                        { v: 2, label: 'Sal' },
                        { v: 3, label: 'Çar' },
                        { v: 4, label: 'Per' },
                        { v: 5, label: 'Cum' },
                        { v: 6, label: 'Cmt' },
                      ].map(({ v, label }) => (
                        <label key={v} className="settings-day">
                          <input
                            type="checkbox"
                            checked={mesaiGunler.includes(v)}
                            onChange={(e) => {
                              if (e.target.checked) setMesaiGunler((prev) => [...prev, v].sort((a, b) => a - b))
                              else setMesaiGunler((prev) => prev.filter((d) => d !== v))
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={handleSaveSettings}>Kaydet</button>
                </div>
              </article>

              <article className="settings-card">
                <header className="settings-card-header">
                  <h2>Telegram sohbet temizliği</h2>
                  <p className="settings-card-desc">Sadece Telegram uygulamasındaki mesajlar bu süre sonra silinir. Veritabanı ve admin paneldeki konuşmalar her zaman saklanır. 0 = silme yok.</p>
                </header>
                <div className="settings-card-body">
                  <div className="settings-field">
                    <label className="settings-field-label">Telegram'da mesaj silme süresi (gün)</label>
                    <input type="number" min={0} max={365} value={conversationSaklamaGunu} onChange={(e) => setConversationSaklamaGunu(e.target.value)} placeholder="30" className="settings-time-input" style={{ maxWidth: '120px' }} />
                  </div>
                  <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={handleSaveSettings}>Kaydet</button>
                </div>
              </article>

              {settingsSaveError && <p className="settings-error">{settingsSaveError}</p>}
              {settingsSaveSuccess && <p className="settings-success">Ayarlar kaydedildi.</p>}
            </form>
          )}
        </div>
      ) : (
        <PackagesView
          packages={packages}
          loading={packagesLoading}
          loadError={packagesLoadError}
          onRetry={handlePackagesRetry}
          onChange={handlePackageChange}
          onSave={handleSavePackages}
          onAddPackage={handleAddPackage}
          saving={savingPackages}
          saveError={packagesSaveError}
          saveSuccess={packagesSaveSuccess}
        />
      )}
      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          getLeadPhotoUrl={getLeadPhotoUrl}
          formatDate={formatDate}
          STATUS_LABELS={STATUS_LABELS}
          quotePrice={quotePrice}
          setQuotePrice={setQuotePrice}
          quoteError={quoteError}
          onSendQuote={handleSendQuote}
          sendingQuote={sendingQuote}
          onReparseRuhsat={handleReparseRuhsat}
          reparseLoading={reparseLoading}
        />
      )}
    </div>
  )
}

const THEME_KEY = 'admin-theme'
type Theme = 'light' | 'dark'

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <div className="theme-toggle" role="group" aria-label="Tema">
      <button
        type="button"
        className={theme === 'light' ? 'active' : ''}
        onClick={() => setTheme('light')}
        title="Açık tema"
      >
        Açık
      </button>
      <button
        type="button"
        className={theme === 'dark' ? 'active' : ''}
        onClick={() => setTheme('dark')}
        title="Koyu tema"
      >
        Koyu
      </button>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('adminToken'))
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || 'dark')

  useEffect(() => {
    if (token) sessionStorage.setItem('adminToken', token)
    else sessionStorage.removeItem('adminToken')
  }, [token])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  return (
    <div id="app">
      {!token && (
        <div className="theme-toggle-wrap">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      )}
      {token ? (
        <Dashboard token={token} onLogout={() => setToken(null)} theme={theme} setTheme={setTheme} />
      ) : (
        <Login onLogin={setToken} />
      )}
    </div>
  )
}
