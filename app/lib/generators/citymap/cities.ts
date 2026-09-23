/**
 * Şehir haritası üreticisinin hazır konum listesi.
 *
 * Koordinatlar şehrin "merkez" diye bilinen noktası (meydan, çarşı, iskele);
 * 1 km yakınlıkta harita bu noktanın çevresini gösterdiği için idari sınırın
 * geometrik ortası değil, insanların tanıdığı yer seçildi.
 *
 * İstemci-güvenli: hem yönetim ekranı hem sunucu okur; müşteri penceresine
 * `publicAssets` ile yalnızca kimlik ve adlar gider.
 */

export type CitymapCityGroup = "tr-il" | "tr-ilce" | "world";

export interface CitymapCity {
  /** Kalıcı kimlik — şablon ve sipariş verisine bu yazılır */
  id: string;
  /** Türkçe ad (baskıdaki varsayılan başlık bundan üretilir) */
  name: string;
  /** İngilizce ad; aynıysa boş */
  nameEn?: string;
  /** İlçelerde bağlı olduğu il */
  parent?: string;
  /** ISO ülke kodu */
  country: string;
  lat: number;
  lon: number;
  group: CitymapCityGroup;
}

/** Baskıdaki alt satır ve arama listesi için ülke adları */
export const CITYMAP_COUNTRIES: Record<string, { tr: string; en: string }> = {
  TR: { tr: "Türkiye", en: "Türkiye" },
  GB: { tr: "Birleşik Krallık", en: "United Kingdom" },
  FR: { tr: "Fransa", en: "France" },
  DE: { tr: "Almanya", en: "Germany" },
  NL: { tr: "Hollanda", en: "Netherlands" },
  IT: { tr: "İtalya", en: "Italy" },
  ES: { tr: "İspanya", en: "Spain" },
  PT: { tr: "Portekiz", en: "Portugal" },
  AT: { tr: "Avusturya", en: "Austria" },
  CZ: { tr: "Çekya", en: "Czechia" },
  HU: { tr: "Macaristan", en: "Hungary" },
  GR: { tr: "Yunanistan", en: "Greece" },
  BE: { tr: "Belçika", en: "Belgium" },
  DK: { tr: "Danimarka", en: "Denmark" },
  SE: { tr: "İsveç", en: "Sweden" },
  NO: { tr: "Norveç", en: "Norway" },
  CH: { tr: "İsviçre", en: "Switzerland" },
  IE: { tr: "İrlanda", en: "Ireland" },
  RU: { tr: "Rusya", en: "Russia" },
  UA: { tr: "Ukrayna", en: "Ukraine" },
  AZ: { tr: "Azerbaycan", en: "Azerbaijan" },
  GE: { tr: "Gürcistan", en: "Georgia" },
  BA: { tr: "Bosna-Hersek", en: "Bosnia and Herzegovina" },
  MK: { tr: "Kuzey Makedonya", en: "North Macedonia" },
  CY: { tr: "Kıbrıs", en: "Cyprus" },
  US: { tr: "ABD", en: "USA" },
  CA: { tr: "Kanada", en: "Canada" },
  AE: { tr: "Birleşik Arap Emirlikleri", en: "United Arab Emirates" },
  QA: { tr: "Katar", en: "Qatar" },
  JP: { tr: "Japonya", en: "Japan" },
  KR: { tr: "Güney Kore", en: "South Korea" },
  SG: { tr: "Singapur", en: "Singapore" },
  AU: { tr: "Avustralya", en: "Australia" },
  BR: { tr: "Brezilya", en: "Brazil" },
  AR: { tr: "Arjantin", en: "Argentina" },
  EG: { tr: "Mısır", en: "Egypt" },
  MA: { tr: "Fas", en: "Morocco" },
  SA: { tr: "Suudi Arabistan", en: "Saudi Arabia" },
};

const il = (id: string, name: string, lat: number, lon: number): CitymapCity =>
  ({ id, name, country: "TR", lat, lon, group: "tr-il" });
const ilce = (id: string, name: string, parent: string, lat: number, lon: number): CitymapCity =>
  ({ id, name, parent, country: "TR", lat, lon, group: "tr-ilce" });
const world = (id: string, name: string, nameEn: string, country: string, lat: number, lon: number): CitymapCity =>
  ({ id, name, nameEn: nameEn === name ? undefined : nameEn, country, lat, lon, group: "world" });

export const CITYMAP_CITIES: CitymapCity[] = [
  // ── Türkiye: 81 il merkezi (alfabetik) ─────────────────────────────────
  il("adana", "Adana", 36.9914, 35.3308),
  il("adiyaman", "Adıyaman", 37.7648, 38.2786),
  il("afyonkarahisar", "Afyonkarahisar", 38.7569, 30.5433),
  il("agri", "Ağrı", 39.7191, 43.0503),
  il("aksaray", "Aksaray", 38.3687, 34.0370),
  il("amasya", "Amasya", 40.6499, 35.8353),
  il("ankara", "Ankara", 39.9208, 32.8541),
  il("antalya", "Antalya", 36.8850, 30.7040),
  il("ardahan", "Ardahan", 41.1105, 42.7022),
  il("artvin", "Artvin", 41.1828, 41.8183),
  il("aydin", "Aydın", 37.8450, 27.8396),
  il("balikesir", "Balıkesir", 39.6484, 27.8826),
  il("bartin", "Bartın", 41.6344, 32.3375),
  il("batman", "Batman", 37.8812, 41.1351),
  il("bayburt", "Bayburt", 40.2552, 40.2249),
  il("bilecik", "Bilecik", 40.1426, 29.9793),
  il("bingol", "Bingöl", 38.8847, 40.4939),
  il("bitlis", "Bitlis", 38.4006, 42.1095),
  il("bolu", "Bolu", 40.7355, 31.6069),
  il("burdur", "Burdur", 37.7203, 30.2908),
  il("bursa", "Bursa", 40.1828, 29.0665),
  il("canakkale", "Çanakkale", 40.1467, 26.4086),
  il("cankiri", "Çankırı", 40.6013, 33.6134),
  il("corum", "Çorum", 40.5499, 34.9537),
  il("denizli", "Denizli", 37.7765, 29.0864),
  il("diyarbakir", "Diyarbakır", 37.9144, 40.2306),
  il("duzce", "Düzce", 40.8438, 31.1565),
  il("edirne", "Edirne", 41.6771, 26.5557),
  il("elazig", "Elazığ", 38.6810, 39.2264),
  il("erzincan", "Erzincan", 39.7500, 39.4926),
  il("erzurum", "Erzurum", 39.9055, 41.2658),
  il("eskisehir", "Eskişehir", 39.7767, 30.5206),
  il("gaziantep", "Gaziantep", 37.0662, 37.3833),
  il("giresun", "Giresun", 40.9128, 38.3895),
  il("gumushane", "Gümüşhane", 40.4603, 39.4814),
  il("hakkari", "Hakkari", 37.5744, 43.7408),
  il("hatay", "Hatay", 36.2021, 36.1600),
  il("igdir", "Iğdır", 39.9237, 44.0450),
  il("isparta", "Isparta", 37.7648, 30.5566),
  il("istanbul", "İstanbul", 41.0082, 28.9784),
  il("izmir", "İzmir", 38.4192, 27.1287),
  il("kahramanmaras", "Kahramanmaraş", 37.5753, 36.9228),
  il("karabuk", "Karabük", 41.2061, 32.6204),
  il("karaman", "Karaman", 37.1759, 33.2287),
  il("kars", "Kars", 40.6013, 43.0975),
  il("kastamonu", "Kastamonu", 41.3887, 33.7827),
  il("kayseri", "Kayseri", 38.7205, 35.4826),
  il("kilis", "Kilis", 36.7184, 37.1212),
  il("kirikkale", "Kırıkkale", 39.8468, 33.5153),
  il("kirklareli", "Kırklareli", 41.7351, 27.2252),
  il("kirsehir", "Kırşehir", 39.1458, 34.1606),
  il("kocaeli", "Kocaeli", 40.7654, 29.9408),
  il("konya", "Konya", 37.8746, 32.4932),
  il("kutahya", "Kütahya", 39.4242, 29.9833),
  il("malatya", "Malatya", 38.3552, 38.3095),
  il("manisa", "Manisa", 38.6191, 27.4289),
  il("mardin", "Mardin", 37.3129, 40.7350),
  il("mersin", "Mersin", 36.8121, 34.6415),
  il("mugla", "Muğla", 37.2153, 28.3636),
  il("mus", "Muş", 38.7432, 41.5064),
  il("nevsehir", "Nevşehir", 38.6244, 34.7239),
  il("nigde", "Niğde", 37.9667, 34.6833),
  il("ordu", "Ordu", 40.9862, 37.8797),
  il("osmaniye", "Osmaniye", 37.0742, 36.2478),
  il("rize", "Rize", 41.0201, 40.5234),
  il("sakarya", "Sakarya", 40.7731, 30.3948),
  il("samsun", "Samsun", 41.2867, 36.3300),
  il("siirt", "Siirt", 37.9333, 41.9500),
  il("sinop", "Sinop", 42.0231, 35.1531),
  il("sivas", "Sivas", 39.7477, 37.0179),
  il("sanliurfa", "Şanlıurfa", 37.1591, 38.7969),
  il("sirnak", "Şırnak", 37.5164, 42.4611),
  il("tekirdag", "Tekirdağ", 40.9781, 27.5117),
  il("tokat", "Tokat", 40.3167, 36.5500),
  il("trabzon", "Trabzon", 41.0050, 39.7269),
  il("tunceli", "Tunceli", 39.1079, 39.5401),
  il("usak", "Uşak", 38.6823, 29.4082),
  il("van", "Van", 38.5012, 43.3730),
  il("yalova", "Yalova", 40.6556, 29.2769),
  il("yozgat", "Yozgat", 39.8181, 34.8147),
  il("zonguldak", "Zonguldak", 41.4564, 31.7987),

  // ── Büyükşehirlerin bilinen ilçe merkezleri ve tatil ilçeleri ──────────
  ilce("istanbul-kadikoy", "Kadıköy", "İstanbul", 40.9903, 29.0290),
  ilce("istanbul-besiktas", "Beşiktaş", "İstanbul", 41.0428, 29.0075),
  ilce("istanbul-uskudar", "Üsküdar", "İstanbul", 41.0260, 29.0150),
  ilce("istanbul-beyoglu", "Beyoğlu", "İstanbul", 41.0370, 28.9850),
  ilce("istanbul-sisli", "Şişli", "İstanbul", 41.0602, 28.9877),
  ilce("istanbul-bakirkoy", "Bakırköy", "İstanbul", 40.9800, 28.8720),
  ilce("istanbul-sariyer", "Sarıyer", "İstanbul", 41.1669, 29.0572),
  ilce("istanbul-atasehir", "Ataşehir", "İstanbul", 40.9923, 29.1244),
  ilce("istanbul-maltepe", "Maltepe", "İstanbul", 40.9357, 29.1305),
  ilce("istanbul-kartal", "Kartal", "İstanbul", 40.8886, 29.1856),
  ilce("istanbul-beylikduzu", "Beylikdüzü", "İstanbul", 40.9820, 28.6400),
  ilce("istanbul-esenyurt", "Esenyurt", "İstanbul", 41.0343, 28.6801),
  ilce("ankara-cankaya", "Çankaya", "Ankara", 39.9040, 32.8600),
  ilce("ankara-kecioren", "Keçiören", "Ankara", 39.9800, 32.8650),
  ilce("ankara-yenimahalle", "Yenimahalle", "Ankara", 39.9690, 32.8110),
  ilce("ankara-etimesgut", "Etimesgut", "Ankara", 39.9570, 32.6770),
  ilce("ankara-mamak", "Mamak", "Ankara", 39.9300, 32.9130),
  ilce("ankara-golbasi", "Gölbaşı", "Ankara", 39.7880, 32.8060),
  ilce("izmir-karsiyaka", "Karşıyaka", "İzmir", 38.4595, 27.1150),
  ilce("izmir-bornova", "Bornova", "İzmir", 38.4697, 27.2211),
  ilce("izmir-buca", "Buca", "İzmir", 38.3880, 27.1750),
  ilce("izmir-bayrakli", "Bayraklı", "İzmir", 38.4620, 27.1650),
  ilce("izmir-alsancak", "Alsancak", "İzmir", 38.4370, 27.1430),
  ilce("izmir-cesme", "Çeşme", "İzmir", 38.3236, 26.3031),
  ilce("izmir-urla", "Urla", "İzmir", 38.3228, 26.7647),
  ilce("mugla-bodrum", "Bodrum", "Muğla", 37.0344, 27.4305),
  ilce("mugla-fethiye", "Fethiye", "Muğla", 36.6214, 29.1164),
  ilce("mugla-marmaris", "Marmaris", "Muğla", 36.8550, 28.2740),
  ilce("antalya-alanya", "Alanya", "Antalya", 36.5440, 31.9990),
  ilce("aydin-kusadasi", "Kuşadası", "Aydın", 37.8579, 27.2610),
  ilce("balikesir-ayvalik", "Ayvalık", "Balıkesir", 39.3170, 26.6930),

  // ── Dünyadan büyük şehirler ─────────────────────────────────────────────
  world("london", "Londra", "London", "GB", 51.5074, -0.1278),
  world("paris", "Paris", "Paris", "FR", 48.8566, 2.3522),
  world("berlin", "Berlin", "Berlin", "DE", 52.5200, 13.4050),
  world("hamburg", "Hamburg", "Hamburg", "DE", 53.5511, 9.9937),
  world("munich", "Münih", "Munich", "DE", 48.1372, 11.5756),
  world("cologne", "Köln", "Cologne", "DE", 50.9375, 6.9603),
  world("frankfurt", "Frankfurt", "Frankfurt", "DE", 50.1109, 8.6821),
  world("stuttgart", "Stuttgart", "Stuttgart", "DE", 48.7758, 9.1829),
  world("dusseldorf", "Düsseldorf", "Düsseldorf", "DE", 51.2277, 6.7735),
  world("amsterdam", "Amsterdam", "Amsterdam", "NL", 52.3731, 4.8922),
  world("rotterdam", "Rotterdam", "Rotterdam", "NL", 51.9244, 4.4777),
  world("brussels", "Brüksel", "Brussels", "BE", 50.8467, 4.3525),
  world("vienna", "Viyana", "Vienna", "AT", 48.2082, 16.3738),
  world("zurich", "Zürih", "Zurich", "CH", 47.3769, 8.5417),
  world("rome", "Roma", "Rome", "IT", 41.8986, 12.4769),
  world("venice", "Venedik", "Venice", "IT", 45.4380, 12.3358),
  world("florence", "Floransa", "Florence", "IT", 43.7710, 11.2540),
  world("madrid", "Madrid", "Madrid", "ES", 40.4168, -3.7038),
  world("barcelona", "Barselona", "Barcelona", "ES", 41.3870, 2.1700),
  world("lisbon", "Lizbon", "Lisbon", "PT", 38.7110, -9.1366),
  world("prague", "Prag", "Prague", "CZ", 50.0875, 14.4213),
  world("budapest", "Budapeşte", "Budapest", "HU", 47.4979, 19.0402),
  world("athens", "Atina", "Athens", "GR", 37.9755, 23.7348),
  world("thessaloniki", "Selanik", "Thessaloniki", "GR", 40.6401, 22.9444),
  world("copenhagen", "Kopenhag", "Copenhagen", "DK", 55.6761, 12.5683),
  world("stockholm", "Stockholm", "Stockholm", "SE", 59.3293, 18.0686),
  world("oslo", "Oslo", "Oslo", "NO", 59.9127, 10.7461),
  world("dublin", "Dublin", "Dublin", "IE", 53.3498, -6.2603),
  world("moscow", "Moskova", "Moscow", "RU", 55.7539, 37.6208),
  world("kyiv", "Kiev", "Kyiv", "UA", 50.4501, 30.5234),
  world("baku", "Bakü", "Baku", "AZ", 40.3700, 49.8400),
  world("tbilisi", "Tiflis", "Tbilisi", "GE", 41.6938, 44.8015),
  world("sarajevo", "Saraybosna", "Sarajevo", "BA", 43.8590, 18.4290),
  world("skopje", "Üsküp", "Skopje", "MK", 41.9965, 21.4314),
  world("nicosia", "Lefkoşa", "Nicosia", "CY", 35.1753, 33.3642),
  world("kyrenia", "Girne", "Kyrenia", "CY", 35.3400, 33.3190),
  world("new-york", "New York", "New York", "US", 40.7580, -73.9855),
  world("los-angeles", "Los Angeles", "Los Angeles", "US", 34.0522, -118.2437),
  world("san-francisco", "San Francisco", "San Francisco", "US", 37.7749, -122.4194),
  world("chicago", "Chicago", "Chicago", "US", 41.8781, -87.6298),
  world("toronto", "Toronto", "Toronto", "CA", 43.6532, -79.3832),
  world("dubai", "Dubai", "Dubai", "AE", 25.1972, 55.2744),
  world("doha", "Doha", "Doha", "QA", 25.2854, 51.5310),
  world("tokyo", "Tokyo", "Tokyo", "JP", 35.6812, 139.7671),
  world("seoul", "Seul", "Seoul", "KR", 37.5665, 126.9780),
  world("singapore", "Singapur", "Singapore", "SG", 1.2903, 103.8520),
  world("sydney", "Sidney", "Sydney", "AU", -33.8688, 151.2093),
  world("rio", "Rio de Janeiro", "Rio de Janeiro", "BR", -22.9068, -43.1729),
  world("buenos-aires", "Buenos Aires", "Buenos Aires", "AR", -34.6037, -58.3816),
  world("cairo", "Kahire", "Cairo", "EG", 30.0444, 31.2357),
  world("marrakech", "Marakeş", "Marrakech", "MA", 31.6295, -7.9811),
  world("mecca", "Mekke", "Mecca", "SA", 21.4225, 39.8262),
  world("medina", "Medine", "Medina", "SA", 24.4672, 39.6111),
];

const BY_ID = new Map(CITYMAP_CITIES.map((c) => [c.id, c]));

export function findCitymapCity(id: unknown): CitymapCity | undefined {
  return typeof id === "string" ? BY_ID.get(id) : undefined;
}

/** Listede görünen ad: ilçelerde "Kadıköy, İstanbul", dünyada ülkeyle */
export function citymapCityLabel(c: CitymapCity, lang: "tr" | "en" = "tr"): string {
  const name = lang === "en" ? c.nameEn ?? c.name : c.name;
  if (c.parent) return `${name}, ${c.parent}`;
  if (c.group === "world") return `${name}, ${CITYMAP_COUNTRIES[c.country]?.[lang] ?? c.country}`;
  return name;
}
