# Arayüz Tasarım Yönergesi

Bu belge, bir yapay zekâya arayüz tasarımı yaptırırken kurallar dosyası olarak verilir.
Amaç: jenerik "AI çıktısı" görüntüsünden tamamen uzak, sakin, olgun ve profesyonel bir
sonuç almak. Kurallar bağlayıcıdır; "daha etkileyici olsun diye" esnetilmez.

**Kullanım:** Bu dosyayı isteğinle birlikte ekle ve şunu yaz:
*"Aşağıdaki yönergeye harfiyen uy. Yönergedeki 'Yasaklar' bölümünde geçen hiçbir
kalıbı kullanma. Bitirmeden önce 'Teslim Kontrol Listesi'ni tek tek doğrula."*

---

## 1. Tasarım Felsefesi

Beş ilke. Bir karar bunlardan biriyle çelişiyorsa karar yanlıştır.

1. **Sakinlik.** Arayüz dikkat çekmeye çalışmaz; içeriği taşır. Her öğe kendini
   kanıtlamak zorundadır. Şüphedeyken çıkar.
2. **Sessiz hiyerarşi.** Önem farkı boyut, ağırlık ve boşlukla kurulur — renk,
   çerçeve ve gölge ile değil. Renk yalnızca eylem ve durum bildirir.
3. **Az sayıda, ısrarlı karar.** Tek aksan rengi, tek yazı tipi ailesi, iki köşe
   yarıçapı, üç gölge seviyesi. Çeşitlilik değil tutarlılık lüks hissi verir.
4. **Malzeme mantığı.** Yüzeyler kâğıt gibi davranır: hafif dokulu, mat, ışığı
   yumuşak kırar. Cam, neon ve parlaklık yok.
5. **Yumuşaklık ≠ bulanıklık.** Yumuşak his; düşük kontrastlı kenarlar, geniş ve
   düşük opaklıklı gölgeler ve ölçülü hareketle kurulur. `blur` filtresiyle değil.

---

## 2. Yasaklar — Bir Tasarımı Anında Yapay Zekâ Çıktısı Gösteren Kalıplar

Bunların hiçbiri kullanılmayacak.

### Renk ve efekt

- Mor→mavi, pembe→turuncu ve benzeri iki renkli degradeler. Özellikle
  `#667eea → #764ba2` ve türevleri.
- Degrade dolgulu başlık metni (`background-clip: text`).
- Neon parlama, renkli dış gölge (`box-shadow: 0 0 40px <aksan>`), "glow" efekti.
- Her yüzeyde glassmorphism (`backdrop-filter: blur()` + yarı saydam beyaz).
- Aksan rengiyle boyanmış geniş alanlar; hero bölümünün tamamının renkli olması.
- Saf siyah `#000` zemin veya saf beyaz `#fff` kart — hiçbir temada.
- Doygunluğu yüksek "canlı" paletler (`#7C3AED`, `#06B6D4`, `#F43F5E` üçlüsü gibi).

### Düzen ve içerik

- Ortalanmış hero + altında üç eşit kart + her kartın tepesinde renkli daire içinde
  ikon. Bu şablon yasak.
- Emoji ikon kullanımı (🚀 ⚡ ✨ 🎯 💡 🔥). İkon gerekiyorsa çizgi ikon seti.
- Pazarlama klişeleri: "Yıldırım hızında", "Devrim niteliğinde", "Oyunun kurallarını
  değiştiren", "Bir sonraki seviye", "Sadece X değil, aynı zamanda Y".
- Her bölümün ortaya hizalanması. Metin blokları sola hizalanır.
- Boş yer doldurmak için eklenen istatistik şeridi ("10K+ Kullanıcı", "%99.9 Çalışma
  Süresi"); gerçek veri yoksa konmaz.
- Sayfa boyunca tekrar eden aynı kart bileşeni; her bölüm farklı bir düzen ister.

### Uygulama detayı

- Her öğeye uygulanan büyük yarıçap (düğmede `16px+`, kartta `24px`).
- Ağır, tek katmanlı gölge: `0 20px 60px rgba(0,0,0,0.3)`.
- `transform: scale(1.05)` ile büyüyen hover; yukarı zıplayan kart.
- Kaydırdıkça beliren animasyonların her bölüme uygulanması.
- Tarayıcı varsayılanının üstüne az miktarda stil eklenmiş görünüm: mavi bağlantı,
  varsayılan `<button>` ve `<select>` görünümü, `border: 1px solid #ccc` girdi
  kutuları, çıplak `<hr>`, düzenlenmemiş tablo. Bunlar "işlenmemiş HTML" hissi verir
  ve sıfırlanmadan bırakılmaz.
- Bootstrap/Tailwind varsayılan tonlarının ham kullanımı (`gray-500`, `blue-600`).
  Palet projeye özel tanımlanır.

---

## 3. Renk Sistemi

### Yapı

Renkler **semantik jeton** olarak tanımlanır, doğrudan kullanılmaz. Tema değişimi
yalnızca jeton değerlerini değiştirir; hiçbir bileşen kodu değişmez.

| Jeton | İşlev |
|---|---|
| `--bg` | Sayfa zemini |
| `--surface` | Kart, panel |
| `--surface-raised` | Açılır menü, modal, popover |
| `--border` | Ayırıcı çizgi, kenarlık |
| `--text` | Ana metin |
| `--text-muted` | İkincil metin |
| `--text-subtle` | Etiket, üst bilgi, meta |
| `--accent` | Tek eylem rengi |
| `--accent-hover` / `--accent-quiet` | Etkileşim ve düşük vurgulu zemin |
| `--success` / `--warn` / `--danger` | Yalnızca durum bildirimi |

### Kurallar

- **Tek aksan rengi.** İkinci bir marka rengi eklenmez. Aksan, sayfadaki toplam
  alanın %5'inden azını kaplar.
- **Nötrler yansızdır ama ölü değildir.** Gri tonlara aksanla aynı yönde çok hafif
  bir renk sıcaklığı verilir. Tamamen doygunluksuz gri ucuz durur.
- **Kontrast:** ana metin en az 7:1, ikincil metin en az 4.5:1, kenarlık ve ikon
  en az 3:1. Aksan üzerindeki metin en az 4.5:1.
- **Durum renkleri seyreltilir.** Uyarı kutusu, doygun kırmızı zemin değil; ilgili
  rengin çok açık (karanlıkta çok koyu) bir tonu üzerinde okunaklı metin ve 1px
  kenarlık olur.

### Aydınlık tema

- Zemin saf beyaz değil; çok hafif sıcak ya da soğuk kırık beyaz.
- Kartlar zeminden **daha açıktır** ve çok düşük opaklıklı gölge alır.
- Kenarlıklar siyahın opaklığıyla değil, ayrı tanımlı düşük kontrastlı bir renkle.

### Karanlık tema

- Zemin `#0E0F11` – `#16181C` bandında. `#000` kullanılmaz: gölge tutmaz, göz yorar.
- **Aydınlık temanın tersi değildir.** Ayrı ayarlanır: karanlıkta doygunluk %10–20
  azaltılır, aksan bir tık açılır, ana metin `#FFF` değil `#E8E9EC` civarıdır.
- Derinlik gölgeyle değil **yüzey açıklığıyla** kurulur: üstteki katman daha açıktır.
  Karanlıkta gölge yalnızca modal ve açılır menüde, daha koyu ve daha yayvan kullanılır.
- Görseller ve kod blokları için `filter: brightness(.9)` gibi kaba düzeltmeler yok;
  varlıklar temaya uygun hazırlanır.
- `color-scheme` bildirilir. Tema değişiminde renk geçişi animasyonlanmaz — titreşim
  yapar; anlık değişir.

---

## 4. Tipografi

- **Tek aile.** Gövde ve başlık aynı aileden; ayrım ağırlık ve boyutla yapılır.
  İkinci aile yalnızca monospace (kod, sayı tabloları) için.
- Font yönü: bir *grotesk* ya da *humanist sans* (Söhne, Inter Tight, General Sans,
  Geist gibi); ciddiyet isteniyorsa serif gövde. Sistem yığını kabul edilebilir ama
  olduğu gibi bırakılmaz, aşağıdaki ölçekle biçimlendirilir.
- **Ölçek** (1.25 oranı, yalnızca gerekeni kullan):
  `12 / 14 / 16 / 20 / 25 / 31 / 39 / 49 px`
- **Satır yüksekliği:** gövde 1.6, uzun paragraf 1.7; başlıklar 1.15–1.25.
- **Harf aralığı:** 24px üstü başlıklarda `-0.01em` … `-0.02em`; 14px altı büyük harf
  etiketlerde `+0.06em`. Gövde metinde değiştirilmez.
- **Satır uzunluğu:** 60–75 karakter (`max-width: 65ch`). Tam genişlik metin yok.
- **Ağırlık:** gövde 400, vurgu 500, başlık 600. 700+ yalnızca çok küçük etiketlerde.
  Ağırlık atlanmaz (400'den doğrudan 700'e sıçramak yerine 500 kullanılır).
- Başlıklar cümle düzeninde yazılır; her kelimenin baş harfi büyük yazılmaz.
- Tablolardaki sayılar `font-variant-numeric: tabular-nums`.

---

## 5. Boşluk ve Düzen

- **4px tabanlı ölçek:** `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`. Ara değer yok.
- Boşluk hiyerarşisi içeriği gruplar: ilişkili öğeler arasındaki boşluk, gruplar
  arasındaki boşluğun **en fazla yarısı** kadardır. Her yerde eşit boşluk hiyerarşiyi
  öldürür.
- Bölüm arası dikey boşluk masaüstünde 96–128px, mobilde 56–72px. Cömert olun;
  sıkışık düzen amatör görünür.
- **Izgara:** 12 sütun, sabit maksimum genişlik 1120–1280px. Her bölüm 12 sütunu aynı
  biçimde bölmez; asimetri (7/5, 8/4) ritim yaratır.
- Hizalama optik yapılır: ikon + metin ikilisinde ikon görsel merkeze göre 1px
  kaydırılabilir; yuvarlak biçimler kare komşularından hafifçe taşar.
- Mobil: tek sütun, 20–24px kenar boşluğu, dokunma hedefi en az 44×44px.

---

## 6. Yüzey, Doku ve Derinlik

"Yumuşak dokulu" hissin tarifi.

### Doku

Zemine çok düşük yoğunlukta tanecik eklenir — degrade değil. Tek kabul edilen yol:

```css
.grain::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  opacity: var(--grain-opacity);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

Aydınlıkta opaklık `.03`–`.04`, karanlıkta `.05`–`.06`. Tanecik yalnızca sayfa
zemininde ve büyük yüzeylerde; küçük bileşenlerde kullanılmaz.

### Kenar

Her yüzey 1px "hairline" kenarlık taşır. Aydınlıkta kenarlık zeminden biraz koyu,
karanlıkta yüzeyden biraz açıktır. Kartın üst kenarına içeriden
`inset 0 1px 0 rgba(255,255,255,.04)` eklemek karanlık temada fiziksel bir kalınlık
hissi verir.

### Gölge — üç seviye, hepsi çok katmanlı ve düşük opaklıklı

```css
--shadow-1: 0 1px 2px rgba(16,18,22,.05), 0 1px 1px rgba(16,18,22,.03);
--shadow-2: 0 2px 4px rgba(16,18,22,.04), 0 6px 12px rgba(16,18,22,.05);
--shadow-3: 0 8px 16px rgba(16,18,22,.06), 0 20px 40px rgba(16,18,22,.08);
```

Gölge her zaman aşağı doğrudur (y > 0, x = 0), rengi nötr-koyudur, aksan rengi
taşımaz. Seviye 3 yalnızca modal ve açılır menüde. Kartlar varsayılan olarak seviye 1
kullanır ya da hiç gölge almadan yalnızca kenarlıkla ayrılır.

### Yarıçap — iki değer

`6px` (düğme, girdi, etiket) ve `12px` (kart, panel). Modal `16px`. İç içe kutularda
iç yarıçap = dış yarıçap − iç boşluk.

---

## 7. Hareket

- Süre: mikro geçiş 120–160ms, panel/açılır menü 200–260ms. 400ms üstü yok.
- Yumuşatma: giriş `cubic-bezier(.2,.8,.2,1)`, çıkış `cubic-bezier(.4,0,1,1)`.
  `ease-in-out` varsayılanı kullanılmaz.
- Hover'da **boyut değişmez.** İzin verilen: zemin veya kenarlık renginin değişmesi,
  gölgenin bir seviye artması, en fazla 1px yukarı kayma.
- Sayfa yüklenirken sıralı beliren animasyon zinciri yok. En fazla ana içeriğin tek
  seferlik, 150ms'lik yumuşak girişi.
- `@media (prefers-reduced-motion: reduce)` altında tüm süreler `0.01ms`.

---

## 8. Bileşen Kuralları

**Düğme.** Yükseklik 36/40px, yatay iç boşluk 14–16px, ağırlık 500. Üç varyant: dolu
(aksan), yüzey (kenarlıklı), sade (yalnızca metin). Bir ekranda birden fazla dolu
düğme bulunmaz. Devre dışı hali opaklıkla değil, ayrı sönük jetonlarla kurulur.

**Girdi.** Tarayıcı görünümü tamamen sıfırlanır. Yükseklik düğmeyle aynı, 1px
kenarlık; odakta kenarlık aksan tonuna geçer ve 3px'lik yumuşak bir halka eklenir
(`box-shadow: 0 0 0 3px <aksan, %15 opaklık>`). Tarayıcının mavi `outline`'ı hiçbir
zaman kaldırılıp yerine bir şey konmadan bırakılmaz. Yer tutucu metin talimat taşımaz;
etiket her zaman görünür kalır.

**Kart.** Kenarlık + `--surface` + 20–24px iç boşluk. İçinde ikinci bir çerçeve olmaz.
Tıklanabilir kartlarda tüm kart hedeftir; ayrıca "Devamı →" bağlantısı konmaz.

**Tablo.** Dikey çizgi yok; yalnızca satır ayırıcı, o da düşük kontrastlı. Başlık
satırı 12–13px, `--text-subtle`, büyük harf ve `+0.06em` aralık. Sayısal sütunlar sağa
hizalı ve `tabular-nums`. Zebra deseni kullanılmaz.

**Gezinme.** Yükseklik 56–64px, zeminle aynı renk, altında 1px ayırıcı. Kaydırma
sırasında kalınlaşan veya bulanıklaşan bir bar yerine sabit ve sade kalır.

**Boş durum.** İllüstrasyon yerine tek satır açıklama ve tek eylem düğmesi.

---

## 9. İkon ve Görsel

- Tek ikon seti (Lucide, Phosphor vb.), 1.5px çizgi kalınlığı, 20px boyut. İkonlar
  renkli daire içine alınmaz.
- İkon metnin yerini almaz; anlam taşıyan ikonun yanında etiket bulunur.
- Fotoğraf kullanılacaksa stok "gülümseyen ekip" görselleri kullanılmaz. Ürün ekran
  görüntüsü, soyut malzeme dokusu veya hiç görsel kullanmamak tercih edilir.
- Görseller 12px yarıçaplı ve tek katmanlı hafif kenarlıklıdır.

---

## 10. Erişilebilirlik (tartışmasız)

- Klavyeyle tüm akış tamamlanabilir; odak göstergesi her zaman görünür ve tasarlanmış.
- Renk tek başına bilgi taşımaz (hata yalnızca kırmızıyla değil, metinle de bildirilir).
- Anlamlı HTML: `<button>`, `<nav>`, `<main>`, `<label>`. `<div>` üzerine tıklama yok.
- Görsellere `alt`, ikon düğmelere `aria-label`.
- Metin %200 yakınlaştırmada bozulmaz.

---

## 11. Başlangıç Jeton Bloğu

Değerler projeye göre değiştirilir; **yapı** korunur.

```css
:root {
  color-scheme: light;

  --bg:              #FAFAF9;
  --surface:         #FFFFFF;
  --surface-raised:  #FFFFFF;
  --border:          #E6E5E1;
  --border-strong:   #D6D4CF;

  --text:            #1A1A18;
  --text-muted:      #57564F;
  --text-subtle:     #83817A;

  --accent:          #2F5D50;
  --accent-hover:    #26493F;
  --accent-quiet:    #EDF2F0;
  --on-accent:       #FFFFFF;

  --success:         #2F6B3D;
  --warn:            #8A5A1B;
  --danger:          #A03028;

  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 16px;

  --shadow-1: 0 1px 2px rgba(16,18,22,.05), 0 1px 1px rgba(16,18,22,.03);
  --shadow-2: 0 2px 4px rgba(16,18,22,.04), 0 6px 12px rgba(16,18,22,.05);
  --shadow-3: 0 8px 16px rgba(16,18,22,.06), 0 20px 40px rgba(16,18,22,.08);

  --grain-opacity: .035;
}

[data-theme="dark"] {
  color-scheme: dark;

  --bg:              #121316;
  --surface:         #191A1E;
  --surface-raised:  #202227;
  --border:          #2A2C32;
  --border-strong:   #3A3D45;

  --text:            #E9E9EC;
  --text-muted:      #A6A7AE;
  --text-subtle:     #7C7E86;

  /* karanlıkta açılmış ve doygunluğu düşürülmüş aksan */
  --accent:          #6FA895;
  --accent-hover:    #7FBBA7;
  --accent-quiet:    #1B2724;
  --on-accent:       #0F1412;

  --success:         #7BAE86;
  --warn:            #C8A265;
  --danger:          #D98A82;

  --shadow-1: 0 1px 2px rgba(0,0,0,.35);
  --shadow-2: 0 2px 6px rgba(0,0,0,.40), 0 8px 20px rgba(0,0,0,.25);
  --shadow-3: 0 12px 32px rgba(0,0,0,.50), 0 2px 8px rgba(0,0,0,.40);

  --grain-opacity: .055;
}
```

Tema seçimi: sistem tercihi varsayılan, kullanıcının açık seçimi üstün gelir.
Tüm renk değerleri yalnızca `:root` ve `[data-theme="dark"]` bloklarında tanımlanır;
bir rengin tek tanımı bir medya sorgusunun içinde kalmaz.

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* dark bloğundaki jetonların aynısı */
  }
}
```

---

## 12. Teslim Kontrol Listesi

Tasarım teslim edilmeden önce her madde doğrulanır. Bir madde bile karşılanmıyorsa
tasarım düzeltilir.

- [ ] Hiçbir yerde çok renkli degrade, degrade metin veya glow yok.
- [ ] Aksan rengi tek ve toplam alanın %5'inden azını kaplıyor.
- [ ] `#000` ve `#fff` doğrudan zemin ya da kart rengi olarak kullanılmamış.
- [ ] Karanlık tema, aydınlık temanın matematiksel tersi değil; ayrıca ayarlanmış.
- [ ] Her iki temada metin kontrastı ölçüldü ve eşikleri geçiyor.
- [ ] Emoji ikon yok; tek ikon seti kullanılmış.
- [ ] "Ortalanmış hero + üç kart" şablonu kullanılmamış; bölümler farklı düzenlerde.
- [ ] Tüm boşluklar 4px ölçeğinden; grup içi ve gruplar arası boşluk farkı belirgin.
- [ ] En fazla iki köşe yarıçapı ve üç gölge seviyesi kullanılmış.
- [ ] Gölgeler çok katmanlı, opaklıkları %10'un altında ve renksiz.
- [ ] Hover'da hiçbir öğe ölçek değiştirmiyor.
- [ ] Odak göstergesi tasarlanmış ve her etkileşimli öğede görünür.
- [ ] Girdi, düğme, select ve tablo tarayıcı varsayılanından tamamen arındırılmış.
- [ ] Metin satırları 75 karakteri aşmıyor.
- [ ] `prefers-reduced-motion` desteği var.
- [ ] Metinlerde pazarlama klişesi ve doldurma cümlesi yok; her cümle bilgi taşıyor.
- [ ] Uydurma istatistik, sahte logo ve gerçek olmayan referans yok.
