<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ozon Marketplace Ürün Yükleme ve Yapay Zeka Kuralları (Agent Rules)

Bu kurallar bu projede (`urun_yukleme`) çalışan tüm yapay zeka oturumları için geçerlidir ve her zaman uygulanmalıdır:

## 1. Ozon Tekil Değer Zorunluluğu (Strict Single Value Guardrails)
Ozon'da bazı nitelikler şemada `is_collection: true` olsa dahi, Ozon backend API'si birden fazla değer girildiğinde *"Çok fazla değer girdiniz"* veya *"Özniteliğin değeri düzeltildi"* uyarısı/hatası verir.
- **Kesinlikle Tekil Gönderilecek Nitelikler:**
  - `Üretim ülkesi` (`Страна-изготовитель` / ID: `4389`)
  - `Ev aletleri türü` (`Вид бытовой техники`, `Тип прибора` / ID: `12619`)
  - `Tatil / Bayram` (`Праздник` / ID: `8448`)
  - `Kullanım amacı / alanı` (`Назначение`, `Предназначение`, `Область применения` / ID: `10914`, `4878` vb.)
  - `Kimin için / Hedef kitle` (`Для кого` / ID: `8449`, `9390`)
  - `Parça sayısı` (`Количество предметов` / ID: `6949`)
- **Uygulama:** Bu alanlar için `isStrictSingleValueAttribute` kontrolü kullanılmalı; AI araştırmasında ve Ozon JSON payload'ında (`values: [{ dictionary_value_id, value }]`) **kesinlikle yalnızca 1 tekil eleman** gönderilmelidir.

## 2. Ozon Başlık ve Seri Nitelik Standartları
- **ID 22390 (Benzer Ürünlerle Birleşme):**
  - Asla Türkçe karakter içermemeli; canlı kategori ağacından çekilen resmi Rusça tip adı atanmalıdır (`Парогенератор`, `Аэрогриль`, `Салатник`, `Миска`, `Кофемашина` vb.).
  - `sanitizeOzonSeriesName` filtresi uygulanmalıdır (yalnızca 0-9, RU/EN harfler ve `! ? , : ; ( ) - / & "` özel karakterlerine izin verilir).
- **ID 9048 (Model Adı / Kart Birleştirme Kodu):**
  - Standart seri slug formatı kullanılmalıdır: `[marka_kısa_kodu]-[ürün_serisi]-[kategori_kısa_kodu]` (Örn: `ph-5400-kahve`, `wmf-gourmet-kase`).
- **ID 12141 / ID 20776 (Vitrin Model Adı):**
  - Ozon marka adını başlığa otomatik eklediği için, çift marka tekrarını önlemek amacıyla **kesinlikle marka adı eklenmemelidir**.
  - Asla boş bırakılmamalıdır (AI boş döndürse dahi `modelNo` temizlenerek otomatik atanmalıdır).
  - Format: `[Model Numarası] [En Önemli 1-2 Teknik Özellik / Rusça Parametre]` (Örn: `NA350/00 9 л с двумя чашами 2750 Вт`, `Sonicare 5300 HX7113/01 звуковая`).
- **ID 4191 (Kısa Bilgi / Аннотация - Açıklama):**
  - 1. Paragraf zengin Rusça SEO tanıtımı, 2. Bölüm teknik özellikler madde listesi (`• Мощность: ...`) formatında olmalıdır.

## 3. Arayüz ve Akış Mimarisi (UI Architecture)
- **Tekli Yükleme (`/`):**
  - **1. Kart (Sol):** Yalnızca Ozon kategori seçimine odaklanır (6 Departmanda Gruplanmış `PresetCategorySelector` veya Ağaç Arama).
  - **2. Kart (Sağ):** Kategori seçildikten sonra aktifleşen özel model input kutusu (`productModelQuery`) ve Gemini 3.8 Flash derin araştırma butonu yer alır.
- **Toplu Yükleme (`/toplu-yukle`):**
  - Çok satırlı model girişi + 6 departmanlı hazır kategori seçimi + Paralel Google Search destekli Gemini araştırması + Excel tarzı tablo düzenleyici ve tek tıkla Ozon API gönderimi (`/v3/product/import`).
- **Hazır Kategoriler (`PRESET_CATEGORIES`):**
  - 6 ana grupta toplanır: Mutfak & Pişirme, Gıda Hazırlama & Mikserler, Ütü & Buhar, Kişisel Bakım & Güzellik, Sofra & Mutfak Eşyaları (Züccaciye), Temizlik & Ev Bakımı.

## 4. Ozon Canlı Katalog ve Yüklü Ürün Takibi (Live Catalog Tracking)
Mağazada daha önce yüklenmiş olan ürünleri takip etmek, mükerrer yüklemeleri önlemek ve kart birleştirme kodlarını (`seriesMergeCode`, `namingTemplateModel`) canlı mağazayla uyumlu kılmak için Ozon Seller API kullanılır:
- **Kullanılan Resmi Endpoint'ler:**
  1. `POST /v3/product/list`: Mağazadaki tüm ürün kimliklerini (`product_id`, `offer_id`, `sku`) sayfalanmış (`last_id`, `limit: 100`, `filter: { visibility: 'ALL' }`) olarak çeker.
  2. `POST /v3/product/info/list`: 50'şerli `product_id` dizisi göndererek ürün başlıklarını, fiyatlarını, kategorilerini, barkodlarını ve moderasyon/satış durumlarını (`statuses`) çeker.
- **Canlı Takip Scripti:**
  - `scripts/fetch_ozon_products.js`: Mağazadaki tüm ürünleri tek komutla terminalden çeker ve filtreler:
    - Tüm ürünleri listeleme: `node scripts/fetch_ozon_products.js`
    - Model/Offer ID araması: `node scripts/fetch_ozon_products.js --search=NA350`
    - Kategori bazlı filtreleme: `node scripts/fetch_ozon_products.js --category=17039629`
- **Yerel Katalog Hafızası:**
  - `data/catalog_memory.json`: Bu panelden yapılan geçmiş yüklemelerin `seriesMergeCode`, `namingTemplateModel` ve varyant özelliklerini saklar ve yeni yüklemelerde yapay zekaya referans oluşturur.

## 5. Amazon Otonom Keşif ve Fiyatlandırma Kuralları (Amazon Sourcing Engine)
- **Satıcı Filtresi:** Sadece doğrudan Amazon.de (`p_6:A3JWKAKR8XB7XF`) veya Amazon Business (`p_6:A29D61YZMYPL6V`) ürünleri çekilir; 3. taraf pazar yeri satıcıları elenir.
- **Anti-Reklam Kalkanı:** Sponsorlu reklamlar (`AdHolder`, `Gesponsert`) ve yabancı marka kartları elenir.
- **Fiyat Tavan Sınırı:** Amazon alış fiyatı $0 - 550 € arası hedeflenir.
- **Ozon Tam Sayı Fiyat Kuralı (Integer Price):**
  - Ozon API'si kuruşlu/ondalıklı değer kabul etmediğinden ve Amazon alış fiyatı Euro (€) olup Ozon fiyatı USD ($) olarak yüklendiğinden; kur tamponuyla birlikte Amazon alış fiyatının 3 katına ek %15 artış eklenerek tam sayıya yuvarlanır (`Math.round(buyPrice * 3 * 1.15)` yani `3.45x`).
  - Üstü çizili eski liste fiyatı: $\text{Satış} \times 1.20$ tam sayıya yuvarlanır.
- **Görsel Doğrulaması:** Çekilen Amazon yüksek çözünürlüklü `.jpg` linkleri `HTTP 200 OK` kontrolünden geçirilir; açılmayan linkler elenir.

## 6. Ozon Analitik ve Huni Takibi Standartları (Ozon Analytics Engine)
- **API Endpoint:** `POST https://api-seller.ozon.ru/v1/analytics/data`
- **Rate Limit Kalkanı:** Ozon'a giden **her** çağrı `src/app/api/ozon/analytics/route.ts` içindeki `ozonFetch` kapısından geçer; doğrudan `fetch` yazılmaz. Kapının garantileri:
  - İstekler mağaza (Client-Id) bazlı bir şeritte sıraya girer, başlangıçları arasında en az **550ms** bırakılır (~1,8 istek/sn).
  - `/v1/analytics/data` **ağır** uçtur: ölçümde tek çağrı ~4 saniye sürüyor ve üst üste bindirildiğinde Ozon yanıtı 4 → 6 → 8 saniyeye çıkarıp bazen reddediyor. Bu yüzden aynı anda uçuşta en fazla 2 analitik çağrısı bulunur. Ucuz uçlar (`/v3/posting/fbs/list` ~135ms, `/v3/product/info/list`) yalnızca hız sınırına tabidir.
  - `429` / `code: 8` durumunda üstel geri çekilme + jitter ile 3 kez yeniden denenir ve geri çekilme boyunca **tüm şerit** duraklatılır.
  - Sınır aşımı yutulmaz: `fetchRealOrders` eskiden 429 aldığında boş liste dönüp ekrana "sipariş yok" yazdırıyordu; artık hata yukarı taşınır ve route `429` + okunur mesaj döner.
- **Önbellekler:** Analitik yanıtları `store_tarih_limit_mode` anahtarıyla **5 dakika** tutulur (yenile butonu `force_refresh` gönderir). Ürün adı/görseli `Client-Id:sku` anahtarıyla **15 dakika** tutulur; mağazalar arası gidip gelirken aynı SKU'lar tekrar sorulmaz. `/v3/product/info/list` çağrıları 500'lük paketler hâlinde yapılır.
- **İstemci tarafı:** `useAnalytics` her turda önceki isteği `AbortController` ile iptal eder — sıraya alma yüzünden geciken eski yanıtın yeni mağazanın verisini ezmesini engeller.
- **Arka Plan Tazeleme (Sessiz Polling):** `/analitik` kendini iki farklı ritimde günceller, çünkü iki veri farklı maliyet ve tazelikte:
  - **Siparişler 60 saniyede bir** — `mode: 'orders'` hafif ucundan (~195ms ölçüldü). Yalnızca `/v3/posting/fbs/list` çağrılır, ürün bilgisi önbellekten karşılanır, analitik ucuna hiç dokunulmaz. Harita ve sipariş tablosu buradan beslenir.
  - **Analitik 5,5 dakikada bir** — sunucudaki 5 dakikalık önbelleğin üzerinde tutuldu, aksi hâlde yoklama önbelleğe çarpıp aynı sayıyı geri getirirdi.
  - **Sekme arkadayken ikisi de durur** (`visibilitychange`); sekmeye dönüldüğünde beklemeden bir kez tazelenip ritme girilir.
  - **Sessizlik şart:** arka plan turunda `silent` bayrağı iskelet/spinner göstermez ve hata banner'ı açmaz — ekrandaki veri yerinde kalır, yeni veri geldiğinde sessizce değişir. Yalnızca başlıktaki "… itibarıyla" damgası güncellenir. Elle yenile butonu bunun tersidir: iskelet gösterir ve hatayı banner'la bildirir.
- **Standart Günlük Huni Metrikleri (`dimension: ["day"]`):**
  - Gösterim & Oturum: `hits_view`, `hits_view_search`, `hits_view_pdp`, `session_view`, `session_view_search`, `session_view_pdp`
  - Sepet & Dönüşüm: `hits_tocart`, `conv_tocart`, `conv_tocart_search`, `conv_tocart_pdp`
  - Satış & Pozisyon: `ordered_units`, `revenue`, `position_category`
- **SKU Bilgi Zenginleştirme:** `dimension: ["sku"]` çıktısındaki SKU ID'leri, `POST /v3/product/info/list` endpoint'ine 50'şerli paketler halinde gönderilerek ürün adı (`name`), `offer_id` ve liste fiyatı (`price`) ile haritalandırılmalıdır.
- **Çoklu Mağaza Karşılaştırması:** Birden fazla mağaza analiz edilirken gösterim, PDP tıklaması, sepet adedi, sipariş/ciro ve ortalama kategori sıralaması yan yana karşılaştırma tablosunda sunulmalıdır.

## 7. UI Kuralları (shadcn/ui)

Arayüz standardı **shadcn/ui'nin varsayılan görünümüdür** (new-york stili, `neutral` renk paleti, Geist font).
Eski "soft UI / bento" tasarım sistemi (pill butonlar, 28px kartlar, taralı grafikler, kesik köşeler) **terk edildi**;
yeni kodda kullanılmaz. Referans ekranlar: `/dashboard` ve `/muhasebe`.

### Uygulama Kuralları
- **Bileşenler:** `src/components/shadcn/` altındadır (`components.json` → `ui: @/components/shadcn`). Yeni UI önce buradaki bileşenlerle yazılır. Eksik bileşen CLI ile eklenir: `npx shadcn@latest add <bileşen>`. Kendi görsel stilini icat etme, shadcn bileşenlerinin varsayılan class'larını keyfi değiştirme.
  - **CLI hatası:** `add` komutu `cn` importunu `from "cn"` diye yazıyor ve npm'den ilgisiz `cn` paketini kuruyor. Her `add` sonrası: importu `from "@/lib/utils"` yap, `npm uninstall cn` çalıştır.
  - `init` çalıştırılmaz (`globals.css`'i ezebilir). Uygulamada koyu mod yok; `next-themes` kurulmaz, sonner `theme="light"` kullanır.
  - Tooltip için `TooltipProvider` kök layout'ta hazırdır. Calendar `react-day-picker` ile gelir; Türkçe için `import { tr } from "react-day-picker/locale"` → `locale={tr}`.
- **Renkler:** Yalnızca shadcn anlamsal renkleri kullanılır (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-muted`, `border`, `bg-destructive` vb.). Ham hex / `bg-[#...]` yazılmaz.
- **Class birleştirme:** `cn()` (`src/lib/utils.ts`, clsx + tailwind-merge). Varyantlar `class-variance-authority` ile.
- **Radix:** Etkileşimli bileşenler (select, dialog, popover, dropdown, tooltip) `radix-ui` paketi üzerinden kurulur; klavye ve erişilebilirlik davranışı elle yeniden yazılmaz.
- **Grafikler:** Recharts; renkler `--chart-1 … --chart-5`, shadcn grafik örneklerindeki gibi (yatay ince grid, eksen çizgisi yok, sade tooltip).
- **İkonlar:** Yalnızca `lucide-react`.
- **Tailwind v4:** `tailwind.config.ts` yok; tema `src/app/globals.css` içindedir.
  - Başka bir CSS değişkenine referans veren token'lar (`--color-ink: var(--ink)` gibi) **`@theme inline`** içinde tanımlanır. Düz `@theme` bunları kökte sabitler ve `.bg-canvas` altındaki yeniden tanımlar çalışmaz.
  - `rounded-sm/md/lg/xl` shadcn ölçeğindedir (`--radius` = 0.625rem üzerinden, `@theme inline`).
  - Sabit değerler (hex, px) düz `@theme` içinde durur. `:root`'ta Tailwind'in kendi adlarıyla (`--radius-sm`, `--text-*`, `--shadow-*`, `--color-*`) değişken tanımlanmaz; Tailwind utility'lerini ezer.
  - `slate`, `blue` vb. hazır renkler ve `text-*` satır yükseklikleri görünüm değişmesin diye v3 değerlerine sabitlendi. shadcn'e taşınan ekranlar bunlara ihtiyaç duymaz; hepsi taşındığında bu blok kaldırılabilir.
- **Tema:** shadcn değişkenleri `:root`'ta global tanımlıdır; portal edilen içerik (select, dialog, popover) de temayı alır. Font Geist / Geist Mono (`layout.tsx`).
  - **Ekran kökü:** `body` eski ekranlar için hâlâ koyu konsol rengini taşır. shadcn'e taşınan her sayfanın kök öğesi `bg-background text-foreground` almalıdır (örnek: `src/app/dashboard/page.tsx`). Tüm ekranlar taşınınca bu `body`'ye alınır.
  - **`accent` adı shadcn'indir** (açık gri vurgu). Eski soft UI'ın mor-mavi vurgusu `iris` / `iris-soft` adını taşır (`text-iris`, `var(--iris)`); yeni kodda kullanılmaz.
- **Eski bileşenler:** `src/components/ui/*` (Card, StatCard, PillBadge, PillButton, PillInput, HatchedCostBar, Field, Panel) ve koyu konsol teması (`bg-canvas`, `panel`, `hairline`) eskidir. Yeni kodda kullanılmaz; dokunulan ekranlar shadcn'e taşınır.
- **Taşırken:** Yalnızca görünüm değişir; iş mantığı, veri çekme, route'lar ve prop API'leri değiştirilmez.
- **Erişilebilirlik:** Görünür odak halkası, yalnız ikonlu butonlarda `aria-label`, gövde metninde yeterli kontrast.

### Geçiş Yol Haritası
Sırayla uygulanır; tamamlanan adım `[x]` ile işaretlenir.

1. [x] **Küçük ve güvenli adımlar:** `lucide-react` güncellemesi, `cn()` yardımcısının tüm yeni kodda kullanılması, bildirimler için `sonner`.
2. [x] **Tailwind v4 geçişi:** Ayrı bir branch'te (`npx @tailwindcss/upgrade`), `tailwind-merge` v3 ile birlikte. Token'lar `tailwind.config.ts`'ten CSS'teki `@theme` içine taşınır. Tüm sayfalar (özellikle koyu konsol sayfaları) tek tek kontrol edilir.
3. [x] **shadcn kurulumu:** shadcn CLI ile, varsayılan temayla. `.shadcn-theme` kapsamı kaldırılıp tema global yapılır, uygulama fontu Geist olur. Dialog, Popover, DropdownMenu, Select, Tooltip ve Calendar (`react-day-picker` + `date-fns`, `tr` dil desteği) eklenir. Elle yazılmış bileşenler (`src/components/DateRangePicker.tsx`, `src/app/siparisler/_components/Order*Dropdown.tsx`, modaller) o sayfalara dokunulduğunda bunlarla değiştirilir. Muhasebe'deki "Mevcut tasarım" sekmesi ve dashboard kartları da bu adımda shadcn'e taşınır. *(Kurulum, global tema, font, Muhasebe ve dashboard tamam; elle yazılmış bileşenlerin değiştirilmesi sayfalara dokundukça sürer.)*
4. [ ] **TanStack Table:** Siparişler sayfası ele alınırken eklenir (sıralama, filtre, sayfalama); tablo görünümü shadcn `Table` bileşeniyle.
