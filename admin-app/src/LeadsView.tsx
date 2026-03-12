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

type Props = {
  leads: Lead[]
  filteredLeads: Lead[]
  fiyatBekleyenCount: number
  leadDateFrom: string
  leadDateTo: string
  leadSearch: string
  onChangeDateFrom: (v: string) => void
  onChangeDateTo: (v: string) => void
  onSetDateRange: (from: string, to: string) => void
  onChangeSearch: (v: string) => void
  onOpenLeadDetail: (lead: Lead) => void
  onOpenConversation: (lead: Lead) => void
  formatDate: (ts: number) => string
  formatRelativeTime: (ts: number) => string
  STATUS_LABELS: Record<string, string>
}

export function LeadsView({
  leads,
  filteredLeads,
  fiyatBekleyenCount,
  leadDateFrom,
  leadDateTo,
  leadSearch,
  onChangeDateFrom,
  onChangeDateTo,
  onSetDateRange,
  onChangeSearch,
  onOpenLeadDetail,
  onOpenConversation,
  formatDate,
  formatRelativeTime,
  STATUS_LABELS,
}: Props) {
  const toplamTeklif = leads.length
  const filtreliTeklif = filteredLeads.length

  const bugun = new Date()
  const bugunStr = bugun.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })

  return (
    <div className="leads-layout">
      <aside className="leads-sidebar">
        <div className="leads-sidebar-section">
          <h2 className="leads-sidebar-title">Özet</h2>
          <div className="leads-metrics">
            <div className="leads-metric-card">
              <span className="leads-metric-label">Toplam teklif</span>
              <span className="leads-metric-value">{toplamTeklif}</span>
              <span className="leads-metric-sub">Bugün: {bugunStr}</span>
            </div>
            <div className="leads-metric-card">
              <span className="leads-metric-label">Fiyat bekleyen</span>
              <span className="leads-metric-value leads-metric-value-warning">{fiyatBekleyenCount}</span>
              <span className="leads-metric-sub">Aktif işlem sayısı</span>
            </div>
          </div>
        </div>

        <div className="leads-sidebar-section">
          <h2 className="leads-sidebar-title">Tarih filtresi</h2>
          <div className="leads-sidebar-fields">
            <label className="settings-field-label">Başlangıç</label>
            <input
              type="date"
              className="leads-view-date"
              value={leadDateFrom}
              onChange={(e) => onChangeDateFrom(e.target.value)}
              aria-label="Başlangıç tarihi"
            />
            <label className="settings-field-label">Bitiş</label>
            <input
              type="date"
              className="leads-view-date"
              value={leadDateTo}
              onChange={(e) => onChangeDateTo(e.target.value)}
              aria-label="Bitiş tarihi"
            />
            <div className="leads-view-date-presets leads-view-date-presets-column">
              <button
                type="button"
                className={!leadDateFrom && !leadDateTo ? 'active' : ''}
                onClick={() => onSetDateRange('', '')}
              >
                Tümü
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date()
                  const s = d.toISOString().slice(0, 10)
                  onSetDateRange(s, s)
                }}
              >
                Bugün
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date()
                  const end = d.toISOString().slice(0, 10)
                  d.setDate(d.getDate() - 6)
                  const start = d.toISOString().slice(0, 10)
                  onSetDateRange(start, end)
                }}
              >
                Bu hafta
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date()
                  const end = d.toISOString().slice(0, 10)
                  d.setDate(1)
                  const start = d.toISOString().slice(0, 10)
                  onSetDateRange(start, end)
                }}
              >
                Bu ay
              </button>
            </div>
          </div>
        </div>

        <div className="leads-sidebar-section">
          <h2 className="leads-sidebar-title">Arama</h2>
          <input
            type="search"
            className="leads-view-search"
            placeholder="İsim, plaka, marka..."
            value={leadSearch}
            onChange={(e) => onChangeSearch(e.target.value)}
            aria-label="Ara"
          />
          <p className="leads-sidebar-hint">
            İsim, plaka, TC, marka, model veya ruhsat numarası ile arama yapabilirsiniz.
          </p>
        </div>

        <div className="leads-sidebar-footer">
          <span className="leads-sidebar-count">
            Gösterilen: <strong>{filtreliTeklif}</strong> / {toplamTeklif}
          </span>
        </div>
      </aside>

      <section className="leads-main">
        {toplamTeklif === 0 ? (
          <p className="leads-empty">Henüz teklif yok.</p>
        ) : filteredLeads.length === 0 ? (
          <p className="leads-empty">Bu filtreye uyan teklif yok.</p>
        ) : (
          <div className="leads-grid leads-grid-modern">
            {filteredLeads.map((row) => {
              const isim = row.firstName ?? row.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/)[0] ?? '—'
              const soyisim =
                row.lastName ?? row.ruhsatData?.sahibiAdiSoyadi?.split(/\s+/).slice(1).join(' ') ?? '—'
              const fullName = [isim, soyisim].filter(Boolean).join(' ').trim() || '—'
              const initial = (isim?.[0] ?? soyisim?.[0] ?? '?').toUpperCase()
              const plaka = row.plate ?? row.ruhsatData?.plaka ?? '—'
              const statusLabel =
                row.status === 'fiyat_bekleniyor'
                  ? 'Fiyat Bekleniyor'
                  : STATUS_LABELS[row.status] ?? row.status

              const statusClass =
                row.status === 'fiyat_bekleniyor' || row.status === 'arama_bekliyor'
                  ? 'lead-card-status-warning'
                  : row.status === 'cancelled' || row.status === 'timeout_cancelled'
                  ? 'lead-card-status-cancelled'
                  : ''

              return (
                <article key={row.id} className="lead-card lead-card-modern">
                  <div className="lead-card-header">
                    <span className="lead-card-avatar">{initial}</span>
                    <div className="lead-card-title-wrap">
                      <span className="lead-card-name">{fullName}</span>
                      <span className="lead-card-plaka">{plaka}</span>
                      <span className="lead-card-date" title={formatDate(row.createdAt)}>
                        {formatRelativeTime(row.createdAt)}
                      </span>
                    </div>
                    <span className={`lead-card-status ${statusClass}`}>{statusLabel}</span>
                  </div>

                  <dl className="lead-card-fields lead-card-fields-compact">
                    <div>
                      <dt>TC</dt>
                      <dd>{row.tc ?? row.ruhsatData?.tcKimlik ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Marka</dt>
                      <dd>
                        {row.marka ??
                          row.ruhsatData?.markaTip ??
                          row.ruhsatData?.marka ??
                          row.markaKm ??
                          '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{row.model ?? row.ruhsatData?.tipi ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>KM</dt>
                      <dd>{row.km ?? '—'}</dd>
                    </div>
                    {row.status === 'arama_bekliyor' && row.aramaTercihi && (
                      <div>
                        <dt>Arama tercihi</dt>
                        <dd>{row.aramaTercihi}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="lead-card-actions lead-card-actions-split">
                    <button
                      type="button"
                      className="lead-btn lead-btn-primary"
                      onClick={() => onOpenLeadDetail(row)}
                    >
                      Detay
                    </button>
                    <button
                      type="button"
                      className="lead-btn lead-btn-secondary"
                      onClick={() => onOpenConversation(row)}
                    >
                      Mesajlar
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

