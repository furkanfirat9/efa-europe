'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import styles from './NightSky.module.css';

/**
 * Giriş sayfasının gece gökyüzü, iki katman hâlinde:
 *   - StarField: yıldızlar, haritanın ARKASINDA (opak kara onları örter)
 *   - ShootingStars: yıldız kaymaları, haritanın önünde
 *   - SkyGlow: aurora ve ince bulutlar, haritanın ÖNÜNDE; aurora "screen" karışımıyla
 *     ışık gibi vurur, karayı karartmaz
 * Yıldızlar ölçeklenen bir SVG değil, piksel boyutlu HTML noktalarıdır; böylece her
 * ekran çözünürlüğünde net kalırlar. Bulut dokusu SVG gürültü filtresiyle üretilir.
 * Aurora renkleri tema grafik renklerinden gelir.
 */

const layer = 'pointer-events-none absolute inset-0 overflow-hidden';

// Sol üstte, aurora bölgesinde birkaç yıldız (sağda Rusya'nın karası var). Bir tanesi
// belirgin parlak; diğerleri gerçek gökyüzündeki gibi kademeli olarak daha sönük.
// b: parlaklık (0-1), yanıp sönme bunun %70'i ile tamamı arasında gezinir.
const STARS = [
  { left: '37%', top: '10%', size: 3, b: 1, bright: true, duration: 6.4, delay: -0.9 },
  { left: '19%', top: '13%', size: 2.5, b: 0.62, duration: 5.6, delay: -1.8 },
  { left: '46%', top: '6%', size: 2.5, b: 0.52, duration: 5.1, delay: -4.1 },
  { left: '7%', top: '5%', size: 2, b: 0.45, duration: 4.2, delay: 0 },
  { left: '28%', top: '4%', size: 2, b: 0.4, duration: 3.8, delay: -2.6 },
  { left: '52%', top: '16%', size: 2, b: 0.34, duration: 5.8, delay: -1.2 },
  { left: '12%', top: '21%', size: 2, b: 0.3, duration: 4.9, delay: -3.3 },
  { left: '24%', top: '27%', size: 2, b: 0.26, duration: 4.4, delay: -2.2 },
];

/**
 * Yıldız kayması. Bir yağmurun meteorları gökte tek bir noktadan (radyant) dağılıyormuş
 * gibi görünür; bu yüzden hepsi aynı yönden gelir: panelin dışından, sağ üstten girer,
 * yataydan ~24-32° eğimle sola iner ve beyaz sayfanın kenarında (panelin sol kenarı)
 * onun arkasına girip kaybolur. Arkasında çıtırdayarak sönen kıvılcımlar bırakır.
 * Nadir: ilki 8-16 sn sonra, sonrakiler 25-55 sn arayla.
 * Tuval (canvas) ekranın piksel yoğunluğunda çizilir; her ekranda net kalır.
 */
const METEOR_SPEED = 150; // piksel/saniye
const TAIL = 110; // kuyruk uzunluğu, piksel

type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number };

const random = (min: number, max: number) => min + Math.random() * (max - min);

function useMeteorCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let timer: ReturnType<typeof setTimeout>;
    let frame = 0;

    const fly = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const color = getComputedStyle(canvas).color;

      const angle = (random(24, 32) * Math.PI) / 180;
      const dx = -Math.cos(angle);
      const dy = Math.sin(angle);
      // Panelin dışından başlar: sağ kenarın biraz ötesi, üst kısımda.
      let x = w + 20;
      let y = random(-0.06, 0.08) * h;
      const sparks: Spark[] = [];
      let last = performance.now();

      const step = (now: number) => {
        // Sekme arka plandayken birikmiş zaman tek kareye yığılmasın.
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const flying = x > -TAIL;

        if (flying) {
          x += dx * METEOR_SPEED * dt;
          y += dy * METEOR_SPEED * dt;
          // Başın hemen arkasına kıvılcım bırakır.
          const count = Math.random() < 0.7 ? 1 : 2;
          for (let i = 0; i < count; i++) {
            const back = random(4, 26);
            sparks.push({
              x: x - dx * back + random(-1.5, 1.5),
              y: y - dy * back + random(-1.5, 1.5),
              vx: random(-6, 6),
              vy: random(2, 10),
              age: 0,
              life: random(0.8, 1.8),
              size: random(0.7, 1.5),
            });
          }
        }

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        // Kıvılcımlar: hafifçe süzülür, titreyerek (çıtırtı) söner.
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.age += dt;
          if (s.age >= s.life) {
            sparks.splice(i, 1);
            continue;
          }
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const fade = 1 - s.age / s.life;
          ctx.globalAlpha = fade * (Math.random() < 0.25 ? 0.15 : random(0.45, 0.9));
          ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
        }

        if (flying) {
          // Kuyruk: baştan geriye doğru sönen çizgi.
          const tail = ctx.createLinearGradient(x, y, x - dx * TAIL, y - dy * TAIL);
          tail.addColorStop(0, color);
          tail.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = tail;
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - dx * TAIL, y - dy * TAIL);
          ctx.stroke();

          // Baş: parlak nokta ve ışıması.
          ctx.globalAlpha = 1;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        if (flying || sparks.length) {
          frame = requestAnimationFrame(step);
        } else {
          ctx.clearRect(0, 0, w, h);
          schedule(random(25_000, 55_000));
        }
      };
      frame = requestAnimationFrame(step);
    };

    const schedule = (delay: number) => {
      timer = setTimeout(() => (document.hidden ? schedule(5_000) : fly()), delay);
    };
    schedule(random(8_000, 16_000));

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}

export function StarField() {
  return (
    <div className={layer} aria-hidden="true">
      {STARS.map((s, i) => (
        <span
          key={i}
          className={cn(styles.star, s.bright && styles.starBright)}
          style={
            {
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              '--b': s.b,
              animationDuration: `${s.duration}s`,
              animationDelay: `${s.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Yıldız kaymaları haritanın önünde: yol boyunca görünür kalıp beyaz sayfanın arkasına girer. */
export function ShootingStars() {
  const canvasRef = useMeteorCanvas();
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />;
}

export function SkyGlow() {
  return (
    <div className={layer} aria-hidden="true">
      <div className={`${styles.aurora} ${styles.auroraA}`} />
      <div className={`${styles.aurora} ${styles.auroraB}`} />
      <div className={`${styles.aurora} ${styles.auroraC}`} />

      <svg className={styles.clouds} preserveAspectRatio="none" viewBox="0 0 1000 1000">
        <defs>
          <filter id="night-clouds" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.009" numOctaves={4} seed={7} />
            {/* Gürültünün yalnızca yoğun kısımları bulut olur; renk currentColor'dan gelir. */}
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 1
                      0 0 0 0 1
                      0 0 0 0 1
                      0 0 0 2.6 -1.35"
            />
            <feComposite in="SourceGraphic" operator="in" />
          </filter>
        </defs>
        <rect width="1000" height="1000" fill="currentColor" opacity={0.09} filter="url(#night-clouds)" />
      </svg>
    </div>
  );
}
