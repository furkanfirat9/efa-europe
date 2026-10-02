/** Giriş sayfasındaki dünya saatleri ve hava durumu şehirleri. */
export interface City {
  id: string;
  name: string;
  timeZone: string;
  /** MET Norway en fazla 4 ondalık kabul eder */
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { id: 'istanbul', name: 'İstanbul', timeZone: 'Europe/Istanbul', lat: 41.0082, lon: 28.9784 },
  { id: 'frankfurt', name: 'Frankfurt', timeZone: 'Europe/Berlin', lat: 50.1109, lon: 8.6821 },
  { id: 'londra', name: 'Londra', timeZone: 'Europe/London', lat: 51.5074, lon: -0.1278 },
  { id: 'moskova', name: 'Moskova', timeZone: 'Europe/Moscow', lat: 55.7558, lon: 37.6173 },
  { id: 'washington', name: 'Washington', timeZone: 'America/New_York', lat: 38.9072, lon: -77.0369 },
  { id: 'varsova', name: 'Varşova', timeZone: 'Europe/Warsaw', lat: 52.2297, lon: 21.0122 },
  { id: 'pekin', name: 'Pekin', timeZone: 'Asia/Shanghai', lat: 39.9042, lon: 116.4074 },
];

export interface CityWeather {
  /** Hava sıcaklığı, °C */
  temperature: number;
  /** MET Norway sembol kodu, ör. "partlycloudy_day" */
  symbol: string;
}
