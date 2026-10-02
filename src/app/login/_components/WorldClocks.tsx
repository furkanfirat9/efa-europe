'use client';

import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { CITIES, type CityWeather } from '@/lib/weather/cities';

/** MET Norway sembol kodunu ikona çevirir (ör. "lightrainshowers_day"). */
function weatherIcon(symbol: string): LucideIcon {
  const night = symbol.endsWith('_night') || symbol.endsWith('_polartwilight');
  if (symbol.includes('thunder')) return CloudLightning;
  if (symbol.includes('snow') || symbol.includes('sleet')) return CloudSnow;
  if (symbol.startsWith('light') && symbol.includes('rain')) return CloudDrizzle;
  if (symbol.includes('rain')) return CloudRain;
  if (symbol.startsWith('fog')) return CloudFog;
  if (symbol.startsWith('cloudy')) return Cloud;
  if (symbol.startsWith('fair') || symbol.startsWith('partlycloudy')) return night ? CloudMoon : CloudSun;
  return night ? Moon : Sun;
}

const formatters = new Map(
  CITIES.map((c) => [c.id, new Intl.DateTimeFormat('tr-TR', { timeZone: c.timeZone, hour: '2-digit', minute: '2-digit' })])
);

export function WorldClocks() {
  // Saat yalnızca tarayıcıda hesaplanır; sunucuda üretilen saat ekrandakiyle çakışmasın.
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<Record<string, CityWeather>>({});

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch('/api/hava-durumu')
      .then((res) => res.json())
      .then((data) => data?.weather && setWeather(data.weather))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-x-6 gap-y-5">
        {CITIES.map((city) => {
          const w = weather[city.id];
          const Icon = w ? weatherIcon(w.symbol) : null;
          return (
            <div key={city.id} className="flex flex-col gap-0.5">
              <span className="text-xs text-primary-foreground/60">{city.name}</span>
              <span className="text-lg font-medium tabular-nums">{now ? formatters.get(city.id)!.format(now) : '--:--'}</span>
              <span className="flex h-4 items-center gap-1 text-xs text-primary-foreground/70">
                {w && Icon && (
                  <>
                    <Icon className="size-3.5" aria-hidden="true" />
                    <span className="tabular-nums">{Math.round(w.temperature)}°</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <a
        href="https://www.met.no/en"
        target="_blank"
        rel="noreferrer"
        className="text-[11px] text-primary-foreground/40 hover:text-primary-foreground/70"
      >
        Weather data: MET Norway
      </a>
    </div>
  );
}
