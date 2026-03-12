type Props = {
  settingsLoading: boolean
  settingsSaveError: string
  settingsSaveSuccess: boolean
  isletmeAdi: string
  isletmeLogoUrl: string
  mesaiBaslangic: string
  mesaiBitis: string
  mesaiGunler: number[]
  mesajHemenMesaiIci: string
  mesajHemenMesaiDis: string
  mesajOzelTarihIstek: string
  mesajOzelTarihOnay: string
  conversationSaklamaGunu: string
  stateTimeoutDakika: string
  stateUyariDakika: string
  stateUyariMesaj: string
  stateIptalMesaj: string
  msgWelcomeNew: string
  msgWelcomeReturning: string
  msgFallbackMenu: string
  onSave: () => void
  setIsletmeAdi: (v: string) => void
  setIsletmeLogoUrl: (v: string) => void
  setMesaiBaslangic: (v: string) => void
  setMesaiBitis: (v: string) => void
  setMesaiGunler: (updater: (prev: number[]) => number[]) => void
  setMesajHemenMesaiIci: (v: string) => void
  setMesajHemenMesaiDis: (v: string) => void
  setMesajOzelTarihIstek: (v: string) => void
  setMesajOzelTarihOnay: (v: string) => void
  setConversationSaklamaGunu: (v: string) => void
  setStateTimeoutDakika: (v: string) => void
  setStateUyariDakika: (v: string) => void
  setStateUyariMesaj: (v: string) => void
  setStateIptalMesaj: (v: string) => void
  setMsgWelcomeNew: (v: string) => void
  setMsgWelcomeReturning: (v: string) => void
  setMsgFallbackMenu: (v: string) => void
}

export function SettingsView({
  settingsLoading,
  settingsSaveError,
  settingsSaveSuccess,
  isletmeAdi,
  isletmeLogoUrl,
  mesaiBaslangic,
  mesaiBitis,
  mesaiGunler,
  mesajHemenMesaiIci,
  mesajHemenMesaiDis,
  mesajOzelTarihIstek,
  mesajOzelTarihOnay,
  conversationSaklamaGunu,
  stateTimeoutDakika,
  stateUyariDakika,
  stateUyariMesaj,
  stateIptalMesaj,
  msgWelcomeNew,
  msgWelcomeReturning,
  msgFallbackMenu,
  onSave,
  setIsletmeAdi,
  setIsletmeLogoUrl,
  setMesaiBaslangic,
  setMesaiBitis,
  setMesaiGunler,
  setMesajHemenMesaiIci,
  setMesajHemenMesaiDis,
  setMesajOzelTarihIstek,
  setMesajOzelTarihOnay,
  setConversationSaklamaGunu,
  setStateTimeoutDakika,
  setStateUyariDakika,
  setStateUyariMesaj,
  setStateIptalMesaj,
  setMsgWelcomeNew,
  setMsgWelcomeReturning,
  setMsgFallbackMenu,
}: Props) {
  return (
    <div className="settings-view">
      {settingsLoading ? (
        <p className="settings-loading">Yükleniyor…</p>
      ) : (
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault()
            onSave()
          }}
        >
          <article className="settings-card settings-card-brand">
            <header className="settings-card-header">
              <h2>İşletme / marka</h2>
              <p className="settings-card-desc">
                Admin panel başlığında görünecek. Satış aşamasında her işletme kendi adı ve logosuyla gösterilir.
              </p>
            </header>
            <div className="settings-card-body">
              <div className="settings-field">
                <label className="settings-field-label">İşletme adı</label>
                <input
                  type="text"
                  className="settings-input"
                  value={isletmeAdi}
                  onChange={(e) => setIsletmeAdi(e.target.value)}
                  placeholder="Sigorta Admin"
                />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Logo URL</label>
                <input
                  type="url"
                  className="settings-input"
                  value={isletmeLogoUrl}
                  onChange={(e) => setIsletmeLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
                <span className="settings-field-hint">
                  Önerilen: 140×40 px veya oranına uygun. Boş bırakırsanız sadece isim gösterilir.
                </span>
              </div>
              <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={onSave}>
                Kaydet
              </button>
            </div>
          </article>

          <div className="settings-grid">
            <article className="settings-card">
              <header className="settings-card-header">
                <h2>Hemen mesajları</h2>
                <p className="settings-card-desc">
                  Müşteri "Hemen" seçeneğine bastığında göreceği mesajlar. Mesai dışı mesajda{' '}
                  <code>{'{mesaiAraligi}'}</code> otomatik doldurulur.
                </p>
              </header>
              <div className="settings-card-body">
                <div className="settings-field">
                  <label className="settings-field-label">Mesai içindeyken</label>
                  <textarea
                    className="settings-textarea"
                    value={mesajHemenMesaiIci}
                    onChange={(e) => setMesajHemenMesaiIci(e.target.value)}
                    rows={4}
                    placeholder="Müşteri temsilcilerimiz en kısa sürede sizi arayacak."
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">Mesai dışındayken</label>
                  <textarea
                    className="settings-textarea"
                    value={mesajHemenMesaiDis}
                    onChange={(e) => setMesajHemenMesaiDis(e.target.value)}
                    rows={4}
                    placeholder="Üzgünüz, şu anda mesai saatleri içinde değiliz. {mesaiAraligi} aralığında Özel tarih seçerek aranma zamanı oluşturabilirsiniz."
                  />
                </div>
                <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={onSave}>
                  Kaydet
                </button>
              </div>
            </article>

            <article className="settings-card">
              <header className="settings-card-header">
                <h2>Özel tarih mesajları</h2>
                <p className="settings-card-desc">
                  Müşteri "Özel tarih" butonuna bastığında göreceği mesajlar. <code>{'{start}'}</code>,{' '}
                  <code>{'{end}'}</code> = mesai saatleri, <code>{'{tarih}'}</code> = seçilen gün/saat.
                </p>
              </header>
              <div className="settings-card-body">
                <div className="settings-field">
                  <label className="settings-field-label">Gün/saat seçim istemi</label>
                  <textarea
                    className="settings-textarea settings-textarea-lg"
                    value={mesajOzelTarihIstek}
                    onChange={(e) => setMesajOzelTarihIstek(e.target.value)}
                    rows={5}
                    placeholder={'Aranma zamanı seçin (mesai: {start}-{end})'}
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">Onay mesajı</label>
                  <textarea
                    className="settings-textarea"
                    value={mesajOzelTarihOnay}
                    onChange={(e) => setMesajOzelTarihOnay(e.target.value)}
                    rows={3}
                    placeholder={'Tercihiniz kaydedildi. {tarih} tarihinde sizi arayacağız.'}
                  />
                </div>
                <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={onSave}>
                  Kaydet
                </button>
              </div>
            </article>
          </div>

          <article className="settings-card settings-card-mesai">
            <header className="settings-card-header">
              <h2>Mesai saatleri</h2>
              <p className="settings-card-desc">
                Müşteri "Evet, arasın" dediğinde mesai dışındaysa Özel tarih seçenekleri bu saatlere göre hesaplanır.
              </p>
            </header>
            <div className="settings-card-body settings-mesai-body">
              <div className="settings-mesai-time">
                <div className="settings-field-inline">
                  <label className="settings-field-label">Başlangıç</label>
                  <input
                    type="time"
                    value={mesaiBaslangic}
                    onChange={(e) => setMesaiBaslangic(e.target.value)}
                    className="settings-time-input"
                  />
                </div>
                <span className="settings-mesai-sep">–</span>
                <div className="settings-field-inline">
                  <label className="settings-field-label">Bitiş</label>
                  <input
                    type="time"
                    value={mesaiBitis}
                    onChange={(e) => setMesaiBitis(e.target.value)}
                    className="settings-time-input"
                  />
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
                          if (e.target.checked)
                            setMesaiGunler((prev) => [...prev, v].sort((a, b) => a - b))
                          else setMesaiGunler((prev) => prev.filter((d) => d !== v))
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={onSave}>
                Kaydet
              </button>
            </div>
          </article>

          <article className="settings-card">
            <header className="settings-card-header">
              <h2>Karşılama & menü metinleri</h2>
              <p className="settings-card-desc">
                WhatsApp botunun ilk karşılama mesajlarını ve tüm durumlar için genel menü davetini burada
                özelleştirebilirsiniz.
              </p>
            </header>
            <div className="settings-card-body">
              <div className="settings-field">
                <label className="settings-field-label">Yeni kullanıcı karşılama metni</label>
                <textarea
                  className="settings-textarea"
                  value={msgWelcomeNew}
                  onChange={(e) => setMsgWelcomeNew(e.target.value)}
                  rows={3}
                  placeholder={
                    'Merhaba! 🚗 Araç sigortası dijital asistanına hoş geldiniz.\n\nSize nasıl yardımcı olabilirim? Teklif almak, hasar bildirimi veya canlı destek için aşağıdaki menüden seçim yapabilirsiniz. 😊'
                  }
                />
                <span className="settings-field-hint">Boş bırakırsanız varsayılan metin kullanılır.</span>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Geri dönen kullanıcı karşılama metni</label>
                <textarea
                  className="settings-textarea"
                  value={msgWelcomeReturning}
                  onChange={(e) => setMsgWelcomeReturning(e.target.value)}
                  rows={3}
                  placeholder={'{greeting} Size nasıl yardımcı olabilirim?\n\nLütfen aşağıdan bir işlem seçin.'}
                />
                <span className="settings-field-hint">
                  <code>{'{greeting}'}</code> = otomatik selamlama,&nbsp;
                  <code>{'{ad}'}</code>, <code>{'{isim}'}</code>, <code>{'{name}'}</code> = müşterinin adı.
                </span>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Genel menü daveti (fallback)</label>
                <textarea
                  className="settings-textarea"
                  value={msgFallbackMenu}
                  onChange={(e) => setMsgFallbackMenu(e.target.value)}
                  rows={2}
                  placeholder="Size nasıl yardımcı olabilirim? Aşağıdaki butonlardan seçin: 😊"
                />
                <span className="settings-field-hint">
                  Bot metni anlamadığında göstereceği kısa davet mesajı.
                </span>
              </div>
              <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={onSave}>
                Kaydet
              </button>
            </div>
          </article>

          <article className="settings-card">
            <header className="settings-card-header">
              <h2>İşlem zaman aşımı</h2>
              <p className="settings-card-desc">
                Müşteri teklif akışında yanıt vermezse işlem otomatik iptal edilir. İptalden önce uyarı mesajı
                gönderilir.
              </p>
            </header>
            <div className="settings-card-body">
              <div className="settings-field">
                <label className="settings-field-label">İşlem iptal süresi (dakika)</label>
                <input
                  type="number"
                  min={5}
                  max={10080}
                  value={stateTimeoutDakika}
                  onChange={(e) => setStateTimeoutDakika(e.target.value)}
                  placeholder="1440"
                  className="settings-time-input"
                  style={{ maxWidth: '120px' }}
                  title="1440 = 24 saat"
                />
                <span className="settings-field-hint">1440 = 24 saat, 60 = 1 saat</span>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Uyarı mesajı – iptalden kaç dakika önce</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={stateUyariDakika}
                  onChange={(e) => setStateUyariDakika(e.target.value)}
                  placeholder="5"
                  className="settings-time-input"
                  style={{ maxWidth: '80px' }}
                />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Uyarı mesajı metni</label>
                <textarea
                  className="settings-textarea"
                  value={stateUyariMesaj}
                  onChange={(e) => setStateUyariMesaj(e.target.value)}
                  rows={2}
                  placeholder="Devam etmezseniz {dakika} dakika içinde işleminiz sonlanacaktır."
                />
                <span className="settings-field-hint">
                  <code>{'{dakika}'}</code> = uyarı dakikası
                </span>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">İptal mesajı</label>
                <textarea
                  className="settings-textarea"
                  value={stateIptalMesaj}
                  onChange={(e) => setStateIptalMesaj(e.target.value)}
                  rows={2}
                  placeholder="İşleminiz zaman aşımına uğradı. Yeniden başlayabilirsiniz."
                />
              </div>
              <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={onSave}>
                Kaydet
              </button>
            </div>
          </article>

          <article className="settings-card">
            <header className="settings-card-header">
              <h2>Telegram sohbet temizliği</h2>
              <p className="settings-card-desc">
                Sadece Telegram uygulamasındaki mesajlar bu süre sonra silinir. Veritabanı ve admin paneldeki
                konuşmalar her zaman saklanır. 0 = silme yok.
              </p>
            </header>
            <div className="settings-card-body">
              <div className="settings-field">
                <label className="settings-field-label">Telegram'da mesaj silme süresi (gün)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={conversationSaklamaGunu}
                  onChange={(e) => setConversationSaklamaGunu(e.target.value)}
                  placeholder="30"
                  className="settings-time-input"
                  style={{ maxWidth: '120px' }}
                />
              </div>
              <button type="button" className="lead-btn lead-btn-primary settings-card-save" onClick={onSave}>
                Kaydet
              </button>
            </div>
          </article>

          {settingsSaveError && <p className="settings-error">{settingsSaveError}</p>}
          {settingsSaveSuccess && <p className="settings-success">Ayarlar kaydedildi.</p>}
        </form>
      )}
    </div>
  )
}
