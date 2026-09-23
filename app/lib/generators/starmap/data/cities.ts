/**
 * Yıldız haritasının şehir listesi: Türkiye'nin 81 ili (plaka sırasıyla) ve
 * dünyadan büyük şehirler. Koordinatlar il/şehir merkezidir; gökyüzü için
 * birkaç kilometrelik fark görünmez (1° boylam ≈ 4 dakika yıldız kayması).
 *
 * Saat dilimi IANA adıyla tutulur; yerel saat sunucuda `Intl` ile UTC'ye
 * çevrilir, yaz saati ve geçmişteki dilim değişiklikleri (Türkiye'nin 2016'ya
 * kadar UTC+2/+3 yaz saati uygulaması gibi) böylece doğru hesaplanır.
 *
 * İstemci-güvenli: bağımlılığı yok; müşteri penceresine id + ad gider.
 */

export interface StarmapCity {
  /** Kalıcı kimlik — sipariş verisinde bu geçer, değiştirilmez */
  id: string;
  /** Türkçe ad (basılan ad) */
  name: string;
  /** İngilizce ad; Türkçeyle aynıysa boş */
  nameEn?: string;
  /** Ülke — pencerede ayırt etmek için (Türkiye illerinde boş) */
  country?: string;
  countryEn?: string;
  lat: number;
  lon: number;
  tz: string;
}

const TR = "Europe/Istanbul";

/** Plaka sırasıyla 81 il */
const TURKEY: Array<[string, string, number, number]> = [
  ["adana", "Adana", 37.0, 35.3213],
  ["adiyaman", "Adıyaman", 37.7648, 38.2786],
  ["afyonkarahisar", "Afyonkarahisar", 38.7507, 30.5567],
  ["agri", "Ağrı", 39.7191, 43.0503],
  ["amasya", "Amasya", 40.6499, 35.8353],
  ["ankara", "Ankara", 39.9334, 32.8597],
  ["antalya", "Antalya", 36.8969, 30.7133],
  ["artvin", "Artvin", 41.1828, 41.8183],
  ["aydin", "Aydın", 37.856, 27.8416],
  ["balikesir", "Balıkesir", 39.6484, 27.8826],
  ["bilecik", "Bilecik", 40.1451, 29.9799],
  ["bingol", "Bingöl", 38.8847, 40.4939],
  ["bitlis", "Bitlis", 38.4006, 42.1095],
  ["bolu", "Bolu", 40.735, 31.6061],
  ["burdur", "Burdur", 37.7203, 30.2908],
  ["bursa", "Bursa", 40.1885, 29.061],
  ["canakkale", "Çanakkale", 40.1553, 26.4142],
  ["cankiri", "Çankırı", 40.6013, 33.6134],
  ["corum", "Çorum", 40.5506, 34.9556],
  ["denizli", "Denizli", 37.7765, 29.0864],
  ["diyarbakir", "Diyarbakır", 37.9144, 40.2306],
  ["edirne", "Edirne", 41.6818, 26.5623],
  ["elazig", "Elazığ", 38.681, 39.2264],
  ["erzincan", "Erzincan", 39.75, 39.5],
  ["erzurum", "Erzurum", 39.9, 41.27],
  ["eskisehir", "Eskişehir", 39.7767, 30.5206],
  ["gaziantep", "Gaziantep", 37.0662, 37.3833],
  ["giresun", "Giresun", 40.9128, 38.3895],
  ["gumushane", "Gümüşhane", 40.4386, 39.5086],
  ["hakkari", "Hakkari", 37.5833, 43.7333],
  ["hatay", "Hatay", 36.2021, 36.16],
  ["isparta", "Isparta", 37.7648, 30.5566],
  ["mersin", "Mersin", 36.8, 34.6333],
  ["istanbul", "İstanbul", 41.0082, 28.9784],
  ["izmir", "İzmir", 38.4237, 27.1428],
  ["kars", "Kars", 40.6013, 43.0975],
  ["kastamonu", "Kastamonu", 41.3887, 33.7827],
  ["kayseri", "Kayseri", 38.7312, 35.4787],
  ["kirklareli", "Kırklareli", 41.7333, 27.2167],
  ["kirsehir", "Kırşehir", 39.1425, 34.1709],
  ["kocaeli", "Kocaeli", 40.8533, 29.8815],
  ["konya", "Konya", 37.8667, 32.4833],
  ["kutahya", "Kütahya", 39.4167, 29.9833],
  ["malatya", "Malatya", 38.3552, 38.3095],
  ["manisa", "Manisa", 38.6191, 27.4289],
  ["kahramanmaras", "Kahramanmaraş", 37.5858, 36.9371],
  ["mardin", "Mardin", 37.3212, 40.7245],
  ["mugla", "Muğla", 37.2153, 28.3636],
  ["mus", "Muş", 38.9462, 41.7539],
  ["nevsehir", "Nevşehir", 38.6939, 34.6857],
  ["nigde", "Niğde", 37.9667, 34.6833],
  ["ordu", "Ordu", 40.9839, 37.8764],
  ["rize", "Rize", 41.0201, 40.5234],
  ["sakarya", "Sakarya", 40.7569, 30.3781],
  ["samsun", "Samsun", 41.2928, 36.3313],
  ["siirt", "Siirt", 37.9333, 41.95],
  ["sinop", "Sinop", 42.0231, 35.1531],
  ["sivas", "Sivas", 39.7477, 37.0179],
  ["tekirdag", "Tekirdağ", 40.9833, 27.5167],
  ["tokat", "Tokat", 40.3167, 36.55],
  ["trabzon", "Trabzon", 41.0015, 39.7178],
  ["tunceli", "Tunceli", 39.1079, 39.5401],
  ["sanliurfa", "Şanlıurfa", 37.1591, 38.7969],
  ["usak", "Uşak", 38.6823, 29.4082],
  ["van", "Van", 38.4891, 43.4089],
  ["yozgat", "Yozgat", 39.8181, 34.8147],
  ["zonguldak", "Zonguldak", 41.4564, 31.7987],
  ["aksaray", "Aksaray", 38.3687, 34.037],
  ["bayburt", "Bayburt", 40.2552, 40.2249],
  ["karaman", "Karaman", 37.1759, 33.2287],
  ["kirikkale", "Kırıkkale", 39.8468, 33.5153],
  ["batman", "Batman", 37.8812, 41.1351],
  ["sirnak", "Şırnak", 37.5164, 42.4611],
  ["bartin", "Bartın", 41.6344, 32.3375],
  ["ardahan", "Ardahan", 41.1105, 42.7022],
  ["igdir", "Iğdır", 39.9237, 44.045],
  ["yalova", "Yalova", 40.65, 29.2667],
  ["karabuk", "Karabük", 41.2061, 32.6204],
  ["kilis", "Kilis", 36.7184, 37.1212],
  ["osmaniye", "Osmaniye", 37.0742, 36.2478],
  ["duzce", "Düzce", 40.8438, 31.1565],
];

/** [id, Türkçe ad, İngilizce ad, ülke, ülke (en), enlem, boylam, saat dilimi] */
const WORLD: Array<[string, string, string, string, string, number, number, string]> = [
  // Avrupa
  ["london", "Londra", "London", "Birleşik Krallık", "United Kingdom", 51.5074, -0.1278, "Europe/London"],
  ["manchester", "Manchester", "Manchester", "Birleşik Krallık", "United Kingdom", 53.4808, -2.2426, "Europe/London"],
  ["dublin", "Dublin", "Dublin", "İrlanda", "Ireland", 53.3498, -6.2603, "Europe/Dublin"],
  ["paris", "Paris", "Paris", "Fransa", "France", 48.8566, 2.3522, "Europe/Paris"],
  ["lyon", "Lyon", "Lyon", "Fransa", "France", 45.764, 4.8357, "Europe/Paris"],
  ["berlin", "Berlin", "Berlin", "Almanya", "Germany", 52.52, 13.405, "Europe/Berlin"],
  ["hamburg", "Hamburg", "Hamburg", "Almanya", "Germany", 53.5511, 9.9937, "Europe/Berlin"],
  ["munich", "Münih", "Munich", "Almanya", "Germany", 48.1351, 11.582, "Europe/Berlin"],
  ["cologne", "Köln", "Cologne", "Almanya", "Germany", 50.9375, 6.9603, "Europe/Berlin"],
  ["frankfurt", "Frankfurt", "Frankfurt", "Almanya", "Germany", 50.1109, 8.6821, "Europe/Berlin"],
  ["stuttgart", "Stuttgart", "Stuttgart", "Almanya", "Germany", 48.7758, 9.1829, "Europe/Berlin"],
  ["dusseldorf", "Düsseldorf", "Düsseldorf", "Almanya", "Germany", 51.2277, 6.7735, "Europe/Berlin"],
  ["amsterdam", "Amsterdam", "Amsterdam", "Hollanda", "Netherlands", 52.3676, 4.9041, "Europe/Amsterdam"],
  ["rotterdam", "Rotterdam", "Rotterdam", "Hollanda", "Netherlands", 51.9244, 4.4777, "Europe/Amsterdam"],
  ["brussels", "Brüksel", "Brussels", "Belçika", "Belgium", 50.8503, 4.3517, "Europe/Brussels"],
  ["vienna", "Viyana", "Vienna", "Avusturya", "Austria", 48.2082, 16.3738, "Europe/Vienna"],
  ["zurich", "Zürih", "Zurich", "İsviçre", "Switzerland", 47.3769, 8.5417, "Europe/Zurich"],
  ["rome", "Roma", "Rome", "İtalya", "Italy", 41.9028, 12.4964, "Europe/Rome"],
  ["milan", "Milano", "Milan", "İtalya", "Italy", 45.4642, 9.19, "Europe/Rome"],
  ["madrid", "Madrid", "Madrid", "İspanya", "Spain", 40.4168, -3.7038, "Europe/Madrid"],
  ["barcelona", "Barselona", "Barcelona", "İspanya", "Spain", 41.3874, 2.1686, "Europe/Madrid"],
  ["lisbon", "Lizbon", "Lisbon", "Portekiz", "Portugal", 38.7223, -9.1393, "Europe/Lisbon"],
  ["athens", "Atina", "Athens", "Yunanistan", "Greece", 37.9838, 23.7275, "Europe/Athens"],
  ["stockholm", "Stockholm", "Stockholm", "İsveç", "Sweden", 59.3293, 18.0686, "Europe/Stockholm"],
  ["oslo", "Oslo", "Oslo", "Norveç", "Norway", 59.9139, 10.7522, "Europe/Oslo"],
  ["copenhagen", "Kopenhag", "Copenhagen", "Danimarka", "Denmark", 55.6761, 12.5683, "Europe/Copenhagen"],
  ["helsinki", "Helsinki", "Helsinki", "Finlandiya", "Finland", 60.1699, 24.9384, "Europe/Helsinki"],
  ["warsaw", "Varşova", "Warsaw", "Polonya", "Poland", 52.2297, 21.0122, "Europe/Warsaw"],
  ["prague", "Prag", "Prague", "Çekya", "Czechia", 50.0755, 14.4378, "Europe/Prague"],
  ["budapest", "Budapeşte", "Budapest", "Macaristan", "Hungary", 47.4979, 19.0402, "Europe/Budapest"],
  ["bucharest", "Bükreş", "Bucharest", "Romanya", "Romania", 44.4268, 26.1025, "Europe/Bucharest"],
  ["sofia", "Sofya", "Sofia", "Bulgaristan", "Bulgaria", 42.6977, 23.3219, "Europe/Sofia"],
  ["belgrade", "Belgrad", "Belgrade", "Sırbistan", "Serbia", 44.7866, 20.4489, "Europe/Belgrade"],
  ["sarajevo", "Saraybosna", "Sarajevo", "Bosna-Hersek", "Bosnia and Herzegovina", 43.8563, 18.4131, "Europe/Sarajevo"],
  ["skopje", "Üsküp", "Skopje", "Kuzey Makedonya", "North Macedonia", 41.9981, 21.4254, "Europe/Skopje"],
  ["nicosia", "Lefkoşa", "Nicosia", "Kıbrıs", "Cyprus", 35.1856, 33.3823, "Asia/Nicosia"],
  ["kyiv", "Kiev", "Kyiv", "Ukrayna", "Ukraine", 50.4501, 30.5234, "Europe/Kiev"],
  ["moscow", "Moskova", "Moscow", "Rusya", "Russia", 55.7558, 37.6173, "Europe/Moscow"],
  ["baku", "Bakü", "Baku", "Azerbaycan", "Azerbaijan", 40.4093, 49.8671, "Asia/Baku"],
  ["tbilisi", "Tiflis", "Tbilisi", "Gürcistan", "Georgia", 41.7151, 44.8271, "Asia/Tbilisi"],
  // Kuzey Amerika
  ["new-york", "New York", "New York", "ABD", "USA", 40.7128, -74.006, "America/New_York"],
  ["washington", "Washington", "Washington", "ABD", "USA", 38.9072, -77.0369, "America/New_York"],
  ["boston", "Boston", "Boston", "ABD", "USA", 42.3601, -71.0589, "America/New_York"],
  ["miami", "Miami", "Miami", "ABD", "USA", 25.7617, -80.1918, "America/New_York"],
  ["chicago", "Chicago", "Chicago", "ABD", "USA", 41.8781, -87.6298, "America/Chicago"],
  ["houston", "Houston", "Houston", "ABD", "USA", 29.7604, -95.3698, "America/Chicago"],
  ["los-angeles", "Los Angeles", "Los Angeles", "ABD", "USA", 34.0522, -118.2437, "America/Los_Angeles"],
  ["san-francisco", "San Francisco", "San Francisco", "ABD", "USA", 37.7749, -122.4194, "America/Los_Angeles"],
  ["las-vegas", "Las Vegas", "Las Vegas", "ABD", "USA", 36.1699, -115.1398, "America/Los_Angeles"],
  ["seattle", "Seattle", "Seattle", "ABD", "USA", 47.6062, -122.3321, "America/Los_Angeles"],
  ["toronto", "Toronto", "Toronto", "Kanada", "Canada", 43.6532, -79.3832, "America/Toronto"],
  ["montreal", "Montreal", "Montreal", "Kanada", "Canada", 45.5019, -73.5674, "America/Toronto"],
  ["vancouver", "Vancouver", "Vancouver", "Kanada", "Canada", 49.2827, -123.1207, "America/Vancouver"],
  // Körfez ve Orta Doğu
  ["dubai", "Dubai", "Dubai", "BAE", "UAE", 25.2048, 55.2708, "Asia/Dubai"],
  ["abu-dhabi", "Abu Dabi", "Abu Dhabi", "BAE", "UAE", 24.4539, 54.3773, "Asia/Dubai"],
  ["doha", "Doha", "Doha", "Katar", "Qatar", 25.2854, 51.531, "Asia/Qatar"],
  ["riyadh", "Riyad", "Riyadh", "Suudi Arabistan", "Saudi Arabia", 24.7136, 46.6753, "Asia/Riyadh"],
  ["jeddah", "Cidde", "Jeddah", "Suudi Arabistan", "Saudi Arabia", 21.4858, 39.1925, "Asia/Riyadh"],
  ["mecca", "Mekke", "Mecca", "Suudi Arabistan", "Saudi Arabia", 21.3891, 39.8579, "Asia/Riyadh"],
  ["medina", "Medine", "Medina", "Suudi Arabistan", "Saudi Arabia", 24.5247, 39.5692, "Asia/Riyadh"],
  ["kuwait", "Kuveyt", "Kuwait City", "Kuveyt", "Kuwait", 29.3759, 47.9774, "Asia/Kuwait"],
  ["manama", "Manama", "Manama", "Bahreyn", "Bahrain", 26.2285, 50.586, "Asia/Bahrain"],
  ["muscat", "Maskat", "Muscat", "Umman", "Oman", 23.588, 58.3829, "Asia/Muscat"],
  ["tehran", "Tahran", "Tehran", "İran", "Iran", 35.6892, 51.389, "Asia/Tehran"],
  ["cairo", "Kahire", "Cairo", "Mısır", "Egypt", 30.0444, 31.2357, "Africa/Cairo"],
  // Asya
  ["tashkent", "Taşkent", "Tashkent", "Özbekistan", "Uzbekistan", 41.2995, 69.2401, "Asia/Tashkent"],
  ["almaty", "Almatı", "Almaty", "Kazakistan", "Kazakhstan", 43.2389, 76.8897, "Asia/Almaty"],
  ["bishkek", "Bişkek", "Bishkek", "Kırgızistan", "Kyrgyzstan", 42.8746, 74.5698, "Asia/Bishkek"],
  ["ashgabat", "Aşkabat", "Ashgabat", "Türkmenistan", "Turkmenistan", 37.9601, 58.3261, "Asia/Ashgabat"],
  ["delhi", "Delhi", "Delhi", "Hindistan", "India", 28.6139, 77.209, "Asia/Kolkata"],
  ["mumbai", "Mumbai", "Mumbai", "Hindistan", "India", 19.076, 72.8777, "Asia/Kolkata"],
  ["bangkok", "Bangkok", "Bangkok", "Tayland", "Thailand", 13.7563, 100.5018, "Asia/Bangkok"],
  ["singapore", "Singapur", "Singapore", "Singapur", "Singapore", 1.3521, 103.8198, "Asia/Singapore"],
  ["kuala-lumpur", "Kuala Lumpur", "Kuala Lumpur", "Malezya", "Malaysia", 3.139, 101.6869, "Asia/Kuala_Lumpur"],
  ["jakarta", "Cakarta", "Jakarta", "Endonezya", "Indonesia", -6.2088, 106.8456, "Asia/Jakarta"],
  ["hong-kong", "Hong Kong", "Hong Kong", "Çin", "China", 22.3193, 114.1694, "Asia/Hong_Kong"],
  ["beijing", "Pekin", "Beijing", "Çin", "China", 39.9042, 116.4074, "Asia/Shanghai"],
  ["shanghai", "Şanghay", "Shanghai", "Çin", "China", 31.2304, 121.4737, "Asia/Shanghai"],
  ["seoul", "Seul", "Seoul", "Güney Kore", "South Korea", 37.5665, 126.978, "Asia/Seoul"],
  ["tokyo", "Tokyo", "Tokyo", "Japonya", "Japan", 35.6762, 139.6503, "Asia/Tokyo"],
  // Güney yarımküre
  ["sydney", "Sidney", "Sydney", "Avustralya", "Australia", -33.8688, 151.2093, "Australia/Sydney"],
  ["melbourne", "Melbourne", "Melbourne", "Avustralya", "Australia", -37.8136, 144.9631, "Australia/Melbourne"],
  ["sao-paulo", "São Paulo", "São Paulo", "Brezilya", "Brazil", -23.5505, -46.6333, "America/Sao_Paulo"],
  ["buenos-aires", "Buenos Aires", "Buenos Aires", "Arjantin", "Argentina", -34.6037, -58.3816, "America/Argentina/Buenos_Aires"],
  ["cape-town", "Cape Town", "Cape Town", "Güney Afrika", "South Africa", -33.9249, 18.4241, "Africa/Johannesburg"],
];

export const STARMAP_CITIES: StarmapCity[] = [
  ...TURKEY.map(([id, name, lat, lon]) => ({ id, name, lat, lon, tz: TR })),
  ...WORLD.map(([id, name, nameEn, country, countryEn, lat, lon, tz]) => ({
    id, name, nameEn: nameEn !== name ? nameEn : undefined, country, countryEn, lat, lon, tz,
  })),
];

/** Türkiye illerinin sayısı; liste bu sayıdan sonra dünyaya geçer */
export const TURKEY_CITY_COUNT = TURKEY.length;

export function findStarmapCity(id: unknown): StarmapCity | undefined {
  return typeof id === "string" ? STARMAP_CITIES.find((c) => c.id === id) : undefined;
}
