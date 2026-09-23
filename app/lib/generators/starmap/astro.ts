/**
 * Yıldız haritasının gökyüzü hesabı. Saf matematik; bağımlılığı yok.
 *
 * Akış: yerel tarih-saat → (IANA saat dilimiyle) UTC → Julian Date → GMST →
 * yerel yıldız zamanı (LST) → her yıldızın saat açısı → yükseklik/azimut →
 * stereografik izdüşüm (zenit merkezde, kuzey yukarı, doğu solda — sırtüstü
 * yatıp gökyüzüne bakar gibi).
 *
 * Katalog J2000 koordinatında; 1900–2100 arasında presesyon ~1.4°'ye çıktığı
 * için yıldızlar tarihe göre döndürülür (IAU 1976). Nütasyon ve sapınç
 * (<0.01°) çizimde görünmediği için atlanır.
 */

const RAD = Math.PI / 180;

/**
 * Bir saat dilimindeki duvar saatini UTC milisaniyesine çevirir. Önce saati
 * UTC sanıp o andaki dilim farkını bulur, sonra düzeltilmiş anda farkı bir
 * kez daha ölçer: yaz saati geçiş gününde de doğru sonuç verir (ileri
 * alınan saatteki var olmayan dakikalar bir saat sonrasına kayar).
 */
export function zonedTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  });
  const offsetAt = (t: number) => {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(t))) if (part.type !== "literal") p[part.type] = Number(part.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - t;
  };
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

export function julianDate(utcMs: number): number {
  return utcMs / 86400000 + 2440587.5;
}

/** Greenwich ortalama yıldız zamanı, derece (0–360) */
export function gmstDeg(jd: number): number {
  const t = (jd - 2451545) / 36525;
  const g = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * t * t - (t * t * t) / 38710000;
  return ((g % 360) + 360) % 360;
}

/** J2000 → tarih ekinoksu presesyon açıları (radyan) */
function precessionAngles(jd: number) {
  const t = (jd - 2451545) / 36525;
  const as = RAD / 3600;
  return {
    zeta: (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * as,
    z: (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * as,
    theta: (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * as,
  };
}

export interface SkyFrame {
  /** Yerel yıldız zamanı, derece */
  lstDeg: number;
  lat: number;
  prec: ReturnType<typeof precessionAngles>;
}

export function skyFrame(utcMs: number, lat: number, lon: number): SkyFrame {
  const jd = julianDate(utcMs);
  return { lstDeg: gmstDeg(jd) + lon, lat, prec: precessionAngles(jd) };
}

/**
 * J2000 sağ açıklık/dik açıklıktan (derece) yükseklik ve azimuta (derece;
 * azimut kuzeyden doğuya doğru).
 */
export function horizontal(frame: SkyFrame, raDeg: number, decDeg: number): { alt: number; az: number } {
  const { zeta, z, theta } = frame.prec;
  const ra0 = raDeg * RAD;
  const dec0 = decDeg * RAD;
  const a = Math.cos(dec0) * Math.sin(ra0 + zeta);
  const b = Math.cos(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) - Math.sin(theta) * Math.sin(dec0);
  const c = Math.sin(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) + Math.cos(theta) * Math.sin(dec0);
  const ra = Math.atan2(a, b) + z;
  const dec = Math.asin(Math.max(-1, Math.min(1, c)));

  const ha = frame.lstDeg * RAD - ra;
  const phi = frame.lat * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(
    -Math.cos(dec) * Math.sin(ha),
    Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(ha),
  );
  return { alt: alt / RAD, az: ((az / RAD) % 360 + 360) % 360 };
}

/**
 * Stereografik izdüşüm: zenit merkezde, ufuk `radius` yarıçaplı çember.
 * Kuzey yukarı, doğu SOLDA (gökyüzüne bakan birinin gördüğü gibi).
 * Ufkun altındaki noktalar çemberin dışına düşer (çizgileri kırpmak için).
 */
export function project(alt: number, az: number, cx: number, cy: number, radius: number): { x: number; y: number } {
  const zd = (90 - alt) * RAD;
  const r = radius * Math.tan(zd / 2);
  const a = az * RAD;
  return { x: cx - r * Math.sin(a), y: cy - r * Math.cos(a) };
}
