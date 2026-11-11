# Çok Dilli Takas Otomatik-Kapatma — Teknik Plan (PR Taslağı)

> Durum: TASLAK / onay bekliyor. Kod yazılmadı.
> Kök neden kanıtları shell ile doğrulandı (kullanıcı EE.log'u + canlı userData).
> Hedef: Oyun İngilizce dışında bir dildeyken (başlangıç: **Türkçe `-language:tr`**) oyun-içi
> takaslar tespit edilsin, kaydedilsin ve eşleşen warframe.market ilanı otomatik kapatılsın.

---

## 1. Problem / Kök Neden (3 katman)

Oyun `-language:tr` ile çalışıyor (EE.log başlığı: `-language:tr`, `Using language: _tr`).
Takas tespiti baştan sona **sabit İngilizce metne** bağlı. Bu yüzden:

- `trade-log.json` **hiç oluşmamış** → tek bir takas bile kaydedilmemiş.
- `autoCloseWfmOrders: true` ve WFM oturumu açık olmasına rağmen kapatma hiç tetiklenmemiş.

Otomatik kapatmanın çalışması için **üç ayrı katmanın** da dili anlaması gerekiyor:

### Katman 1 — Diyalog ayrıştırma (`services/eeLogMonitor.ts`)
Yapısal fark var; sadece string değişimi yetmez. Kullanıcının EE.log'undaki 7 gerçek satıştan çıkarıldı:

| Alan | İngilizce (kodda) | Türkçe (gerçek EE.log) |
|---|---|---|
| Başlangıç | `Are you sure you want to accept this trade?` | `Bu takası onaylamak istiyor musunuz?` |
| Sunulan blok | `You are offering:` | `Önerdiğiniz ürün:` |
| Ayraç | `and will receive from **X** the following:` | `**X** isimli oyuncunun size önerdiği ürün:` (oyuncu adı **başta**) |
| Adet | `Platinum x 10` / `Name x N` (isim önce) | `10 x Platinum` / `N x Name` (**sayı önce**) |
| Başarı | `The trade was successful!` | `Takas başarılı bir şekilde gerçekleşti.` |

İlgili sabitler/akış: `TRADE_DIALOG_START` (211), `TRADE_SUCCESS` (212), buffer tetik (477-490),
başarı tetik (492-507), `_parseTradeDialog` (546-626). İçinde İngilizceye gömülü noktalar:
`"You are offering:"` (550, 561), `/and will receive from (.+?) the following:/i` (555),
platin regex `^Platinum(?: x (\d+))?$` (583), stack regex `^(.+?) x (\d+)$` (592).

### Katman 2 — DBWIN ön-filtresi (`services/debugLineFilter.ts:19-20`)
Gerçek-zamanlı DBWIN yolu (`dbwinWorker.ts:187`, `protonDebugstrMonitor.ts:238`) yalnızca
`"you are offering"` / `"the trade was successful"` içeren satırları `handleLine`'a geçiriyor.
Türkçe satırlar daha handler'a varmadan eleniyor.
> Not: Dosya-okuma yolu (`pollReadNewBytes` → `consumeChunk`) bu kapıyı KULLANMIYOR, o yüzden
> tek başına ölümcül değil — ama DBWIN daha hızlı ve güvenilir; düzeltilmeli.

### Katman 3 — Eşya adı → WFM slug çözümü (EN KRİTİK)
Takastaki adlar Türkçe ("Gauss Prime Kalıp", "Akjagara Prime Sürgü"). Eşleştirici zinciri:
`eeLogMonitor` → `tradeTracker.recordTradeFromLog` → `tradeItemName.lookupTradedCatalogItem`
→ `wfmCatalog.lookupByName`. Ama `wfmCatalog` **yalnızca İngilizce** (`i18n.en.name`, wfmCatalog.ts:48)
indeksliyor; WFM ham verisi zaten sadece `i18n.en` taşıyor (wfmTypes.ts:78).
**Katman 1+2 düzeltilse bile Türkçe ad WFM ilanına eşleşmez → ilan kapanmaz.**

---

## 2. Tasarım Kararı

Mimari ilkesi (gameLocale.ts başlığı): *"English stays canonical everywhere inside main: it is the
join key for warframe.market, OCR matching and every by-name lookup we own."*

→ **En temiz ve ilkeye uygun çözüm: lokalize adı KAYNAKTA İngilizceye çevir.** Takas diyaloğu
ayrıştırılırken (ya da `lookupTradedCatalogItem` içinde) Türkçe ad İngilizceye dönüştürülür;
zincirin geri kalanı hiç değişmeden İngilizce-kanonik kalır.

### Ters-çeviri neden kesin çalışır (doğrulandı)
`en.json` ve `tr.json` **aynı langKey'leri** paylaşıyor:
```
/Lotus/Language/Primes/CraftingComponent_EpitaphPrimeReceiver
    tr: "Epitaph Prime Sürgü"   en: "Epitaph Prime Receiver"
/Lotus/Language/Primes/CraftingComponent_GaussPrimeSystemsName
    tr: "Gauss Prime Sistemleri" en: "Gauss Prime Systems"
```
Ters harita: `tr değeri (lowercase) → langKey → en değeri`. 1-1, çeviri gerektirmez.

### Blueprint kompozisyonu (nüans)
Takasta "Gauss Prime Sistemleri **Kalıp**" görünür ama tr.json'da değer "Gauss Prime Sistemleri"dir.
Oyun `/Lotus/Language/Items/BlueprintAndItem` desenini uygular:
```
en: "|ITEM| Blueprint"    tr: "|ITEM| Kalıp"
```
Çözüm: lokalize Blueprint sarmalayıcısını (regex `^(.+?) Kalıp$`) soy → tabanı çöz → İngilizce taban.
`lookupTradedCatalogItem` zaten `baseName.replace(/ Blueprint$/i, "")` yapıyor, yani İngilizce taban
yeter (yeniden " Blueprint" eklemeye gerek yok).

### WFM kataloğunu Türkçe indekslemek — REDDEDİLDİ
WFM ham verisi `i18n.tr` taşımıyor; mümkün değil. langKey-join tek yol.

---

## 3. Dosya Dosya Değişiklikler

### 3a. YENİ: `services/gameLocale.ts` — ters çözümleyici
`en.json`'u her zaman yükle (şu an `loadNames("en")` EMPTY döndürüyor; dosya 575KB, **mevcut**).
Yeni API:
```ts
// Aktif locale için lazy, cache'li ters indeks: localizedLc -> langKey
// + englishNames: langKey -> İngilizce (en.json'dan)
// + blueprint wrapper desenleri (aktif locale ve en için BlueprintAndItem)
export function localizedToEnglishItemName(name: string): string | null
```
Mantık:
1. `direct = reverseIdx.get(name.toLowerCase())` → `englishNames.get(langKey)`.
2. Bulunamazsa: aktif locale Blueprint sarmalayıcısını soy (`"|ITEM| Kalıp"` → `^(.+?) Kalıp$`),
   taban adı 1. adımla çöz, İngilizce tabanı döndür (lookupTradedCatalogItem Blueprint'i zaten soyar).
3. Hâlâ yoksa `null` (çağıran orijinali kullanır).
- `setGameLocale` değişince ters indeks cache'i geçersiz kıl.
- Collision (iki langKey → aynı lokalize değer): ilk/deterministik tut, `log.warn`.
- `activeLocale === "en"` ise no-op (`null`), davranış birebir aynı.

### 3b. `services/tradeItemName.ts` — tek cerrahi nokta (Katman 3)
```ts
export function lookupTradedCatalogItem(displayName) {
  const { baseName } = parseTradedItemName(displayName);
  if (!baseName) return null;
  const en = localizedToEnglishItemName(baseName) ?? baseName;   // YENİ
  return wfmCatalog.lookupByName(en)
      || wfmCatalog.lookupByName(en.replace(/ Blueprint$/i, ""));
}
```
Bu, hem `gameRef`/`internalName` hem `wfmSlug`'ı doğru set eder; matcher'ın slug-yolu çalışır.
**Lokalize displayName kaydı korunur** (stats'ta kullanıcı Türkçe görür), sadece eşleştirme-anahtarı
İngilizceye çözülür.

### 3c. `services/eeLogMonitor.ts` — çok-dilli diyalog (Katman 1)
Sabitleri locale tanımlayıcı listesine çevir:
```ts
interface TradeDialogLocale {
  id: string; dialogStart: string; success: string;
  offeringMarker: string; receiveDivider: RegExp;  // grup 1 = partner
}
const TRADE_DIALOG_LOCALES = [
  { id:"en", dialogStart:"Are you sure you want to accept this trade?",
    success:"The trade was successful", offeringMarker:"You are offering:",
    receiveDivider:/and will receive from\s+(.+?)\s+the following:/i },
  { id:"tr", dialogStart:"Bu takası onaylamak istiyor musunuz?",
    success:"Takas başarılı bir şekilde gerçekleşti", offeringMarker:"Önerdiğiniz ürün:",
    receiveDivider:/(.+?)\s+isimli oyuncunun size önerdiği ürün:/ },
];
```
Değişecek noktalar:
- Buffer tetik (477): `const startLoc = TRADE_DIALOG_LOCALES.find(l => line.includes(l.dialogStart))`;
  seal kontrolünde `line.indexOf(startLoc.dialogStart)` kullan.
- Başarı tetik (492): `TRADE_DIALOG_LOCALES.some(l => line.includes(l.success))`.
- `_parseTradeDialog`: `offeringMarker`'ı text içinde arayarak locale'i tespit et; o locale'in
  `receiveDivider`'ını kullan (partner artık regex grup 1'den; TR'de blok-bölme mantığı aynı:
  offeringBlock = marker ile divider arası, receivingBlock = divider sonrası).
- `parseItemBlock` — **sıra-bağımsız** adet ayrıştırma (hem `N x Name` hem `Name x N`):
  ```ts
  let m = cleaned.match(/^(\d+)\s+x\s+(.+)$/i);           // sayı-önce (TR)
  if (m) { qty = +m[1]; name = m[2].trim(); }
  else { m = cleaned.match(/^(.+?)\s+x\s+(\d+)$/i);       // isim-önce (EN)
         if (m) { name = m[1].trim(); qty = +m[2]; } else { name = cleaned; qty = 1; } }
  if (name.toLowerCase() === "platinum") { plat += qty; continue; }  // "Platinum" her dilde aynı
  ```
  (Mevcut `^Platinum(?: x N)?$` özel-kılıfı bu genel mantıkla kapsanır.)

### 3d. `services/debugLineFilter.ts` — DBWIN markerları (Katman 2)
`FILTER_SUBSTRINGS_LOWER`'a ekle: `"önerdiğiniz ürün"`, `"takas başarı"`.
> toLowerCase/Türkçe-İ uyarısı: bu markerlar İ/I içermiyor (hepsi küçük harf kaynaklı ö/ü/ş/ı),
> JS `toLowerCase()` ile güvenli. İleride İ içeren marker eklenirse normalize dikkati gerekir.

### 3e. (Opsiyonel) `getGameLocale` zaten var — ekstra ayar gerekmez
`setGameLocale` sistem tarafından çağrılıyor (logda `locale=tr`). Ters indeks bu çağrıya bağlanır.

---

## 4. Test Planı (gerçek verilere karşı)

Kullanıcının 7 gerçek Türkçe satışı fixture olarak kullanılacak (hepsi `sale`):
| Sunulan | Partner | Alınan |
|---|---|---|
| Akjagara Prime Sürgü | Serampore | 10 x Platinum |
| Athodai Prime Namlu | JaKpOu | 9 x Platinum |
| Epitaph Prime Kalıp + Sürgü + Namlu | ClaireAra | 23 x Platinum |
| Akarius Prime Sürgü | Dino2549 | 30 x Platinum |
| Gauss Prime Kalıp + Sistemleri Kalıp + Nöroptikleri Kalıp + Gövde Kalıp | ArtV1 | 45 x Platinum |
| Lavos Prime (4 parça Kalıp) | Necrologe | 18 x Platinum |

- `tests/main/tradeDialogLive.test.ts` genişlet: yukarıdaki ham EE.log satırlarıyla
  `_parseTradeDialog` → doğru `type=sale`, `platChange`, `partner`, item sayısı/yönü.
- YENİ `tests/main/gameLocaleReverse.test.ts`: `localizedToEnglishItemName`
  ("Gauss Prime Sistemleri Kalıp" → "Gauss Prime Systems Blueprint" veya taban;
   "Epitaph Prime Sürgü" → "Epitaph Prime Receiver"; bilinmeyen → null; en → null).
- `tests/main/debugLineFilter.test.ts`: TR markerları `wants()===true`.
- Regresyon: mevcut İngilizce `tradeDialogLive` / `tradeWfmMatcher` / `tradeWorkflow` testleri
  **değişmeden** geçmeli (İngilizce yolu birebir korunur).
- Komut: `pnpm vitest run tests/main/tradeDialogLive tests/main/gameLocaleReverse tests/main/debugLineFilter tests/main/tradeWfmMatcher tests/main/tradeWorkflow`

---

## 5. Regresyon Riskleri

1. **Sıra-bağımsız adet ayrıştırma**: "N x Name" kılıfı, sayıyla başlayan İngilizce ad olsaydı
   çakışırdı — Warframe'de "N x " ile başlayan eşya adı yok. Düşük risk.
2. **`receiveDivider` non-greedy partner yakalama** TR'de doğru satırda eşleşir (`.` newline'ı
   geçmez; bloklar `\n` ile ayrı). 7 örnekte doğrulandı.
3. **Collision / eksik langKey**: ters harita bulamazsa `null` → orijinal ad → eski davranış
   (eşleşmeme), bildirimde "no-match". Veri kaybı/yanlış kapatma YOK.
4. **Riven silah adları**: riven takasları `matchRivenContracts` yolundan gider; silah adları çoğunlukla
   özel ad (çevrilmez). Düşük risk ama ayrı test önerilir (bu PR'da kapsam dışı tutulabilir).
5. **Çoklu dil aynı anda**: locale listesi tüm diller için `includes` tarar; performans ihmal edilebilir.

---

## 6. Yayın / Rollout
- `package.json` sürüm bump (patch, ör. 1.2.0 → 1.2.1).
- Akış repo'daki script'lerle: `version bump → pnpm run dist:win → kurulum → pnpm run release:publish`
  (`scripts/release/publish-release.mjs`). İndirme linki değişmez, auto-update çalışır.
- Push: `tennodesk` remote + `--no-verify` (ŞART).

## 7. Açık Sorular / Kararlar
- [ ] Trade kaydında displayName **Türkçe mi İngilizce mi** saklansın? (Öneri: Türkçe kalsın;
      sadece eşleştirme-anahtarı İngilizceye çözülsün — 3b bunu yapar.)
- [ ] Katman 3'ü `lookupTradedCatalogItem` içinde mi (önerilen, cerrahi) yoksa `eeLogMonitor`
      kaynağında mı yapalım? (Öneri: `lookupTradedCatalogItem` — tek nokta, displayName korunur.)
- [ ] Diğer diller (de/fr/es/ru/zh...) bu PR'da mı yoksa önce TR+EN doğrulanıp sonra mı?
      (Öneri: altyapı tüm diller için jenerik; marker tablosuna TR eklenir, diğerleri gerçek
       EE.log örneği geldikçe eklenir.)

## 8. Ertelenenler (bu PR dışında)
- **Riven "Riven Bulucu" boş sonuç**: ana süreçte 843 silah yükleniyor (`Indexed 843 weapons`),
  sorun renderer tarafında (muhtemelen `onMount` invoke'u boş dönüyor / try-catch yok, ya da
  yazılan metin liste adıyla eşleşmiyor). Kesin teşhis için reprodüksiyon/log gerekir. (Kullanıcı
  şimdilik erteledi.)
