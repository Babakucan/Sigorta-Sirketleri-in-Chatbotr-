import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'

const API_BASE = ''

/** Ruhsat OCR ile okunan alanlar (TRAMER / risk analizi için) */
type RuhsatData = {
  plaka?: string
  ruhsatSeriNo?: string
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
  completed: 'Tamamlandı',
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('tr-TR')
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

  return { fetchLeads, fetchConversations, fetchPackages, savePackages, createPackage, sendLeadQuote, getLeadPhotoUrl }
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
  const ruhsatSeriNo = lead.ruhsatSeriNo ?? lead.ruhsatData?.ruhsatSeriNo ?? '—'

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
              <dt>Ruhsat Seri No</dt><dd><code>{ruhsatSeriNo}</code></dd>
              <dt>Kullanım</dt><dd>{lead.ruhsatData?.kullanimTarzi ?? lead.ruhsatData?.kullanimAmaci ?? '—'}</dd>
              <dt>Paket</dt><dd>{lead.packageChoice ?? '—'}</dd>
              <dt>Durum</dt><dd>{STATUS_LABELS[lead.status] ?? lead.status}</dd>
              <dt>Tarih</dt><dd>{formatDate(lead.createdAt)}</dd>
              {lead.ruhsatData?.sasiNo && <><dt>Şasi (VIN)</dt><dd><code>{lead.ruhsatData.sasiNo}</code></dd></>}
              {lead.ruhsatData?.motorNo && <><dt>Motor no</dt><dd><code>{lead.ruhsatData.motorNo}</code></dd></>}
            </dl>
            <h4 style={{ marginTop: '1rem' }}>Teklif fiyatı & gönder</h4>
            <label>
              Teklif fiyatı (TL)
              <input
                type="text"
                inputMode="decimal"
                value={quotePrice}
                onChange={(e) => setQuotePrice(e.target.value)}
                placeholder="Örn: 12500"
              />
            </label>
            {quoteError && <p className="error">{quoteError}</p>}
            <button type="button" className="btn-send-quote" onClick={onSendQuote} disabled={sendingQuote}>
              {sendingQuote ? 'Gönderiliyor…' : 'Müşteriye Gönder'}
            </button>
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

function ConversationsView({ conversations, formatDate, initialChatId }: { conversations: Conversation[]; formatDate: (ts: number) => string; initialChatId?: string | null }) {
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
              return (
                <li key={cid}>
                  <button
                    type="button"
                    className={activeChat === cid ? 'active' : ''}
                    onClick={() => setSelectedChat(cid)}
                  >
                    <span className="chat-id">ID: {cid}</span>
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
              <strong>Konuşma — {activeChat}</strong>
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

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { fetchLeads, fetchConversations, fetchPackages, savePackages, sendLeadQuote, getLeadPhotoUrl } = useApi(token)
  const [leads, setLeads] = useState<Lead[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [packagesLoadError, setPackagesLoadError] = useState('')
  const [packagesSaveError, setPackagesSaveError] = useState('')
  const [savingPackages, setSavingPackages] = useState(false)
  const [tab, setTab] = useState<'leads' | 'conversations' | 'packages'>('leads')
  const [conversationChatId, setConversationChatId] = useState<string | null>(null)
  const [detailLead, setDetailLead] = useState<Lead | null>(null)
  const [quotePrice, setQuotePrice] = useState<string>('')
  const [sendingQuote, setSendingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [packagesSaveSuccess, setPackagesSaveSuccess] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
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
      setLoading(false)
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

  return (
    <div className="dashboard">
      <header>
        <h1>Sigorta Admin</h1>
        <div>
          <button type="button" onClick={load} disabled={loading}>Yenile</button>
          <button type="button" onClick={() => onLogout()} className="outline">Çıkış</button>
        </div>
      </header>
      {err && <p className="error">{err}</p>}
      <nav>
        <button type="button" className={tab === 'leads' ? 'active' : ''} onClick={() => setTab('leads')}>Teklifler ({leads.length})</button>
        <button type="button" className={tab === 'conversations' ? 'active' : ''} onClick={() => setTab('conversations')}>Konuşmalar</button>
        <button type="button" className={tab === 'packages' ? 'active' : ''} onClick={() => setTab('packages')}>Paket fiyatları</button>
      </nav>
      {loading ? (
        <p>Yükleniyor…</p>
      ) : tab === 'leads' ? (
        <div className="table-wrap">
          <p className="muted" style={{ marginBottom: '0.5rem' }}>Tüm teklif talepleri tarih sırasıyla listelenir.</p>
          <table>
            <thead>
              <tr>
                <th>İsim</th>
                <th>Soyisim</th>
                <th>Plaka</th>
                <th>TC</th>
                <th>Marka</th>
                <th>Model</th>
                <th>KM</th>
                <th>Ruhsat Seri No</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((row) => {
                const isim = row.firstName ?? row.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/)[0] ?? '—'
                const soyisim = row.lastName ?? row.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/).slice(1).join(' ') ?? '—'
                return (
                  <tr key={row.id}>
                    <td>{isim}</td>
                    <td>{soyisim}</td>
                    <td className="cell-plate">{row.plate ?? row.ruhsatData?.plaka ?? '—'}</td>
                    <td className="cell-tc">{row.tc ?? row.ruhsatData?.tcKimlik ?? '—'}</td>
                    <td>{row.marka ?? row.ruhsatData?.markaTip ?? row.ruhsatData?.marka ?? row.markaKm ?? '—'}</td>
                    <td>{row.model ?? row.ruhsatData?.tipi ?? '—'}</td>
                    <td>{row.km ?? '—'}</td>
                    <td className="cell-ruhsat-no">{row.ruhsatSeriNo ?? row.ruhsatData?.ruhsatSeriNo ?? '—'}</td>
                    <td className={row.status === 'fiyat_bekleniyor' ? 'status-fiyat-bekleniyor' : ''}>
                      {row.status === 'fiyat_bekleniyor' ? 'Fiyat Bekleniyor' : (STATUS_LABELS[row.status] ?? row.status)}
                    </td>
                    <td>
                      <button type="button" className="btn-detay" onClick={() => { setDetailLead(row); setQuotePrice(row.offeredPrice != null ? String(row.offeredPrice) : ''); setQuoteError(''); }}>
                        Detay
                      </button>
                      <button type="button" className="btn-mesajlar" onClick={() => { setConversationChatId(row.chatId); setTab('conversations'); }}>
                        Mesajlar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {leads.length === 0 && <p>Henüz teklif yok.</p>}
        </div>
      ) : tab === 'conversations' ? (
        <ConversationsView conversations={conversations} formatDate={formatDate} initialChatId={conversationChatId} />
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
        />
      )}
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('adminToken'))

  useEffect(() => {
    if (token) sessionStorage.setItem('adminToken', token)
    else sessionStorage.removeItem('adminToken')
  }, [token])

  return (
    <div id="app">
      {token ? (
        <Dashboard token={token} onLogout={() => setToken(null)} />
      ) : (
        <Login onLogin={setToken} />
      )}
    </div>
  )
}
