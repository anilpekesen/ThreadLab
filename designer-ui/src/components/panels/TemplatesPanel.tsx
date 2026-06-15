import { type ReactNode, useEffect, useState } from 'react';
import { fabric } from 'fabric';
import type { ShopTemplate } from '@/types';

interface Template {
  id: string;
  label: string;
  labelEn?: string;
  category: string;
  description: string;
  descriptionEn?: string;
  tone: string;
  preview: ReactNode;
  build: (cv: fabric.Canvas) => void;
}

const SHOP_CATEGORIES = [
  { value: 'all',       label: 'Tümü', labelEn: 'All' },
  { value: 'custom',    label: 'Özel', labelEn: 'Custom' },
  { value: 'cartoon',   label: 'Çizgi Film', labelEn: 'Cartoon' },
  { value: 'superhero', label: 'Süper Kahraman', labelEn: 'Superhero' },
  { value: 'sport',     label: 'Spor', labelEn: 'Sport' },
  { value: 'nature',    label: 'Doğa', labelEn: 'Nature' },
  { value: 'abstract',  label: 'Soyut', labelEn: 'Abstract' },
  { value: 'text',      label: 'Yazı / Logo', labelEn: 'Text / Logo' },
];

const TEXT_CATEGORIES = [
  { value: 'all', label: 'Tümü', labelEn: 'All' },
  { value: 'popular', label: 'Popüler', labelEn: 'Popular' },
  { value: 'family', label: 'Aile', labelEn: 'Family' },
  { value: 'event', label: 'Etkinlik', labelEn: 'Event' },
  { value: 'sport', label: 'Spor', labelEn: 'Sport' },
  { value: 'retro', label: 'Retro', labelEn: 'Retro' },
  { value: 'minimal', label: 'Minimal', labelEn: 'Minimal' },
  { value: 'brand', label: 'Marka', labelEn: 'Brand' },
];

const TEMPLATE_FONT_LINK_ID = 'printlab-template-fonts';
const TEMPLATE_FONT_URL = 'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Anton&family=Bebas+Neue&family=Cinzel+Decorative:wght@400;700;900&family=Graduate&family=Montserrat:wght@400;700;800;900&family=Oswald:wght@400;700&family=Pacifico&family=Permanent+Marker&family=Playfair+Display:wght@700;900&family=Poppins:wght@400;700&family=Rock+Salt&family=Shrikhand&family=Space+Grotesk:wght@400;700&display=swap';

function useTemplateFonts() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(TEMPLATE_FONT_LINK_ID)) return;
    const preconnectGoogle = document.createElement('link');
    preconnectGoogle.rel = 'preconnect';
    preconnectGoogle.href = 'https://fonts.googleapis.com';

    const preconnectGstatic = document.createElement('link');
    preconnectGstatic.rel = 'preconnect';
    preconnectGstatic.href = 'https://fonts.gstatic.com';
    preconnectGstatic.crossOrigin = 'anonymous';

    const stylesheet = document.createElement('link');
    stylesheet.id = TEMPLATE_FONT_LINK_ID;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = TEMPLATE_FONT_URL;

    document.head.append(preconnectGoogle, preconnectGstatic, stylesheet);
  }, []);
}

const fitText = (text: fabric.IText, maxWidth: number) => {
  if (text.width && text.width > maxWidth) {
    text.scaleToWidth(maxWidth);
  }
  return text;
};

const addObjects = (cv: fabric.Canvas, objects: fabric.Object[], active?: fabric.Object) => {
  objects.forEach((obj) => cv.add(obj));
  cv.setActiveObject(active ?? objects[objects.length - 1]);
  cv.renderAll();
};

const center = (cv: fabric.Canvas) => ({
  x: cv.width! / 2,
  y: cv.height! / 2,
  w: cv.width!,
  h: cv.height!,
});

const text = (value: string, options: fabric.ITextOptions) =>
  new fabric.IText(value, {
    originX: 'center',
    originY: 'center',
    textAlign: 'center',
    ...options,
  });

function PreviewFrame({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <div className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border ${tone}`}>
      <div className="absolute inset-x-6 top-4 h-px bg-white/50" />
      <div className="relative flex h-full w-full items-center justify-center p-3 text-center">
        {children}
      </div>
    </div>
  );
}

const previewText = {
  block: 'font-black uppercase leading-[0.86] tracking-wide',
  condensed: 'font-black uppercase leading-none tracking-[0.16em]',
  script: 'font-black leading-tight',
  serif: 'font-black uppercase leading-none tracking-[0.08em]',
};

const TEXT_TEMPLATES: Template[] = [
  {
    id: 'bold-text',
    label: 'Kalın Yazı',
    labelEn: 'Bold Text',
    category: 'popular',
    description: 'Büyük slogan',
    descriptionEn: 'Large slogan',
    tone: 'border-slate-200 bg-slate-950 text-white',
    preview: (
      <PreviewFrame tone="border-slate-200 bg-slate-950 text-white">
        <div className={`${previewText.block} text-[28px]`}>100%<br />ORİJİNAL</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const txt = new fabric.IText('100%\nORİJİNAL', {
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Impact',
        fontSize: 52,
        fill: '#ffffff',
        textAlign: 'center',
        lineHeight: 1.1,
      });
      addObjects(cv, [fitText(txt, w - 32)], txt);
    },
  },
  {
    id: 'limited',
    label: 'Limited Edition',
    category: 'brand',
    description: 'Drop etiketi',
    descriptionEn: 'Drop label',
    tone: 'border-zinc-200 bg-zinc-100 text-zinc-950',
    preview: (
      <PreviewFrame tone="border-zinc-200 bg-zinc-100 text-zinc-950">
        <div className="rounded bg-zinc-950 px-3 py-2 text-[13px] font-black uppercase tracking-[0.28em] text-white">Limited</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const rect = new fabric.Rect({
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        width: w - 40,
        height: 60,
        fill: '#111827',
        rx: 4,
      });
      const txt = new fabric.IText('LIMITED EDITION', {
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Bebas Neue',
        fontSize: 26,
        fill: '#ffffff',
        charSpacing: 120,
      });
      addObjects(cv, [rect, fitText(txt, w - 64)], txt);
    },
  },
  {
    id: 'circle-text',
    label: 'Daire + Yazı',
    labelEn: 'Circle + Text',
    category: 'minimal',
    description: 'Modern rozet',
    descriptionEn: 'Modern badge',
    tone: 'border-sky-200 bg-sky-50 text-slate-950',
    preview: (
      <PreviewFrame tone="border-sky-200 bg-sky-50 text-slate-950">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-sky-600 text-[15px] font-black leading-tight">Benim<br />Tasarımım</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const cx = cv.width! / 2;
      const cy = cv.height! / 2;
      const circle = new fabric.Circle({
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        radius: 80,
        fill: 'transparent',
        stroke: '#2563eb',
        strokeWidth: 3,
      });
      const txt = new fabric.IText('Benim\nTasarımım', {
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Poppins',
        fontSize: 24,
        fill: '#0f172a',
        textAlign: 'center',
      });
      addObjects(cv, [circle, txt], txt);
    },
  },
  {
    id: 'no-fear',
    label: 'No Fear',
    category: 'sport',
    description: 'Agresif blok',
    descriptionEn: 'Bold block',
    tone: 'border-red-200 bg-red-50 text-red-700',
    preview: (
      <PreviewFrame tone="border-red-200 bg-red-50 text-red-700">
        <div className={`${previewText.block} text-[32px]`}>NO<br />FEAR</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const txt = new fabric.IText('NO\nFEAR', {
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Anton',
        fontSize: 64,
        fill: '#dc2626',
        textAlign: 'center',
        lineHeight: 0.9,
      });
      addObjects(cv, [fitText(txt, w - 32)], txt);
    },
  },
  {
    id: 'badge',
    label: 'Rozet',
    labelEn: 'Badge',
    category: 'brand',
    description: 'Tarih rozeti',
    descriptionEn: 'Date badge',
    tone: 'border-amber-200 bg-blue-950 text-amber-300',
    preview: (
      <PreviewFrame tone="border-amber-200 bg-blue-950 text-amber-300">
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-amber-300 text-white">
          <span className="text-[10px] font-black tracking-[0.3em] text-amber-300">EST.</span>
          <span className="text-[30px] font-black leading-none">2026</span>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const cx = cv.width! / 2;
      const cy = cv.height! / 2;
      const outer = new fabric.Circle({
        left: cx, top: cy, originX: 'center', originY: 'center',
        radius: 90, fill: '#1e3a8a',
      });
      const inner = new fabric.Circle({
        left: cx, top: cy, originX: 'center', originY: 'center',
        radius: 75, fill: 'transparent', stroke: '#facc15', strokeWidth: 2,
      });
      const top = new fabric.IText('EST.', {
        left: cx, top: cy - 30, originX: 'center', originY: 'center',
        fontFamily: 'Oswald', fontSize: 16, fill: '#facc15', charSpacing: 200,
      });
      const mid = new fabric.IText('2024', {
        left: cx, top: cy + 5, originX: 'center', originY: 'center',
        fontFamily: 'Anton', fontSize: 40, fill: '#ffffff',
      });
      addObjects(cv, [outer, inner, top, mid], mid);
    },
  },
  {
    id: 'grunge',
    label: 'Grunge',
    category: 'retro',
    description: 'Dağınık slogan',
    descriptionEn: 'Distressed slogan',
    tone: 'border-orange-200 bg-stone-950 text-orange-400',
    preview: (
      <PreviewFrame tone="border-orange-200 bg-stone-950 text-orange-400">
        <div className="rotate-[-3deg] text-[20px] font-black uppercase leading-tight">BORN<br />TO BE<br />WILD</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const txt = new fabric.IText('BORN\nTO BE\nWILD', {
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        fontFamily: 'Rock Salt',
        fontSize: 28,
        fill: '#f97316',
        textAlign: 'center',
        lineHeight: 1.2,
      });
      txt.rotate(-4);
      addObjects(cv, [fitText(txt, w - 32)], txt);
    },
  },
  {
    id: 'custom-name',
    label: 'Custom Name',
    category: 'popular',
    description: 'İsim odaklı',
    descriptionEn: 'Name-focused',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    preview: (
      <PreviewFrame tone="border-emerald-200 bg-emerald-50 text-emerald-950">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.36em] text-emerald-700">Custom</div>
          <div className="text-[32px] font-black uppercase leading-none">NAME</div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const top = text('CUSTOM', {
        left: x,
        top: y - 28,
        fontFamily: 'Montserrat',
        fontSize: 16,
        fill: '#047857',
        charSpacing: 280,
      });
      const main = text('NAME', {
        left: x,
        top: y + 8,
        fontFamily: 'Montserrat',
        fontWeight: '900',
        fontSize: 54,
        fill: '#064e3b',
      });
      addObjects(cv, [top, fitText(main, w - 32)], main);
    },
  },
  {
    id: 'mom-est',
    label: 'Mom EST.',
    category: 'family',
    description: 'Anne hediyesi',
    descriptionEn: 'Mom gift',
    tone: 'border-rose-200 bg-rose-50 text-rose-900',
    preview: (
      <PreviewFrame tone="border-rose-200 bg-rose-50 text-rose-900">
        <div className="text-[35px] font-black leading-none">MOM<br /><span className="text-[12px] tracking-[0.28em]">EST. 2026</span></div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const mom = text('MOM', {
        left: x,
        top: y - 10,
        fontFamily: 'Playfair Display',
        fontWeight: '900',
        fontSize: 64,
        fill: '#9f1239',
      });
      const est = text('EST. 2026', {
        left: x,
        top: y + 42,
        fontFamily: 'Montserrat',
        fontSize: 16,
        fill: '#be123c',
        charSpacing: 220,
      });
      addObjects(cv, [fitText(mom, w - 40), est], mom);
    },
  },
  {
    id: 'dad-mode',
    label: 'Dad Mode',
    category: 'family',
    description: 'Baba teması',
    descriptionEn: 'Dad theme',
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-950',
    preview: (
      <PreviewFrame tone="border-cyan-200 bg-cyan-50 text-cyan-950">
        <div className="rounded border-2 border-cyan-800 px-3 py-2 text-[22px] font-black uppercase leading-none">DAD<br />MODE ON</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const rect = new fabric.Rect({
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        width: Math.min(250, w - 40),
        height: 110,
        fill: 'transparent',
        stroke: '#155e75',
        strokeWidth: 4,
        rx: 6,
      });
      const main = text('DAD\nMODE ON', {
        left: x,
        top: y,
        fontFamily: 'Oswald',
        fontWeight: '900',
        fontSize: 38,
        fill: '#083344',
        lineHeight: 0.95,
      });
      addObjects(cv, [rect, fitText(main, w - 72)], main);
    },
  },
  {
    id: 'birthday-squad',
    label: 'Birthday Squad',
    category: 'event',
    description: 'Parti tasarımı',
    descriptionEn: 'Party design',
    tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950',
    preview: (
      <PreviewFrame tone="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950">
        <div>
          <div className="text-[13px] font-black uppercase tracking-[0.22em] text-fuchsia-600">Birthday</div>
          <div className="text-[25px] font-black uppercase leading-none">SQUAD</div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const top = text('BIRTHDAY', {
        left: x,
        top: y - 22,
        fontFamily: 'Poppins',
        fontWeight: '800',
        fontSize: 18,
        fill: '#c026d3',
        charSpacing: 180,
      });
      const main = text('SQUAD', {
        left: x,
        top: y + 16,
        fontFamily: 'Impact',
        fontSize: 52,
        fill: '#701a75',
      });
      addObjects(cv, [top, fitText(main, w - 36)], main);
    },
  },
  {
    id: 'bride-team',
    label: 'Bride Team',
    category: 'event',
    description: 'Düğün ekibi',
    descriptionEn: 'Wedding crew',
    tone: 'border-pink-200 bg-pink-50 text-pink-950',
    preview: (
      <PreviewFrame tone="border-pink-200 bg-pink-50 text-pink-950">
        <div className="text-[24px] font-black leading-tight">BRIDE<br /><span className="text-[15px] tracking-[0.24em]">TEAM</span></div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const bride = text('BRIDE', {
        left: x,
        top: y - 12,
        fontFamily: 'Playfair Display',
        fontWeight: '900',
        fontSize: 50,
        fill: '#831843',
      });
      const team = text('TEAM', {
        left: x,
        top: y + 34,
        fontFamily: 'Montserrat',
        fontWeight: '800',
        fontSize: 18,
        fill: '#be185d',
        charSpacing: 300,
      });
      addObjects(cv, [fitText(bride, w - 38), team], bride);
    },
  },
  {
    id: 'game-day',
    label: 'Game Day',
    category: 'sport',
    description: 'Maç günü',
    descriptionEn: 'Match day',
    tone: 'border-lime-200 bg-lime-50 text-lime-950',
    preview: (
      <PreviewFrame tone="border-lime-200 bg-lime-50 text-lime-950">
        <div className="skew-x-[-8deg] text-[30px] font-black uppercase leading-none">GAME<br />DAY</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const box = new fabric.Rect({
        left: x,
        top: y,
        originX: 'center',
        originY: 'center',
        width: Math.min(230, w - 42),
        height: 112,
        fill: '#ecfccb',
        stroke: '#3f6212',
        strokeWidth: 3,
        skewX: -8,
      });
      const main = text('GAME\nDAY', {
        left: x,
        top: y,
        fontFamily: 'Anton',
        fontSize: 52,
        fill: '#365314',
        lineHeight: 0.9,
        skewX: -8,
      });
      addObjects(cv, [box, fitText(main, w - 56)], main);
    },
  },
  {
    id: 'champion',
    label: 'Champion',
    category: 'sport',
    description: 'Kupa hissi',
    descriptionEn: 'Trophy feel',
    tone: 'border-yellow-200 bg-yellow-50 text-yellow-950',
    preview: (
      <PreviewFrame tone="border-yellow-200 bg-yellow-50 text-yellow-950">
        <div>
          <div className="text-[12px] font-black uppercase tracking-[0.26em]">Team</div>
          <div className="text-[25px] font-black uppercase">Champion</div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const top = text('TEAM', {
        left: x,
        top: y - 26,
        fontFamily: 'Oswald',
        fontSize: 18,
        fill: '#a16207',
        charSpacing: 260,
      });
      const main = text('CHAMPION', {
        left: x,
        top: y + 14,
        fontFamily: 'Impact',
        fontSize: 42,
        fill: '#713f12',
      });
      addObjects(cv, [top, fitText(main, w - 34)], main);
    },
  },
  {
    id: 'retro-wave',
    label: 'Retro Wave',
    category: 'retro',
    description: '80s stil',
    descriptionEn: '80s style',
    tone: 'border-indigo-200 bg-indigo-950 text-cyan-200',
    preview: (
      <PreviewFrame tone="border-indigo-200 bg-indigo-950 text-cyan-200">
        <div>
          <div className="text-[13px] font-black uppercase tracking-[0.24em] text-pink-300">Retro</div>
          <div className="text-[29px] font-black uppercase leading-none text-cyan-200">WAVE</div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const sun = new fabric.Circle({
        left: x,
        top: y - 12,
        originX: 'center',
        originY: 'center',
        radius: 56,
        fill: '#f472b6',
        opacity: 0.28,
      });
      const top = text('RETRO', {
        left: x,
        top: y - 26,
        fontFamily: 'Montserrat',
        fontWeight: '900',
        fontSize: 18,
        fill: '#f9a8d4',
        charSpacing: 260,
      });
      const main = text('WAVE', {
        left: x,
        top: y + 20,
        fontFamily: 'Impact',
        fontSize: 56,
        fill: '#67e8f9',
      });
      addObjects(cv, [sun, top, fitText(main, w - 34)], main);
    },
  },
  {
    id: 'good-vibes',
    label: 'Good Vibes',
    category: 'retro',
    description: 'Pozitif slogan',
    descriptionEn: 'Positive slogan',
    tone: 'border-teal-200 bg-teal-50 text-teal-950',
    preview: (
      <PreviewFrame tone="border-teal-200 bg-teal-50 text-teal-950">
        <div className="rotate-[-4deg] text-[26px] font-black leading-none">GOOD<br />VIBES</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const main = text('GOOD\nVIBES', {
        left: x,
        top: y,
        fontFamily: 'Cooper Black',
        fontSize: 50,
        fill: '#0f766e',
        lineHeight: 0.92,
      });
      main.rotate(-5);
      addObjects(cv, [fitText(main, w - 36)], main);
    },
  },
  {
    id: 'vertical-initials',
    label: 'Dikey İsim',
    labelEn: 'Vertical Name',
    category: 'minimal',
    description: 'Temiz monogram',
    descriptionEn: 'Clean monogram',
    tone: 'border-neutral-200 bg-white text-neutral-950',
    preview: (
      <PreviewFrame tone="border-neutral-200 bg-white text-neutral-950">
        <div className="flex items-center gap-2">
          <div className="h-20 w-px bg-neutral-900" />
          <div className="text-left text-[26px] font-black leading-none">A<br />P</div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y } = center(cv);
      const line = new fabric.Rect({
        left: x - 28,
        top: y,
        originX: 'center',
        originY: 'center',
        width: 3,
        height: 130,
        fill: '#111827',
      });
      const initials = text('A\nP', {
        left: x + 14,
        top: y,
        fontFamily: 'Montserrat',
        fontWeight: '900',
        fontSize: 42,
        fill: '#111827',
        lineHeight: 0.92,
      });
      addObjects(cv, [line, initials], initials);
    },
  },
  {
    id: 'premium-mark',
    label: 'Premium Mark',
    category: 'minimal',
    description: 'Lüks etiket',
    descriptionEn: 'Luxury label',
    tone: 'border-stone-300 bg-stone-100 text-stone-950',
    preview: (
      <PreviewFrame tone="border-stone-300 bg-stone-100 text-stone-950">
        <div>
          <div className="text-[28px] font-black uppercase tracking-[0.08em]">Premium</div>
          <div className="mx-auto mt-1 h-px w-20 bg-stone-900" />
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const main = text('PREMIUM', {
        left: x,
        top: y - 8,
        fontFamily: 'Playfair Display',
        fontWeight: '900',
        fontSize: 42,
        fill: '#1c1917',
        charSpacing: 80,
      });
      const line = new fabric.Rect({
        left: x,
        top: y + 32,
        originX: 'center',
        originY: 'center',
        width: Math.min(180, w - 80),
        height: 2,
        fill: '#1c1917',
      });
      addObjects(cv, [fitText(main, w - 38), line], main);
    },
  },
  {
    id: 'handmade',
    label: 'Handmade',
    category: 'brand',
    description: 'Butik ürün',
    descriptionEn: 'Boutique product',
    tone: 'border-green-200 bg-green-50 text-green-950',
    preview: (
      <PreviewFrame tone="border-green-200 bg-green-50 text-green-950">
        <div>
          <div className="text-[29px] font-black leading-none">HAND<br />MADE</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] text-green-700">with care</div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const main = text('HAND\nMADE', {
        left: x,
        top: y - 8,
        fontFamily: 'Oswald',
        fontWeight: '900',
        fontSize: 46,
        fill: '#14532d',
        lineHeight: 0.92,
      });
      const sub = text('WITH CARE', {
        left: x,
        top: y + 52,
        fontFamily: 'Montserrat',
        fontSize: 13,
        fill: '#15803d',
        charSpacing: 220,
      });
      addObjects(cv, [fitText(main, w - 40), sub], main);
    },
  },
  {
    id: 'best-teacher',
    label: 'Best Teacher',
    category: 'event',
    description: 'Hediye tasarımı',
    descriptionEn: 'Gift design',
    tone: 'border-orange-200 bg-orange-50 text-orange-950',
    preview: (
      <PreviewFrame tone="border-orange-200 bg-orange-50 text-orange-950">
        <div className="text-[21px] font-black uppercase leading-tight">Best<br />Teacher<br /><span className="text-[12px] tracking-[0.2em]">Ever</span></div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const main = text('BEST\nTEACHER', {
        left: x,
        top: y - 10,
        fontFamily: 'Poppins',
        fontWeight: '900',
        fontSize: 38,
        fill: '#9a3412',
        lineHeight: 0.95,
      });
      const ever = text('EVER', {
        left: x,
        top: y + 52,
        fontFamily: 'Montserrat',
        fontWeight: '800',
        fontSize: 15,
        fill: '#ea580c',
        charSpacing: 260,
      });
      addObjects(cv, [fitText(main, w - 40), ever], main);
    },
  },
  {
    id: 'family-vacation',
    label: 'Family Vacation',
    category: 'family',
    description: 'Tatil grubu',
    descriptionEn: 'Vacation group',
    tone: 'border-blue-200 bg-blue-50 text-blue-950',
    preview: (
      <PreviewFrame tone="border-blue-200 bg-blue-50 text-blue-950">
        <div>
          <div className="text-[20px] font-black uppercase leading-none">Family<br />Vacation</div>
          <div className="mt-1 text-[13px] font-black tracking-[0.22em] text-blue-700">2026</div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const main = text('FAMILY\nVACATION', {
        left: x,
        top: y - 8,
        fontFamily: 'Montserrat',
        fontWeight: '900',
        fontSize: 38,
        fill: '#1e3a8a',
        lineHeight: 0.95,
      });
      const year = text('2026', {
        left: x,
        top: y + 48,
        fontFamily: 'Oswald',
        fontSize: 18,
        fill: '#2563eb',
        charSpacing: 260,
      });
      addObjects(cv, [fitText(main, w - 40), year], main);
    },
  },
  {
    id: 'mini-boss',
    label: 'Mini Boss',
    category: 'family',
    description: 'Çocuk ürünü',
    descriptionEn: 'Kids product',
    tone: 'border-violet-200 bg-violet-50 text-violet-950',
    preview: (
      <PreviewFrame tone="border-violet-200 bg-violet-50 text-violet-950">
        <div className="text-[30px] font-black uppercase leading-none">MINI<br />BOSS</div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y, w } = center(cv);
      const crown = new fabric.Triangle({
        left: x,
        top: y - 64,
        originX: 'center',
        originY: 'center',
        width: 54,
        height: 32,
        fill: '#facc15',
        angle: 180,
      });
      const main = text('MINI\nBOSS', {
        left: x,
        top: y + 8,
        fontFamily: 'Impact',
        fontSize: 54,
        fill: '#4c1d95',
        lineHeight: 0.88,
      });
      addObjects(cv, [crown, fitText(main, w - 40)], main);
    },
  },
  {
    id: 'logo-lockup',
    label: 'Logo Lockup',
    category: 'brand',
    description: 'Marka yerleşimi',
    descriptionEn: 'Brand lockup',
    tone: 'border-slate-200 bg-white text-slate-950',
    preview: (
      <PreviewFrame tone="border-slate-200 bg-white text-slate-950">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded bg-slate-950 text-[18px] font-black text-white">PL</div>
          <div className="text-left">
            <div className="text-[16px] font-black uppercase leading-none">Brand</div>
            <div className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Studio</div>
          </div>
        </div>
      </PreviewFrame>
    ),
    build: (cv) => {
      const { x, y } = center(cv);
      const mark = new fabric.Rect({
        left: x - 58,
        top: y,
        originX: 'center',
        originY: 'center',
        width: 64,
        height: 64,
        fill: '#0f172a',
        rx: 5,
      });
      const initials = text('PL', {
        left: x - 58,
        top: y,
        fontFamily: 'Montserrat',
        fontWeight: '900',
        fontSize: 26,
        fill: '#ffffff',
      });
      const brand = text('BRAND', {
        left: x + 34,
        top: y - 12,
        fontFamily: 'Montserrat',
        fontWeight: '900',
        fontSize: 28,
        fill: '#0f172a',
      });
      const studio = text('STUDIO', {
        left: x + 34,
        top: y + 20,
        fontFamily: 'Montserrat',
        fontSize: 11,
        fill: '#64748b',
        charSpacing: 220,
      });
      addObjects(cv, [mark, initials, brand, studio], brand);
    },
  },
];

interface Props {
  onApply: (tpl: Template) => void;
  onAddImage: (url: string, template?: ShopTemplate) => void;
  shopTemplates?: ShopTemplate[];
  locale?: string;
}

export default function TemplatesPanel({ onApply, onAddImage, shopTemplates = [], locale }: Props) {
  useTemplateFonts();
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTextCategory, setActiveTextCategory] = useState('all');
  const hasShopTemplates = shopTemplates.length > 0;
  const isTurkish = !locale || locale.toLowerCase().startsWith('tr');
  const categoryLabel = (category: { label: string; labelEn?: string }) =>
    isTurkish ? category.label : (category.labelEn ?? category.label);
  const templateLabel = (tpl: Template) => (isTurkish ? tpl.label : (tpl.labelEn ?? tpl.label));
  const templateDescription = (tpl: Template) =>
    isTurkish ? tpl.description : (tpl.descriptionEn ?? tpl.description);
  const templatePreview = (tpl: Template) => {
    if (isTurkish) return tpl.preview;
    if (tpl.id === 'bold-text') {
      return (
        <PreviewFrame tone="border-slate-200 bg-slate-950 text-white">
          <div className={`${previewText.block} text-[28px]`}>100%<br />ORIGINAL</div>
        </PreviewFrame>
      );
    }
    if (tpl.id === 'circle-text') {
      return (
        <PreviewFrame tone="border-sky-200 bg-sky-50 text-slate-950">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-sky-600 text-[15px] font-black leading-tight">My<br />Design</div>
        </PreviewFrame>
      );
    }
    return tpl.preview;
  };
  const applyTemplate = (tpl: Template) => {
    if (isTurkish) {
      onApply(tpl);
      return;
    }

    if (tpl.id === 'bold-text') {
      onApply({
        ...tpl,
        build: (cv) => {
          const { x, y, w } = center(cv);
          const txt = new fabric.IText('100%\nORIGINAL', {
            left: x,
            top: y,
            originX: 'center',
            originY: 'center',
            fontFamily: 'Impact',
            fontSize: 52,
            fill: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.1,
          });
          addObjects(cv, [fitText(txt, w - 32)], txt);
        },
      });
      return;
    }

    if (tpl.id === 'circle-text') {
      onApply({
        ...tpl,
        build: (cv) => {
          const cx = cv.width! / 2;
          const cy = cv.height! / 2;
          const circle = new fabric.Circle({
            left: cx,
            top: cy,
            originX: 'center',
            originY: 'center',
            radius: 80,
            fill: 'transparent',
            stroke: '#2563eb',
            strokeWidth: 3,
          });
          const txt = new fabric.IText('My\nDesign', {
            left: cx,
            top: cy,
            originX: 'center',
            originY: 'center',
            fontFamily: 'Poppins',
            fontSize: 24,
            fill: '#0f172a',
            textAlign: 'center',
          });
          addObjects(cv, [circle, txt], txt);
        },
      });
      return;
    }

    onApply(tpl);
  };

  // Only show category tabs that have at least one template (plus Tümü)
  const presentCategories = SHOP_CATEGORIES.filter(
    (c) => c.value === 'all' || shopTemplates.some((t) => t.category === c.value),
  );

  const filteredTemplates =
    activeCategory === 'all'
      ? shopTemplates
      : shopTemplates.filter((t) => t.category === activeCategory);

  const filteredTextTemplates =
    activeTextCategory === 'all'
      ? TEXT_TEMPLATES
      : TEXT_TEMPLATES.filter((t) => t.category === activeTextCategory);

  return (
    <div className="space-y-8">

      {hasShopTemplates && (
        <>
          {/* ── Mağaza Şablonları ── */}
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-600">
                {isTurkish ? 'Mağaza Şablonları' : 'Store Templates'}
              </p>
              <p className="text-sm font-semibold text-slate-500">
                {isTurkish ? 'Bir görsele tıklayarak tuvale ekleyin.' : 'Click an image to add it to the canvas.'}
              </p>
            </div>

            {/* Category filter tabs */}
            {presentCategories.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {presentCategories.map((category) => (
                  <button
                    key={category.value}
                    onClick={() => setActiveCategory(category.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      activeCategory === category.value
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {categoryLabel(category)}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-5">
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => onAddImage(tpl.imageUrl, tpl)}
                  title={tpl.name}
                  className="group flex flex-col items-center gap-1.5 rounded-2xl border-2 border-violet-200 bg-white p-2 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50/40 hover:shadow-md"
                >
                  <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gray-50 p-1">
                    <img
                      src={tpl.imageUrl.startsWith('https://assets.printlabapp.com/') ? `/api/img-proxy?url=${encodeURIComponent(tpl.imageUrl)}` : tpl.imageUrl}
                      alt={tpl.name}
                      className="h-full w-full object-contain transition-transform group-hover:scale-110"
                      draggable={false}
                    />
                  </div>
                  <span className="w-full truncate text-[10px] font-bold text-violet-700">{tpl.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ayraç */}
          <div className="border-t border-gray-100" />
        </>
      )}

      {/* ── Yazı Şablonları ── */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">
            {isTurkish ? 'Yazı Şablonları' : 'Text Templates'}
          </p>
          <p className="text-sm font-semibold text-slate-500">
            {isTurkish ? 'Hazır satış metinleri ve baskı kompozisyonları.' : 'Ready-to-sell text layouts and print compositions.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEXT_CATEGORIES.map((category) => (
            <button
              key={category.value}
              onClick={() => setActiveTextCategory(category.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTextCategory === category.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {categoryLabel(category)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredTextTemplates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
              className="group rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md"
            >
              <div className="mb-3 transition-transform group-hover:scale-[1.02]">
                {templatePreview(tpl)}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-800">{templateLabel(tpl)}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{templateDescription(tpl)}</p>
                </div>
                <span className="rounded bg-blue-50 px-1.5 py-1 text-[10px] font-black uppercase text-blue-600">
                  {isTurkish ? 'Ekle' : 'Add'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

export type { Template };
