export interface ClipArtItem {
  id: string;
  name: string;
  category: 'cartoon' | 'superhero' | 'shapes';
  svg: string;
}

const toDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const BUNNY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250">
  <ellipse cx="75" cy="65" rx="18" ry="50" fill="#f8e8f0" stroke="#555" stroke-width="2.5"/>
  <ellipse cx="75" cy="70" rx="10" ry="38" fill="#ffafc5"/>
  <ellipse cx="125" cy="65" rx="18" ry="50" fill="#f8e8f0" stroke="#555" stroke-width="2.5"/>
  <ellipse cx="125" cy="70" rx="10" ry="38" fill="#ffafc5"/>
  <circle cx="100" cy="125" r="58" fill="#f8e8f0" stroke="#555" stroke-width="2.5"/>
  <circle cx="82" cy="115" r="16" fill="white" stroke="#555" stroke-width="1.5"/>
  <circle cx="118" cy="115" r="16" fill="white" stroke="#555" stroke-width="1.5"/>
  <circle cx="85" cy="113" r="9" fill="#1a1a2e"/>
  <circle cx="121" cy="113" r="9" fill="#1a1a2e"/>
  <circle cx="88" cy="110" r="3.5" fill="white"/>
  <circle cx="124" cy="110" r="3.5" fill="white"/>
  <ellipse cx="100" cy="132" rx="5" ry="4" fill="#ff8fab"/>
  <path d="M 95 136 Q 100 143 105 136" stroke="#555" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="72" cy="130" r="10" fill="#ffb3c6" opacity="0.5"/>
  <circle cx="128" cy="130" r="10" fill="#ffb3c6" opacity="0.5"/>
  <path d="M 85 168 L 100 175 L 85 183 Z" fill="#ff4d6d"/>
  <path d="M 115 168 L 100 175 L 115 183 Z" fill="#ff4d6d"/>
  <circle cx="100" cy="175" r="5" fill="#c9184a"/>
</svg>`;

const YELLOW_BIRD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">
  <line x1="90" y1="28" x2="85" y2="10" stroke="#FFD700" stroke-width="5" stroke-linecap="round"/>
  <line x1="100" y1="25" x2="100" y2="5" stroke="#FFD700" stroke-width="5" stroke-linecap="round"/>
  <line x1="110" y1="28" x2="115" y2="10" stroke="#FFD700" stroke-width="5" stroke-linecap="round"/>
  <circle cx="100" cy="85" r="58" fill="#FFE135" stroke="#333" stroke-width="2.5"/>
  <circle cx="78" cy="78" r="22" fill="white" stroke="#333" stroke-width="2"/>
  <circle cx="122" cy="78" r="22" fill="white" stroke="#333" stroke-width="2"/>
  <circle cx="82" cy="76" r="12" fill="#1a1a2e"/>
  <circle cx="126" cy="76" r="12" fill="#1a1a2e"/>
  <circle cx="86" cy="72" r="4.5" fill="white"/>
  <circle cx="130" cy="72" r="4.5" fill="white"/>
  <path d="M 88 108 Q 100 120 112 108 L 100 126 Z" fill="#FF8C00" stroke="#333" stroke-width="1.5"/>
  <ellipse cx="100" cy="175" rx="42" ry="38" fill="#FFE135" stroke="#333" stroke-width="2.5"/>
  <ellipse cx="62" cy="170" rx="22" ry="14" fill="#FFC300" stroke="#333" stroke-width="2" transform="rotate(-15 62 170)"/>
  <ellipse cx="138" cy="170" rx="22" ry="14" fill="#FFC300" stroke="#333" stroke-width="2" transform="rotate(15 138 170)"/>
  <line x1="88" y1="208" x2="78" y2="220" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
  <line x1="88" y1="208" x2="92" y2="220" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
  <line x1="112" y1="208" x2="108" y2="220" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
  <line x1="112" y1="208" x2="122" y2="220" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const GRAY_CAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">
  <path d="M 55 68 L 42 25 L 82 58 Z" fill="#888" stroke="#555" stroke-width="2"/>
  <path d="M 58 64 L 50 38 L 75 58 Z" fill="#d4b8b8"/>
  <path d="M 145 68 L 158 25 L 118 58 Z" fill="#888" stroke="#555" stroke-width="2"/>
  <path d="M 142 64 L 150 38 L 125 58 Z" fill="#d4b8b8"/>
  <circle cx="100" cy="110" r="62" fill="#999" stroke="#555" stroke-width="2.5"/>
  <ellipse cx="100" cy="128" rx="40" ry="34" fill="#c8b8b8"/>
  <circle cx="78" cy="100" r="17" fill="#A5D6A7" stroke="#333" stroke-width="1.5"/>
  <ellipse cx="80" cy="100" rx="7" ry="13" fill="#1a1a2e"/>
  <circle cx="83" cy="95" r="3.5" fill="white"/>
  <circle cx="122" cy="100" r="17" fill="#A5D6A7" stroke="#333" stroke-width="1.5"/>
  <ellipse cx="124" cy="100" rx="7" ry="13" fill="#1a1a2e"/>
  <circle cx="127" cy="95" r="3.5" fill="white"/>
  <path d="M 96 120 L 100 115 L 104 120 Z" fill="#ff8fab"/>
  <path d="M 100 122 Q 92 130 88 128" stroke="#555" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M 100 122 Q 108 130 112 128" stroke="#555" stroke-width="2" fill="none" stroke-linecap="round"/>
  <line x1="40" y1="118" x2="88" y2="122" stroke="#555" stroke-width="1.5" opacity="0.7"/>
  <line x1="40" y1="126" x2="88" y2="126" stroke="#555" stroke-width="1.5" opacity="0.7"/>
  <line x1="44" y1="134" x2="88" y2="130" stroke="#555" stroke-width="1.5" opacity="0.7"/>
  <line x1="160" y1="118" x2="112" y2="122" stroke="#555" stroke-width="1.5" opacity="0.7"/>
  <line x1="160" y1="126" x2="112" y2="126" stroke="#555" stroke-width="1.5" opacity="0.7"/>
  <line x1="156" y1="134" x2="112" y2="130" stroke="#555" stroke-width="1.5" opacity="0.7"/>
</svg>`;

const CARTOON_DUCK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">
  <ellipse cx="100" cy="168" rx="58" ry="44" fill="white" stroke="#333" stroke-width="2.5"/>
  <circle cx="100" cy="85" r="52" fill="white" stroke="#333" stroke-width="2.5"/>
  <circle cx="80" cy="80" r="15" fill="white" stroke="#333" stroke-width="1.5"/>
  <circle cx="120" cy="80" r="15" fill="white" stroke="#333" stroke-width="1.5"/>
  <circle cx="83" cy="78" r="8" fill="#1a1a2e"/>
  <circle cx="123" cy="78" r="8" fill="#1a1a2e"/>
  <circle cx="86" cy="75" r="3" fill="white"/>
  <circle cx="126" cy="75" r="3" fill="white"/>
  <path d="M 82 102 Q 100 112 118 102 L 118 114 Q 100 124 82 114 Z" fill="#FF8C00" stroke="#FF6500" stroke-width="1.5"/>
  <ellipse cx="62" cy="155" rx="22" ry="14" fill="white" stroke="#333" stroke-width="2" transform="rotate(-20 62 155)"/>
  <ellipse cx="138" cy="155" rx="22" ry="14" fill="white" stroke="#333" stroke-width="2" transform="rotate(20 138 155)"/>
  <path d="M 70 198 L 58 218" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
  <path d="M 70 198 L 74 218" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
  <path d="M 130 198 L 126 218" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
  <path d="M 130 198 L 142 218" stroke="#FF8C00" stroke-width="3" stroke-linecap="round"/>
  <circle cx="55" cy="75" r="6" fill="#FF8C00" opacity="0.3"/>
  <circle cx="145" cy="75" r="6" fill="#FF8C00" opacity="0.3"/>
</svg>`;

const SUPERHERO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
  <path d="M 55 110 Q 30 190 40 260 L 100 220 L 160 260 Q 170 190 145 110 Z" fill="#B71C1C"/>
  <rect x="68" y="125" width="64" height="85" rx="8" fill="#1565C0"/>
  <polygon points="100,140 107,162 130,162 112,174 119,196 100,182 81,196 88,174 70,162 93,162" fill="#FFD700" stroke="#FFA000" stroke-width="1"/>
  <rect x="90" y="108" width="20" height="20" rx="5" fill="#FFCC80"/>
  <circle cx="100" cy="88" r="38" fill="#FFCC80"/>
  <path d="M 65 80 Q 75 58 100 68 Q 125 58 135 80 L 135 90 Q 118 82 100 88 Q 82 82 65 90 Z" fill="#1565C0"/>
  <ellipse cx="84" cy="90" rx="7" ry="5.5" fill="white"/>
  <ellipse cx="116" cy="90" rx="7" ry="5.5" fill="white"/>
  <path d="M 75 100 Q 100 118 125 100" stroke="#e09070" stroke-width="2" fill="none"/>
  <rect x="35" y="128" width="32" height="18" rx="9" fill="#1565C0" transform="rotate(-15 51 137)"/>
  <rect x="133" y="128" width="32" height="18" rx="9" fill="#1565C0" transform="rotate(15 149 137)"/>
  <circle cx="42" cy="155" r="14" fill="#FFCC80"/>
  <circle cx="158" cy="155" r="14" fill="#FFCC80"/>
</svg>`;

const SPIDERWEB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <line x1="100" y1="100" x2="100" y2="12" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <line x1="100" y1="100" x2="174" y2="38" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <line x1="100" y1="100" x2="190" y2="132" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <line x1="100" y1="100" x2="148" y2="192" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <line x1="100" y1="100" x2="52" y2="192" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <line x1="100" y1="100" x2="10" y2="132" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <line x1="100" y1="100" x2="26" y2="38" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <polygon points="100,72 121,80 128,100 121,120 100,128 79,120 72,100 79,80" fill="none" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <polygon points="100,44 138,58 152,100 138,142 100,156 62,142 48,100 62,58" fill="none" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <polygon points="100,16 155,36 176,100 155,164 100,184 45,164 24,100 45,36" fill="none" stroke="#333" stroke-width="1.5" opacity="0.85"/>
  <circle cx="100" cy="100" r="9" fill="#111"/>
  <line x1="91" y1="97" x2="78" y2="87" stroke="#111" stroke-width="2.5"/>
  <line x1="91" y1="100" x2="76" y2="100" stroke="#111" stroke-width="2.5"/>
  <line x1="91" y1="103" x2="78" y2="113" stroke="#111" stroke-width="2.5"/>
  <line x1="109" y1="97" x2="122" y2="87" stroke="#111" stroke-width="2.5"/>
  <line x1="109" y1="100" x2="124" y2="100" stroke="#111" stroke-width="2.5"/>
  <line x1="109" y1="103" x2="122" y2="113" stroke="#111" stroke-width="2.5"/>
</svg>`;

const LIGHTNING = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280">
  <path d="M 128 10 L 68 138 L 104 138 L 68 270 L 175 108 L 132 108 L 168 10 Z" fill="#FFD700" stroke="#FF8C00" stroke-width="3" stroke-linejoin="round"/>
  <path d="M 128 10 L 68 138 L 104 138 L 68 270 L 175 108 L 132 108 L 168 10 Z" fill="none" stroke="#FFEB3B" stroke-width="9" stroke-linejoin="round" opacity="0.25"/>
</svg>`;

const SHIELD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">
  <path d="M 100 10 L 185 45 L 185 120 Q 185 185 100 215 Q 15 185 15 120 L 15 45 Z" fill="#1565C0" stroke="#0D47A1" stroke-width="3"/>
  <path d="M 100 30 L 168 60 L 168 120 Q 168 175 100 200 Q 32 175 32 120 L 32 60 Z" fill="#E53935" stroke="#B71C1C" stroke-width="2"/>
  <circle cx="100" cy="115" r="52" fill="#1565C0"/>
  <polygon points="100,77 112,110 147,110 120,128 130,161 100,143 70,161 80,128 53,110 88,110" fill="white"/>
</svg>`;

const STAR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <polygon points="100,5 122,72 192,72 135,115 158,182 100,140 42,182 65,115 8,72 78,72" fill="#FFEB3B" stroke="#FF8C00" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="100,30 116,80 168,80 126,108 142,158 100,130 58,158 74,108 32,80 84,80" fill="#FFF176" opacity="0.45"/>
  <circle cx="100" cy="100" r="16" fill="#FFD700" opacity="0.6"/>
</svg>`;

const CROWN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">
  <path d="M 15 115 L 15 35 L 55 80 L 100 15 L 145 80 L 185 35 L 185 115 Z" fill="#FFD700" stroke="#FF8C00" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="15" y="115" width="170" height="35" rx="8" fill="#FFD700" stroke="#FF8C00" stroke-width="2"/>
  <circle cx="100" cy="18" r="10" fill="#E53935" stroke="#B71C1C" stroke-width="1.5"/>
  <circle cx="55" cy="80" r="8" fill="#1565C0" stroke="#0D47A1" stroke-width="1.5"/>
  <circle cx="145" cy="80" r="8" fill="#2E7D32" stroke="#1B5E20" stroke-width="1.5"/>
  <circle cx="100" cy="132" r="11" fill="#E53935" stroke="#B71C1C" stroke-width="1.5"/>
  <circle cx="55" cy="132" r="7" fill="#1565C0" stroke="#0D47A1" stroke-width="1.5"/>
  <circle cx="145" cy="132" r="7" fill="#1565C0" stroke="#0D47A1" stroke-width="1.5"/>
  <circle cx="30" cy="132" r="4" fill="#FFB74D"/>
  <circle cx="170" cy="132" r="4" fill="#FFB74D"/>
</svg>`;

const HEART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 190">
  <path d="M 100 175 Q 25 130 15 75 Q 10 20 60 20 Q 80 20 100 48 Q 120 20 140 20 Q 190 20 185 75 Q 175 130 100 175 Z" fill="#E53935" stroke="#B71C1C" stroke-width="3"/>
  <path d="M 60 35 Q 45 35 38 50 Q 32 65 40 80" stroke="#EF9A9A" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.7"/>
  <ellipse cx="70" cy="60" rx="18" ry="11" fill="white" opacity="0.2" transform="rotate(-20 70 60)"/>
</svg>`;

const DRAGON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">
  <path d="M 55 140 Q 10 100 20 65 Q 35 80 55 125 Z" fill="#1B5E20"/>
  <path d="M 145 140 Q 190 100 180 65 Q 165 80 145 125 Z" fill="#1B5E20"/>
  <ellipse cx="100" cy="160" rx="55" ry="50" fill="#2E7D32"/>
  <ellipse cx="100" cy="115" rx="28" ry="38" fill="#2E7D32"/>
  <ellipse cx="100" cy="75" rx="42" ry="38" fill="#388E3C"/>
  <path d="M 75 48 L 68 20 L 82 42 Z" fill="#1B5E20"/>
  <path d="M 125 48 L 132 20 L 118 42 Z" fill="#1B5E20"/>
  <circle cx="82" cy="72" r="10" fill="#FFD700" stroke="#333" stroke-width="1.5"/>
  <circle cx="118" cy="72" r="10" fill="#FFD700" stroke="#333" stroke-width="1.5"/>
  <ellipse cx="83" cy="72" rx="4" ry="8" fill="#111"/>
  <ellipse cx="119" cy="72" rx="4" ry="8" fill="#111"/>
  <ellipse cx="90" cy="90" rx="4" ry="3" fill="#1B5E20"/>
  <ellipse cx="110" cy="90" rx="4" ry="3" fill="#1B5E20"/>
  <path d="M 72 95 Q 100 108 128 95" stroke="#1B5E20" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M 100 108 Q 110 118 120 108 Q 122 126 108 128 Q 128 132 126 148 Q 108 139 100 150 Q 92 139 74 148 Q 72 132 92 128 Q 78 126 80 108 Q 90 118 100 108 Z" fill="#FF5722" opacity="0.92"/>
  <path d="M 100 115 Q 109 123 116 115 Q 117 128 106 130 Q 118 133 117 145 Q 104 137 100 145 Q 96 137 83 145 Q 82 133 94 130 Q 83 128 84 115 Q 91 123 100 115 Z" fill="#FFEB3B" opacity="0.8"/>
</svg>`;

const ROCKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250">
  <path d="M 100 10 Q 148 40 155 120 L 145 120 L 100 140 L 55 120 L 45 120 Q 52 40 100 10 Z" fill="#E53935" stroke="#B71C1C" stroke-width="2"/>
  <path d="M 100 10 Q 110 40 112 120 L 100 140 L 88 120 Q 90 40 100 10 Z" fill="#EF9A9A" opacity="0.4"/>
  <circle cx="100" cy="88" r="22" fill="#81D4FA" stroke="#0288D1" stroke-width="2"/>
  <circle cx="93" cy="82" r="7" fill="white" opacity="0.5"/>
  <path d="M 55 120 L 30 150 L 55 148 Z" fill="#FF8C00"/>
  <path d="M 145 120 L 170 150 L 145 148 Z" fill="#FF8C00"/>
  <path d="M 70 140 Q 80 180 75 210 Q 100 195 125 210 Q 120 180 130 140 Q 115 155 100 155 Q 85 155 70 140 Z" fill="#FF5722" opacity="0.85"/>
  <path d="M 80 155 Q 90 185 82 208 Q 100 197 118 208 Q 110 185 120 155 Q 108 165 100 165 Q 92 165 80 155 Z" fill="#FFEB3B" opacity="0.8"/>
</svg>`;

const ROBOT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">
  <line x1="100" y1="20" x2="100" y2="40" stroke="#555" stroke-width="4"/>
  <circle cx="100" cy="15" r="10" fill="#90A4AE" stroke="#546E7A" stroke-width="2"/>
  <rect x="50" y="40" width="100" height="80" rx="15" fill="#90CAF9" stroke="#42A5F5" stroke-width="2.5"/>
  <rect x="62" y="55" width="30" height="22" rx="8" fill="white" stroke="#42A5F5" stroke-width="1.5"/>
  <rect x="108" y="55" width="30" height="22" rx="8" fill="white" stroke="#42A5F5" stroke-width="1.5"/>
  <circle cx="77" cy="66" r="8" fill="#1565C0"/>
  <circle cx="123" cy="66" r="8" fill="#1565C0"/>
  <circle cx="79" cy="64" r="3" fill="white"/>
  <circle cx="125" cy="64" r="3" fill="white"/>
  <path d="M 72 92 Q 100 104 128 92" stroke="#42A5F5" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <rect x="55" y="120" width="90" height="78" rx="10" fill="#78909C" stroke="#546E7A" stroke-width="2.5"/>
  <rect x="70" y="135" width="60" height="20" rx="6" fill="#B0BEC5"/>
  <circle cx="82" cy="172" r="8" fill="#EF5350"/>
  <circle cx="100" cy="172" r="8" fill="#66BB6A"/>
  <circle cx="118" cy="172" r="8" fill="#FFA726"/>
  <rect x="20" y="122" width="35" height="16" rx="8" fill="#90CAF9" stroke="#42A5F5" stroke-width="2"/>
  <rect x="145" y="122" width="35" height="16" rx="8" fill="#90CAF9" stroke="#42A5F5" stroke-width="2"/>
</svg>`;

const DIAMOND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <path d="M 50 80 L 100 20 L 150 80 L 100 185 Z" fill="#64B5F6" stroke="#1565C0" stroke-width="2.5"/>
  <path d="M 50 80 L 100 20 L 150 80 Z" fill="#90CAF9" stroke="#1565C0" stroke-width="2"/>
  <line x1="100" y1="20" x2="100" y2="80" stroke="#1565C0" stroke-width="1.5" opacity="0.5"/>
  <line x1="50" y1="80" x2="150" y2="80" stroke="#1565C0" stroke-width="1.5" opacity="0.5"/>
  <line x1="75" y1="80" x2="100" y2="185" stroke="#1565C0" stroke-width="1" opacity="0.4"/>
  <line x1="125" y1="80" x2="100" y2="185" stroke="#1565C0" stroke-width="1" opacity="0.4"/>
  <path d="M 62 60 Q 82 48 100 55" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.4"/>
</svg>`;

export const CLIPART_ITEMS: ClipArtItem[] = [
  { id: 'bunny', name: 'Tavşan', category: 'cartoon', svg: toDataUrl(BUNNY) },
  { id: 'yellow-bird', name: 'Sarı Kuş', category: 'cartoon', svg: toDataUrl(YELLOW_BIRD) },
  { id: 'gray-cat', name: 'Gri Kedi', category: 'cartoon', svg: toDataUrl(GRAY_CAT) },
  { id: 'cartoon-duck', name: 'Ördek', category: 'cartoon', svg: toDataUrl(CARTOON_DUCK) },
  { id: 'dragon', name: 'Ejderha', category: 'cartoon', svg: toDataUrl(DRAGON) },
  { id: 'robot', name: 'Robot', category: 'cartoon', svg: toDataUrl(ROBOT) },
  { id: 'superhero', name: 'Süper Kahraman', category: 'superhero', svg: toDataUrl(SUPERHERO) },
  { id: 'spiderweb', name: 'Örümcek Ağı', category: 'superhero', svg: toDataUrl(SPIDERWEB) },
  { id: 'lightning', name: 'Şimşek', category: 'superhero', svg: toDataUrl(LIGHTNING) },
  { id: 'shield', name: 'Kalkan', category: 'superhero', svg: toDataUrl(SHIELD) },
  { id: 'rocket', name: 'Roket', category: 'superhero', svg: toDataUrl(ROCKET) },
  { id: 'star', name: 'Yıldız', category: 'shapes', svg: toDataUrl(STAR) },
  { id: 'crown', name: 'Taç', category: 'shapes', svg: toDataUrl(CROWN) },
  { id: 'heart', name: 'Kalp', category: 'shapes', svg: toDataUrl(HEART) },
  { id: 'diamond', name: 'Elmas', category: 'shapes', svg: toDataUrl(DIAMOND) },
];

export const CLIPART_CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'cartoon', label: 'Çizgi Film' },
  { id: 'superhero', label: 'Süper Kahraman' },
  { id: 'shapes', label: 'Şekiller' },
] as const;

export type ClipArtCategory = (typeof CLIPART_CATEGORIES)[number]['id'];
