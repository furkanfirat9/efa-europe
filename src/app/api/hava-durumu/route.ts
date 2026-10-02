import { NextResponse } from 'next/server';
import { CITIES, type CityWeather } from '@/lib/weather/cities';

/**
 * GET → giriş sayfasındaki şehirlerin anlık hava durumu (MET Norway, ücretsiz, anahtarsız).
 *
 * Giriş sayfası herkese açık olduğu için bu uç da girişsizdir; yalnızca hava durumu döner.
 * Yanıt 30 dakika bellekte tutulur, böylece sayfa her açıldığında MET'e gidilmez.
 * MET kullanım şartları: uygulamayı tanıtan bir User-Agent ve sayfada kaynak notu.
 * https://api.met.no/doc/TermsOfService
 */

const CACHE_MS = 30 * 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;
const USER_AGENT = 'efa-europe-panel/1.0 github.com/furkanfirat9/efa-europe';

let cache: { at: number; data: Record<string, CityWeather> } | null = null;

async function fetchCity(lat: number, lon: number): Promise<CityWeather | null> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, cache: 'no-store' });
  if (!res.ok) return null;

  const json = await res.json();
  const now = json?.properties?.timeseries?.[0]?.data;
  const temperature = now?.instant?.details?.air_temperature;
  const symbol = now?.next_1_hours?.summary?.symbol_code ?? now?.next_6_hours?.summary?.symbol_code;
  if (typeof temperature !== 'number' || typeof symbol !== 'string') return null;
  return { temperature, symbol };
}

export async function GET() {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const results = await Promise.allSettled(CITIES.map((c) => fetchCity(c.lat, c.lon)));
    // Gelmeyen şehir için önceki değer korunur.
    const data: Record<string, CityWeather> = { ...cache?.data };
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) data[CITIES[i].id] = r.value;
    });
    // Hiçbir şehir gelmediyse önbelleğe yazılmaz; bir sonraki istek yeniden dener.
    // Eksik şehir varsa 2 dakika sonra yeniden sorulur.
    const count = Object.keys(data).length;
    const at = count === CITIES.length ? Date.now() : Date.now() - CACHE_MS + RETRY_MS;
    if (count) cache = { at, data };
    else if (!cache) return NextResponse.json({ success: false, weather: {} }, { status: 502 });
  }
  return NextResponse.json({ success: true, weather: cache!.data });
}
