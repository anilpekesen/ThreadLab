export interface MockupTemplate {
  id: string;
  label: string;
  side: "front" | "back";
  file: string; // public/mockup-templates/ altındaki dosya adı
  area: { x: number; y: number; width: number; height: number };
}

// Tüm şablonlar 1122x1402 px
// area = tişörtte baskı alanının koordinatları
export const MOCKUP_TEMPLATES: MockupTemplate[] = [
  // ── Düz / Ghost ─────────────────────────────────────────
  {
    id: "flat-front",
    label: "Düz Ön",
    side: "front",
    file: "flat-front.png",
    area: { x: 250, y: 330, width: 620, height: 530 },
  },
  {
    id: "flat-back",
    label: "Düz Arka",
    side: "back",
    file: "flat-back.png",
    area: { x: 250, y: 300, width: 620, height: 550 },
  },

  // ── Kadın Modeller (Ön) ──────────────────────────────────
  {
    id: "woman-front-1",
    label: "Kadın Model 1",
    side: "front",
    file: "woman-front-1.png",
    area: { x: 320, y: 430, width: 430, height: 330 },
  },
  {
    id: "woman-front-2",
    label: "Kadın Model 2 (Oturuyor)",
    side: "front",
    file: "woman-front-2.png",
    area: { x: 310, y: 390, width: 440, height: 340 },
  },
  {
    id: "woman-front-3",
    label: "Kadın Model 3",
    side: "front",
    file: "woman-front-3.png",
    area: { x: 350, y: 440, width: 410, height: 310 },
  },
  {
    id: "woman-front-4",
    label: "Kadın Model 4 (Açılı)",
    side: "front",
    file: "woman-front-4.png",
    area: { x: 290, y: 380, width: 470, height: 360 },
  },
  {
    id: "woman-front-5",
    label: "Kadın Model 5 (Oturuyor)",
    side: "front",
    file: "woman-front-5.png",
    area: { x: 310, y: 400, width: 440, height: 340 },
  },
  {
    id: "woman-front-6",
    label: "Kadın Model 6 (Ayakta)",
    side: "front",
    file: "woman-front-6.png",
    area: { x: 300, y: 410, width: 450, height: 340 },
  },

  // ── Erkek Modeller ───────────────────────────────────────
  {
    id: "man-front-1",
    label: "Erkek Model 1",
    side: "front",
    file: "man-front-1.png",
    area: { x: 360, y: 460, width: 390, height: 310 },
  },
  {
    id: "young-man-front",
    label: "Genç Erkek Model",
    side: "front",
    file: "young-man-front.png",
    area: { x: 340, y: 400, width: 420, height: 330 },
  },

  // ── Arka Görünümler ──────────────────────────────────────
  {
    id: "man-back-1",
    label: "Erkek Model Arka",
    side: "back",
    file: "man-back-1.png",
    area: { x: 320, y: 390, width: 440, height: 350 },
  },
  {
    id: "woman-back-1",
    label: "Kadın Model Arka",
    side: "back",
    file: "woman-back-1.png",
    area: { x: 310, y: 360, width: 460, height: 360 },
  },
];
