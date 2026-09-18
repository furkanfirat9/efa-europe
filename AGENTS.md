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

## 7. UI Tasarım Sistemi Kuralları (UI Design System Rules)

These rules define the visual language of this project. They apply to **every** UI change:
new pages, new components, and edits to existing ones. When touching an existing screen,
bring it in line with these rules. Never invent a different visual style.

Stack: Next.js (App Router), TypeScript, Tailwind CSS.

---

### 1. Style Summary

Light-theme, minimal, **soft UI SaaS dashboard** with a **bento grid** layout and a subtle
"AI aesthetic". The feel is: airy, calm, premium, clinical-clean, modern.

Core ideas:
- White cards on a very light lavender-gray background, separated by color, not by shadows or borders.
- Very large corner radii on cards; everything interactive is pill-shaped or circular.
- Almost monochrome. The only strong contrast is **solid black pill buttons**.
- Color is used sparingly: pastel status badges and one soft blue-violet accent.
- Large but light-weight headings. Small, soft-gray secondary text.
- Signature details: **inverted cutout corners**, **hatched stripe charts**, **stacked cards**, **AI gradient orb**.

---

### 2. Design Tokens

Define tokens once (CSS variables in `app/globals.css`, exposed to Tailwind via `@theme`
for Tailwind v4, or `tailwind.config.ts` `theme.extend` for v3 — check which version the
project uses). **Components must use tokens, never raw hex values.**

#### Colors

| Token | Value | Usage |
|---|---|---|
| `--bg-page` | `#F3F3F8` | App background (may use gradient below) |
| `--bg-page-gradient` | `linear-gradient(180deg, #F7F7FB 0%, #ECECF6 100%)` | Main app canvas |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-muted` | `#F6F6FA` | Table headers, inner panels, hover rows, inputs |
| `--surface-accent` | `#EEEEFC` | Selected/highlighted rows, active timeline items |
| `--border-subtle` | `#ECECF3` | Only when separation is truly needed (1px) |
| `--text-primary` | `#111114` | Headings, key values |
| `--text-secondary` | `#6B6B78` | Body text, labels |
| `--text-muted` | `#A0A0AC` | Captions, meta, axis labels, placeholders |
| `--accent` | `#6C72E6` | Charts, links, focus rings, indicator dots |
| `--accent-soft` | `#D9DBFA` | Chart fills, soft accent backgrounds |
| `--ink` | `#0E0E10` | Primary buttons, active nav pill |
| `--ink-foreground` | `#FFFFFF` | Text on ink |

Status badge pairs (background / text):

| Status | Background | Text |
|---|---|---|
| success / normal | `#E5F6EC` | `#2E8B57` |
| danger / critical | `#FDE7E7` | `#D14343` |
| info / review | `#ECEBFD` | `#5856D6` |
| warning | `#FDF0E2` | `#C47A2C` |
| pink / progress | `#FCE7F2` | `#C2408A` |
| neutral | `#F1F1F5` | `#6B6B78` |

#### Typography

- Font: **Plus Jakarta Sans** via `next/font/google` (fallback: `ui-sans-serif, system-ui, sans-serif`).
  Alternatives with the same feel if the project already uses one: Satoshi, General Sans, Manrope.
- Headings are **light/regular weight (400–500), never bold (600+)**, with slight negative tracking.
- Numbers in stats use tabular figures (`tabular-nums`).

| Role | Size / line-height | Weight | Color |
|---|---|---|---|
| Page title | 32–36px / 1.15, `tracking-tight` | 400 | primary |
| Card title | 20–22px / 1.3, `tracking-tight` | 400–500 | primary |
| Stat value | 28–32px / 1.1 | 500 | primary |
| Body | 14px / 1.5 | 400 | secondary |
| Label / table cell | 13px / 1.4 | 500 | primary or secondary |
| Caption / meta | 12px / 1.4 | 400 | muted |
| Badge / tiny | 11px / 1.2 | 500 | status color |

#### Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-card` | `28px` | Top-level cards / bento tiles |
| `--radius-inner` | `20px` | Cards nested inside cards, popovers, stacked patient cards |
| `--radius-sm` | `12px` | Table header rows, small panels |
| `full` | `9999px` | Buttons, inputs, badges, nav items, tabs, avatars, icon buttons |

#### Shadows

Default is **no shadow**. Allowed:
- `--shadow-hairline`: `0 1px 2px rgba(20, 20, 40, 0.03)` — optional on cards.
- `--shadow-float`: `0 16px 40px -16px rgba(40, 40, 100, 0.18)` — only for floating elements
  (popovers, tooltips, dropdowns, "snapshot" overlays on charts, stacked card tops).

Never use dark, tight, or colored drop shadows.

#### Spacing & Layout

- App canvas padding: 24–32px. Bento grid gap: 12–16px.
- Card padding: 20–24px. Space between card title and subtitle: 2–4px.
- Page header: large greeting/title + muted subtitle on the left, actions (pills) on the right.

---

### 3. Layout Rules

- Pages use a **bento grid**: CSS grid with cards of different spans (e.g. 12-col grid;
  tiles spanning 3, 4, 5, 6, 7 cols). Avoid uniform equal-size card rows unless content demands it.
- Every card has: title (card-title style) + one-line muted subtitle under it, then content.
- Top navigation: logo left, nav items as text links, **active item is a black pill**.
  Search as a pill-shaped input with a circular icon button. User avatar + name + muted role on the right.
- Generous whitespace; do not fill every area. Prefer fewer, larger elements.

---

### 4. Component Rules

Build these as reusable components (e.g. `components/ui/*`) and reuse them everywhere.
Use `cn()` (clsx + tailwind-merge) for class composition. Variants via `cva` if already in the project.

**Card**
- `bg-surface rounded-[28px] p-5 md:p-6`, no border, no/hairline shadow.
- Optional `cutout` prop for the inverted corner action button (see §5).

**Button**
- `primary`: ink background, white text, pill, height 40–44px, px-5, 14px/500.
  May contain a leading **white circle with a dark ↗ arrow icon** inside the pill.
- `secondary`: white or `surface-muted` background, primary text, pill.
- `ghost`: transparent, secondary text, hover `surface-muted`.

**IconButton**
- Circle 36–40px, white background on muted surfaces or `surface-muted` on white surfaces,
  1px `border-subtle` optional. Icon 16–18px, stroke-based (lucide), stroke-width 1.5–1.75.

**Badge / Tag**
- Pill, `px-2.5 py-1`, 11px/500, status color pairs from §2. Optional small leading dot.

**Input / Select / Date picker / Filter**
- Pill-shaped, height 40–44px, white or `surface-muted`, leading icon in a small circle,
  no visible heavy borders. Focus: `ring-2 ring-accent/30`.

**Tabs (e.g. date tabs)**
- Plain text items with small muted count pills; active item has primary text and a
  thin 2px underline in `ink`. Thin `border-subtle` line under the tab row.

**Table**
- Header row: `surface-muted` background, `rounded-[12px]`, 12px muted labels.
- Rows: no vertical borders, generous height (52–56px), round 28–32px avatar + name (13px/500),
  status as Badge, time in secondary, trailing chevron in muted.
- Row hover: `surface-muted`. Fade older/overflow rows with reduced opacity instead of hard cutoffs.

**Stat**
- Muted 12px label above, large 28–32px/500 value below. Stats sit side by side, no dividers.

**Avatar**
- Circular, real photo or initials on `surface-accent`. Stacked avatars overlap with a 2px white ring.

**Timeline / Schedule**
- Left column: time labels as small pills; active time is an accent-soft pill with a dot
  connected by a thin vertical line. Right: rows with avatar, name, muted subtitle, badges on the right.
- Highlighted item: `surface-accent` background with subtle diagonal hatching.

**Icons**
- lucide-react only, outline style, consistent stroke width. No filled or multicolor icons.

---

### 5. Signature Details (must be preserved)

#### 5.1 Inverted cutout corner
Some cards have a rounded **notch cut into the top-right corner**, with a circular
IconButton (↗ `ArrowUpRight`) sitting inside the notch.

Implementation guidance:
- Card is `relative`. Place an absolutely positioned wrapper at `top-0 right-0`
  with the **parent background color** (the canvas color behind the card), padding ~6–8px,
  and `rounded-bl-[24px]`. The IconButton sits inside it.
- Create the two concave (inverse) corners with `::before` (left of the wrapper, at top)
  and `::after` (below the wrapper, at right), each ~24×24px, using
  `radial-gradient(circle at bottom left, transparent 24px, var(--notch-bg) 24.5px)`
  (adjust the circle origin per corner) so the curve blends smoothly into the card edge.
- Alternatively use a CSS `mask` on the card. Either way it must look like a real cutout,
  **not** a button simply placed on top of the card.
- Expose `--notch-bg` so it matches whatever surface the card sits on.
- Build this once as a `CardCutout` / `Card cutout` variant and reuse it.

#### 5.2 Split card with seam CTA
A card may be split into two vertically stacked parts (top: visual, bottom: short muted caption)
with a small gap between, and a **black pill CTA overlapping the seam** (centered, `absolute`, translate-y-1/2).

#### 5.3 Hatched stripe charts
- Charts (line/area/bar) are rendered as **thin diagonal hatched stripes** in `accent` /
  `accent-soft`, not solid fills. Use an SVG `<pattern>` with `patternTransform="rotate(45)"`
  (or `repeating-linear-gradient` for simple fills).
- Data points: small accent dots. Hover indicator: dashed vertical line + floating white
  "snapshot" popover (`radius-inner`, `shadow-float`) with mini stats.
- Axis labels 11–12px muted, no gridlines or only very faint ones. No chart borders.
- If a chart library is used (e.g. Recharts), customize it to match; never ship default chart styling.

#### 5.4 AI gradient orb
AI-related features use a translucent, glowing **blue-violet 3D gradient orb/blob** as
the visual (layered radial gradients + blur, or an SVG/PNG asset), optionally with small
floating pill labels connected by thin lines. Keep it soft and semi-transparent.

#### 5.5 Stacked cards
Collections of items (e.g. a queue) may display as a **deck**: the front card fully visible
(`radius-inner`, `shadow-float`), 1–2 cards peeking behind it, slightly offset upward and
scaled down (e.g. `-translate-y-2 scale-[0.96]`, `-translate-y-4 scale-[0.92]`), lower opacity.

#### 5.6 Progress / complexity dots
Small row of filled `ink` dots and muted `#D9D9E0` dots instead of progress bars for levels/ratings.

---

### 6. Do / Don't

**Do**
- Use tokens and shared UI components.
- Keep headings light-weight and large; keep secondary text small and muted.
- Use pills and circles for every interactive element.
- Use whitespace generously and prefer asymmetric bento layouts.
- Keep colors pastel and limited; black is the only strong accent for actions.

**Don't**
- No bold (600+) headings, no all-caps headings.
- No heavy borders, dark shadows, or card outlines.
- No saturated/bright solid color blocks, no colored buttons (primary buttons are black).
- No square or small-radius (< 12px) interactive elements.
- No default chart library styling, no solid-fill chart areas.
- No emoji as icons, no mixed icon sets.
- Don't introduce dark mode styling unless explicitly requested.

---

### 7. Working With Existing Screens

- When editing any existing page or component, **also align its styling** with these rules
  (tokens, radius, typography, components), unless the task explicitly says not to.
- Restyle only; **do not change business logic, data fetching, routes, or props APIs** while restyling.
- Replace one-off styles with shared components from `components/ui` instead of duplicating classes.
- If a required token or component does not exist yet, create it first, then use it.
- Preserve accessibility: visible focus states, sufficient contrast for body text
  (muted color only for non-essential meta text), `aria-label` on icon-only buttons.

---

### 8. Checklist Before Finishing Any UI Task

- [ ] Only tokens used, no raw hex values in components
- [ ] Cards: white, 28px radius, no border, no/hairline shadow
- [ ] Buttons, inputs, badges, tabs, nav items are pill/circle shaped
- [ ] Primary actions are black pills
- [ ] Headings are light-weight with tight tracking; meta text is small and muted
- [ ] Status colors use the pastel badge pairs
- [ ] Charts use hatched stripes, accent dots, faint/no gridlines
- [ ] Signature details (cutout corner, stacked cards, orb) implemented where relevant, via shared components
- [ ] Layout uses a bento grid with generous spacing
- [ ] Responsive: grid collapses cleanly on smaller screens
