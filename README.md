# TennoDesk

**TennoDesk**, Windows için yerel çalışan, gizlilik odaklı bir Warframe yardımcı
uygulamasıdır. Envanterini okur, warframe.market canlı verisiyle fiyatlandırır,
ekrandaki relic ödüllerini tarar ve arbitration koşularını `EE.log`'dan takip
eder — hepsi kendi makinende, üçüncü taraf bir overlay katmanı olmadan.

> TennoDesk, açık kaynak **[WFHelper](https://github.com/WFHelper/wfhelper)**
> projesinin (MIT) kişisel kullanım için derlenmiş ve Türkçeleştirilmiş bir
> çatallamasıdır (fork). Resmî WFHelper ile bağlantılı değildir.

---

## İndirme (kullanıcılar için)

En güncel kurulumu doğrudan indir:

**⬇️ [TennoDesk-Setup.exe indir](https://github.com/MacqTrulzCrv/TennoDesk/releases/latest/download/TennoDesk-Setup.exe)** · [tüm sürümler](https://github.com/MacqTrulzCrv/TennoDesk/releases)

1. `TennoDesk-Setup.exe`'yi indirip çalıştır.
2. Windows **SmartScreen** uyarısı çıkabilir ("Windows bilgisayarınızı korudu") —
   uygulama kod imzalı olmadığı için normaldir. **Ek bilgi → Yine de çalıştır** de.
3. Kurulum bitince TennoDesk, Başlat menüsünden açılır.

Kurulum konumu: `%LOCALAPPDATA%\Programs\TennoDesk` · veri: `%APPDATA%\TennoDesk`

> Kendin kaynaktan derlemek istersen aşağıdaki
> [Kaynaktan derleme](#kaynaktan-derleme-ve-kurulum) bölümüne bak.

---

## Öne çıkan özellikler

- **Build Rehberi** — 150 item / 160 build için küratörlü, Kasım 2026 metasına
  göre hazırlanmış build kartları (62 Warframe + 88 silah: 30 primary / 27
  secondary / 31 melee; mod/aura/exilus/stance/arcane + polarite ikonları, forma
  sayısı, archon shard, Türkçe notlar). Envanterinle çaprazlanır: sahip olduğun
  ✓ / eksik ✗ işaretlenir.
- **Tam Türkçe arayüz** — uygulamanın tamamı Türkçeleştirildi (resmî oyun
  terimleri dahil). Dil: Ayarlar → Dil → **Türkçe**.
- **Envanter değerleme** — tüm takas edilebilir eşyaların canlı platin değeri,
  kategori mercekleri (prime parçalar / modlar / arcane'ler / kaynaklar / petler).
- **Satılabilirler + Hızlı sat** — tek tıkla warframe.market ilan taslağı; kart
  tıklayınca sağda order book / satış paneli açılır; toplu satış köprüsü.
- **Relic ödül overlay** — oyun içi relic seçim ekranını tarar, en değerli ödülü
  vurgular (Türkçe item adları da eşleşir).
- **WFM entegrasyonu** — presence ("ingame" durumu), canlı sipariş akışı, fiyat
  geçmişi.
- **F10** — Planner (relic öneri listesi) overlay'ini aç/kapat.

> ⚠️ **TennoDesk hiçbir makro / otomasyon / girdi enjeksiyonu içermez ve asla
> içermeyecektir.** Bu tür özellikler oyunun kullanım şartlarını ihlal eder ve
> hesap yasağına yol açar. Uygulama yalnızca okuma (bellek + ekran OCR + resmî
> API) yapar.

---

## Gereksinimler

| Araç     | Sürüm                                    |
| -------- | ---------------------------------------- |
| Windows  | 10 / 11 (x64)                            |
| Node.js  | **≥ 22.12**                              |
| pnpm     | **11.x** (`pnpm@11.1.2` ile test edildi) |
| Electron | 41.x (otomatik indirilir)                |

pnpm kurulu değilse: `corepack enable && corepack prepare pnpm@11.1.2 --activate`

---

## Kaynaktan derleme ve kurulum

```bash
# 1) Depoyu klonla
git clone https://github.com/MacqTrulzCrv/TennoDesk.git
cd TennoDesk

# 2) Bağımlılıkları kur
pnpm install

# 3) Windows installer üret (NSIS)
pnpm dist:win
#   -> release/TennoDesk-<sürüm>-Setup.exe
```

Kurulum (sessiz):

```powershell
# Çalışan örneği kapat, sonra sessiz kur
Get-Process TennoDesk -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process "release\TennoDesk-1.0.0-Setup.exe" -ArgumentList "/S" -Wait
```

Kurulum konumu: `%LOCALAPPDATA%\Programs\TennoDesk`
Kullanıcı verisi: `%APPDATA%\TennoDesk`

> **Otomatik güncelleyici kapalıdır** (`"publish": null` → `app-update.yml`
> üretilmez). İmzasız resmî bir binary senin derlemeni ezmez.

---

## Güncelleme akışı

TennoDesk kendini güncellemez. Yeni bir sürüm derlemek için:

```bash
git pull                 # (upstream yamaları çekilecekse — local yamalara dikkat)
pnpm install             # bağımlılık değiştiyse
pnpm dist:win            # yeniden derle
# sonra yukarıdaki sessiz kurulum adımı
```

Upstream WFHelper'dan `git pull` yaparken **local yamalar korunmalıdır**
(`README-LOCAL.md` içindeki "Local yamalar" bölümüne bakın; gerekirse stash/branch).

---

## Geliştirme

```bash
pnpm dev                 # geliştirme modunda çalıştır
pnpm test                # birim testleri (vitest)
pnpm run test:e2e        # uçtan uca testler (Playwright + Electron)
pnpm run builds:validate # Build Rehberi verisini @wfcd/items havuzuna göre doğrula
pnpm run typecheck:tests # tip kontrolü
```

Her değişiklikten sonra kural: typecheck + testler + derleme **yeşil** olmalı.

---

## Veri ve gizlilik

- Oturum/WFM token'ı işletim sisteminin güvenli deposunda (safeStorage) şifreli
  tutulur, düz metin olarak diske yazılmaz.
- Envanter verisi yalnızca senin makinende (`%APPDATA%\TennoDesk`) saklanır.
- warframe.market fiyatları doğrudan resmî API'den çekilir; relic/wiki/statik
  veri ve ikon aynası için kendi bağımsız altyapımıza bağlanılır
  (`api.tennodesk.workers.dev` + `assets.tennodesk.workers.dev`) — yazarın
  sunucularına bağımlılık yoktur.

---

## Lisans

MIT — bkz. [`LICENSE`](LICENSE). Orijinal eser © WFHelper; fork değişiklikleri
© TennoDesk. Warframe ve ilgili varlıklar Digital Extremes'e aittir; bu proje
Digital Extremes veya WFHelper ile resmî olarak bağlantılı değildir.
