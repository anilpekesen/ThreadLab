import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BlockStack, InlineStack, Text, Button, Select, Banner, Checkbox, TextField, ButtonGroup, Badge,
} from "@shopify/polaris";
import { printCanvas, aspectLabel, type PrintProduct } from "~/lib/print-spec";
import {
  buildGridSlots, clonePiece, isImageSlot, isTextSlot, normalizeGridConfig, sortReadingOrder, validateSlots,
  type GridConfig, type ImageSlot, type Slot, type TemplateMockup, type TemplatePiece, type TextSlot,
} from "~/lib/slots";
import {
  LAYOUT_PRESETS, SINGLE_PIECE_ID, STUDIO_DEFAULT_GRID, nextSlotId, prefixSlotIds, presetSlots, rectFromMm, rectToMm,
  cardGridSlots, clampRect, layoutLetterSlots, mergeImageSlots, splitImageSlot, type LayoutPreset,
} from "~/lib/frame-studio";
import { MockupEditor } from "~/components/MockupEditor";
import { StudioCanvas } from "./StudioCanvas";
import { StudioInspector } from "./StudioInspector";
import { NumberField } from "./NumberField";
import { LetterPhotoForm, type LetterPhotoOptions } from "./LetterPhotoForm";
import { CardGridForm, type CardGridFormOptions } from "./CardGridForm";
import { useDict, useTranslation } from "~/i18n";
import studioDict from "~/i18n/studio/studio";

/**
 * Çerçeve Stüdyosu — bir fotoğraf ürününün baskı düzenini tek ekranda kurar.
 *
 * Eskiden aynı iş beş ayrı kartta yapılıyordu (ebat, slot tahtası, parça
 * editörü, metin alanları, mockup) ve kartlar birbirinin durumunu bilmiyordu.
 * Stüdyo hepsini tek durumda tutar: şablon her zaman bir parça listesidir, tek
 * parçalı şablon da "main" kimlikli tek parçadır. Kayıt biçimine çeviri
 * `piecesToTemplateFields` ile rotada yapılıyor.
 */

export interface StudioSavePayload {
  pieces: TemplatePiece[];
  grid_config: GridConfig;
  mockups: TemplateMockup[];
}

export interface NewSizeInput {
  name: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
  bleed_mm: number;
  safe_mm: number;
}

export interface FrameStudioProps {
  templateId: string;
  templateName: string;
  initialPieces: TemplatePiece[];
  initialGrid: GridConfig | null;
  initialMockups: TemplateMockup[];
  printProducts: PrintProduct[];
  saving: boolean;
  saveError?: string;
  /** Her başarılı kayıtta artar; kaydedilen hâl "temiz" sayılır */
  saveCount: number;
  onSave: (payload: StudioSavePayload) => void;
  onBack: () => void;
  creatingSize: boolean;
  createdSizeId?: string;
  onCreateSize: (input: NewSizeInput) => void;
}

interface History {
  pieces: TemplatePiece[];
  past: TemplatePiece[][];
  future: TemplatePiece[][];
  lastKey: string;
  lastAt: number;
}

const HISTORY_LIMIT = 60;

/** Otomatik verilen fotoğraf alanı adı mı ("3. Fotoğraf" / "Photo 3") */
const AUTO_PHOTO_LABEL = /^(\d+\. Fotoğraf|Photo \d+)$/;

export function FrameStudio({
  templateId, templateName, initialPieces, initialGrid, initialMockups, printProducts,
  saving, saveError, saveCount, onSave, onBack, creatingSize, createdSizeId, onCreateSize,
}: FrameStudioProps) {
  const L = useDict(studioDict);
  const { lang } = useTranslation();
  /**
   * Yardımcı kütüphanenin ürettiği varsayılan adlar Türkçe; yönetim ekranı
   * İngilizceyken yeni oluşturulan alanların adları İngilizceye çevrilir.
   */
  const localizeLabels = <T extends Slot>(list: T[]): T[] => (lang !== "en" ? list : list.map((x) => {
    let m = /^(\d+)\. Fotoğraf$/.exec(x.label);
    if (m) return { ...x, label: L.photoLabel(Number(m[1])) };
    m = /^(\d+)\. Fotoğraf \((.*)\)$/.exec(x.label);
    if (m) return { ...x, label: L.letterPhotoLabel(Number(m[1]), m[2]) };
    m = /^(\d+)\. kartın yazısı$/.exec(x.label);
    if (m) return { ...x, label: L.cardCaptionLabel(Number(m[1])) };
    return x;
  }));
  const [history, setHistory] = useState<History>({
    pieces: initialPieces, past: [], future: [], lastKey: "", lastAt: 0,
  });
  const pieces = history.pieces;
  const [activePieceId, setActivePieceId] = useState(initialPieces[0]?.id ?? SINGLE_PIECE_ID);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const select = (id: string | null) => setSelectedIds(id ? [id] : []);
  const [grid, setGrid] = useState<GridConfig>(() => (initialGrid ? normalizeGridConfig(initialGrid) : STUDIO_DEFAULT_GRID));
  const [mockups, setMockups] = useState<TemplateMockup[]>(initialMockups);
  const [view, setView] = useState<"design" | "mockups">("design");
  const [showOverlay, setShowOverlay] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [note, setNote] = useState<{ tone: "info" | "warning" | "critical" | "success"; text: string } | null>(null);
  const [uploading, setUploading] = useState<"" | "background_url" | "overlay_url">("");
  const [holeBusy, setHoleBusy] = useState(false);
  const [showGridSettings, setShowGridSettings] = useState(false);
  const [showLetters, setShowLetters] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [lastPreset, setLastPreset] = useState<LayoutPreset | null>(null);
  const [test, setTest] = useState<{
    busy: boolean; error?: string; images?: Array<{ id: string; name: string; url: string }>;
    issues?: Array<{ level: string; message: string }>;
  }>({ busy: false });

  const active = pieces.find((p) => p.id === activePieceId) ?? pieces[0];
  const product = printProducts.find((p) => p.id === active?.print_product_id) ?? null;
  const canvas = useMemo(() => (product ? printCanvas(product) : null), [product]);
  const dpi = product?.dpi ?? 300;
  const selectedSlots = active ? active.slots.filter((s) => selectedIds.includes(s.id)) : [];
  const selected = selectedSlots.length === 1 ? selectedSlots[0] : null;

  // ── Kirli durum ──────────────────────────────────────────────────────────
  const snapshot = JSON.stringify({ pieces, grid, mockups });
  // Temel hâl state'te: ref'te tutulduğunda kayıt bitince ekran yeniden
  // çizilmiyor ve "Kaydedilmemiş değişiklik" yazısı takılı kalıyordu.
  const [baseline, setBaseline] = useState(snapshot);
  const pendingSave = useRef<string | null>(null);
  useEffect(() => {
    if (pendingSave.current !== null) {
      setBaseline(pendingSave.current);
      pendingSave.current = null;
    }
  }, [saveCount]);
  const dirty = snapshot !== baseline;

  // Bilgi bildirimleri kendiliğinden kapanıyor; açık kaldıklarında üst şeridi
  // itip tıklanacak yerleri kaydırıyordu. Hata ve uyarılar kullanıcıda kalır.
  useEffect(() => {
    if (!note || (note.tone !== "success" && note.tone !== "info")) return;
    const t = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Geçmiş ───────────────────────────────────────────────────────────────
  /**
   * `key` verilirse ve son değişiklik aynı anahtarla bir saniye içinde
   * yapıldıysa yeni adım açılmaz: kutuya "120" yazmak üç ayrı geri alma adımı
   * olmamalı.
   */
  const commitPieces = useCallback((next: TemplatePiece[], key = "", before?: TemplatePiece[]) => {
    setHistory((h) => {
      const now = Date.now();
      const merge = key !== "" && key === h.lastKey && now - h.lastAt < 1000 && !before;
      return {
        pieces: next,
        past: merge ? h.past : [...h.past, before ?? h.pieces].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: key,
        lastAt: now,
      };
    });
  }, []);

  const undo = useCallback(() => setHistory((h) => (h.past.length === 0 ? h : {
    pieces: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.pieces, ...h.future],
    lastKey: "", lastAt: 0,
  })), []);
  const redo = useCallback(() => setHistory((h) => (h.future.length === 0 ? h : {
    pieces: h.future[0], past: [...h.past, h.pieces], future: h.future.slice(1), lastKey: "", lastAt: 0,
  })), []);

  function withActive(patch: (piece: TemplatePiece) => TemplatePiece, key = "") {
    if (!active) return;
    commitPieces(pieces.map((p) => (p.id === active.id ? patch(p) : p)), key);
  }

  function setSlots(slots: Slot[], key = "") {
    withActive((p) => ({ ...p, slots }), key);
  }

  function patchSlot(id: string, patch: Partial<ImageSlot> | Partial<TextSlot>, key = "") {
    withActive((p) => ({
      ...p,
      slots: p.slots.map((s) => (s.id === id ? ({ ...s, ...patch } as Slot) : s)),
    }), key);
  }

  // ── Alan işlemleri ───────────────────────────────────────────────────────
  function addImageSlot() {
    if (!active || !canvas) return;
    const id = nextSlotId(active, pieces, "photo");
    const order = active.slots.filter(isImageSlot).length + 1;
    const size = Math.min(canvas.trim.width, canvas.trim.height) * 0.4;
    const rect = clampRect({
      x: (canvas.canvasWidth - size) / 2 / canvas.canvasWidth,
      y: (canvas.canvasHeight - size) / 2 / canvas.canvasHeight,
      w: size / canvas.canvasWidth,
      h: size / canvas.canvasHeight,
    });
    const slot: ImageSlot = {
      id, kind: "image", source: id, rect, fit: "cover",
      allow: { pan: true, zoom: true, rotate: true },
      label: L.photoLabel(order), order,
    };
    setSlots([...active.slots, slot]);
    select(id);
  }

  function addTextSlot() {
    if (!active || !canvas) return;
    const id = nextSlotId(active, pieces, "text");
    const count = active.slots.filter(isTextSlot).length + 1;
    const trimBottom = (canvas.trim.y + canvas.trim.height) / canvas.canvasHeight;
    const slot: TextSlot = {
      id, kind: "text",
      rect: clampRect({ x: 0.15, y: trimBottom - 0.14, w: 0.7, h: 0.08 }),
      label: count === 1 ? L.firstTextLabel : L.textLabel(count),
      order: 100 + count,
      mode: "free",
      default_value: "",
      max_length: 30,
      // Kesilmiş üründe yaklaşık 12 mm punto
      font_size: ((12 / 25.4) * dpi) / canvas.canvasHeight,
      font_family: "Arial, Helvetica, sans-serif",
      color: "#1a1a1a",
      bold: false,
      align: "center",
      overflow: "shrink",
    };
    setSlots([...active.slots, slot]);
    select(id);
  }

  function deleteSlots(ids: string[]) {
    if (!active) return;
    // Silinen alanın fotoğrafını tekrarlayan alanlar kendi fotoğrafına döner
    const slots = active.slots
      .filter((s) => !ids.includes(s.id))
      .map((s) => (isImageSlot(s) && ids.includes(s.source) ? { ...s, source: s.id } : s));
    setSlots(slots);
    select(null);
  }

  function duplicateSlots(ids: string[]) {
    if (!active || !canvas) return;
    const working: TemplatePiece = { ...active, slots: [...active.slots] };
    const created: string[] = [];
    for (const src of active.slots.filter((s) => ids.includes(s.id))) {
      const newId = nextSlotId(working, pieces.map((p) => (p.id === working.id ? working : p)), isImageSlot(src) ? "photo" : "text");
      const offset = rectToMm(src.rect, canvas, dpi);
      const rect = clampRect(rectFromMm({ ...offset, x: offset.x + 5, y: offset.y + 5 }, canvas, dpi));
      const imageCount = working.slots.filter(isImageSlot).length + 1;
      const copy: Slot = isImageSlot(src)
        ? { ...src, id: newId, source: newId, rect, order: imageCount, label: L.photoLabel(imageCount) }
        : { ...src, id: newId, rect, label: L.copyLabel(src.label) };
      working.slots.push(copy);
      created.push(newId);
    }
    setSlots(working.slots);
    setSelectedIds(created);
  }

  function mergeSelected() {
    if (!active || !canvas) return;
    const result = mergeImageSlots(active.slots, selectedIds, canvas);
    if (!result) return;
    setSlots(result.slots);
    select(result.keptId);
    setNote({ tone: "success", text: L.merged });
  }

  function splitSelected(cols: number, rows: number, gapMm: number) {
    if (!active || !canvas || !selected || !isImageSlot(selected)) return;
    const working: TemplatePiece = { ...active, slots: [...active.slots] };
    const parts = splitImageSlot(selected, cols, rows, gapMm, canvas, dpi, () => {
      const id = nextSlotId(working, pieces.map((p) => (p.id === working.id ? working : p)), "photo");
      // Kimlik rezerve edilsin diye geçici kayıt; aşağıda gerçek parçalarla değişiyor
      working.slots.push({ ...selected, id, source: id });
      return id;
    });
    if (parts.length < 2) {
      setNote({ tone: "warning", text: L.splitTooSmall });
      return;
    }
    const index = active.slots.findIndex((x) => x.id === selected.id);
    const next = [...active.slots.slice(0, index), ...localizeLabels(parts), ...active.slots.slice(index + 1)];
    const images = sortReadingOrder(next.filter(isImageSlot))
      .map((x) => ({ ...x, label: AUTO_PHOTO_LABEL.test(x.label) || !x.label ? L.photoLabel(x.order) : x.label }));
    setSlots([...images, ...next.filter((x) => !isImageSlot(x))]);
    setSelectedIds(parts.map((x) => x.id));
  }

  function applyLetters(o: LetterPhotoOptions) {
    if (!active || !canvas) return;
    const base = o.replace ? active.slots.filter((s) => !isImageSlot(s)) : active.slots;
    const working: TemplatePiece = { ...active, slots: [...base] };
    const letters = layoutLetterSlots(o.glyphs, canvas, dpi, {
      marginMm: grid.margin_mm.top,
      gapMm: o.gapMm,
      heightRatio: o.heightRatio,
      strokeMm: o.strokeMm,
      position: o.position,
      makeId: () => {
        const id = nextSlotId(working, pieces.map((p) => (p.id === working.id ? working : p)), "photo");
        // Kimlik rezerve edilsin diye geçici kayıt; aşağıda gerçek alanlarla değişiyor
        working.slots.push({ id, kind: "image", source: id, rect: { x: 0, y: 0, w: 0.1, h: 0.1 }, fit: "cover", allow: { pan: true, zoom: true, rotate: true }, label: "", order: 0 });
        return id;
      },
    });
    if (letters.length === 0) {
      setNote({ tone: "warning", text: L.lettersNoFit });
      return;
    }
    const start = base.filter(isImageSlot).length;
    const numbered = letters.map((s, i) => ({ ...s, order: start + i + 1, label: L.letterPhotoLabel(start + i + 1, s.mask_label ?? "") }));
    setSlots([...base, ...numbered]);
    setSelectedIds(numbered.map((s) => s.id));
    setShowLetters(false);
    setNote(active.overlay_url
      ? { tone: "warning", text: L.lettersOverlay }
      : { tone: "success", text: L.lettersCreated(numbered.length) });
  }

  /**
   * Kart tabakası: her kart için fotoğraf (ve istenirse alt yazı) alanı.
   * Kesim çizgileri ızgara ayarına yazılıyor; baskı PDF'i işaretleri oradan
   * koyuyor.
   */
  function applyCards(o: CardGridFormOptions) {
    if (!active || !canvas) return;
    const kalan = o.replace ? [] : active.slots;
    const sonuc = cardGridSlots({
      cardWidthMm: o.cardWidthMm,
      cardHeightMm: o.cardHeightMm,
      marginMm: o.marginMm,
      captionMm: o.captionMm,
      gapMm: o.gapMm,
      limit: o.limit > 0 ? o.limit : undefined,
      startIndex: kalan.filter(isImageSlot).length,
    }, canvas, dpi);
    if (sonuc.count === 0) {
      setNote({ tone: "warning", text: L.cardsNoFit });
      return;
    }
    setSlots([...kalan, ...localizeLabels(sonuc.slots)]);
    setGrid({ ...grid, cut_mm: sonuc.cuts });
    setSelectedIds([]);
    setShowCards(false);
    setNote({
      tone: "success",
      text: L.cardsCreated(sonuc.count, sonuc.cols, sonuc.rows),
    });
  }

  function cardFit(o: CardGridFormOptions) {
    if (!canvas) return { cols: 0, rows: 0, count: 0 };
    const r = cardGridSlots({
      cardWidthMm: o.cardWidthMm,
      cardHeightMm: o.cardHeightMm,
      marginMm: o.marginMm,
      captionMm: o.captionMm,
      gapMm: o.gapMm,
    }, canvas, dpi);
    return { cols: r.cols, rows: r.rows, count: r.cols * r.rows };
  }

  function transformSelected(fn: (slots: Slot[]) => Slot[]) {
    if (!active) return;
    setSlots(fn(active.slots));
  }

  function renumber() {
    if (!active) return;
    const images = sortReadingOrder(active.slots.filter(isImageSlot))
      .map((s) => ({ ...s, label: AUTO_PHOTO_LABEL.test(s.label) || !s.label ? L.photoLabel(s.order) : s.label }));
    setSlots([...images, ...active.slots.filter((s) => !isImageSlot(s))]);
    setNote({ tone: "info", text: L.renumbered });
  }

  function applyPreset(preset: LayoutPreset, base = grid) {
    if (!active || !canvas) return;
    const { slots, grid: nextGrid } = presetSlots(preset, base, canvas, dpi);
    if (slots.length === 0) {
      setNote({ tone: "warning", text: L.gapsNoFit });
      return;
    }
    const texts = active.slots.filter((s) => !isImageSlot(s));
    setSlots([...prefixSlotIds(localizeLabels(slots), active, pieces), ...texts]);
    setGrid(nextGrid);
    setLastPreset(preset);
    select(null);
    setNote({ tone: "success", text: L.presetApplied(lang === "en" ? preset.labelEn : preset.label) });
  }

  function regenerateGrid() {
    if (!active || !canvas) return;
    const slots = buildGridSlots(grid, canvas, dpi);
    if (slots.length === 0) {
      setNote({ tone: "warning", text: L.gapsNoFit });
      return;
    }
    const texts = active.slots.filter((s) => !isImageSlot(s));
    setSlots([...prefixSlotIds(localizeLabels(slots), active, pieces), ...texts]);
    select(null);
  }

  // ── Görseller ────────────────────────────────────────────────────────────
  async function uploadLayer(file: File, field: "background_url" | "overlay_url") {
    if (!active) return;
    setUploading(field);
    setNote(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("folder", field === "overlay_url" ? "personalizer-overlay" : "personalizer-template");
      fd.append("_lang", lang);
      const res = await fetch("/api/personalizer/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || L.imageUploadFailed);
      withActive((p) => ({ ...p, [field]: data.url }));
    } catch (err) {
      setNote({ tone: "critical", text: err instanceof Error ? err.message : L.imageUploadFailed });
    } finally {
      setUploading("");
    }
  }

  /** Tasarımdaki şeffaf deliklerden şekilli alan üretir (sunucuda taranır) */
  async function detectHoles() {
    if (!active) return;
    const url = active.background_url || active.overlay_url;
    if (!url) return;
    setHoleBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/personalizer/detect-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateUrl: url, expected: 0, _lang: lang }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || L.scanFailed);
      if (!data.found) {
        setNote({ tone: "warning", text: data.message || L.noHolesFound });
        return;
      }
      const texts = active.slots.filter((s) => !isImageSlot(s));
      setSlots([...prefixSlotIds(localizeLabels(data.slots as Slot[]), active, pieces), ...texts]);
      select(null);
      setNote({ tone: "success", text: L.holesFound(data.slots.length) });
    } catch (err) {
      setNote({ tone: "critical", text: err instanceof Error ? err.message : L.scanFailed });
    } finally {
      setHoleBusy(false);
    }
  }

  // ── Parçalar (set) ───────────────────────────────────────────────────────
  function addPiece() {
    if (!active) return;
    let list = pieces;
    let source = active;
    // Tek parçalı şablon sete dönüşürken ilk parça "frame_1" olur; slot
    // kimlikleri önek almadığı için değişmez.
    if (list.length === 1 && list[0].id === SINGLE_PIECE_ID) {
      source = { ...list[0], id: "frame_1", name: L.pieceName(1) };
      list = [source];
    }
    const n = list.length + 1;
    let id = `frame_${n}`;
    let k = n;
    while (list.some((p) => p.id === id)) id = `frame_${++k}`;
    const copy = clonePiece(source, id, L.pieceName(n), n);
    commitPieces([...list, copy]);
    setActivePieceId(id);
    select(null);
  }

  function removePiece(id: string) {
    let rest = pieces.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i + 1 }));
    // Tek parça kalınca normal şablona döner; ilk parçanın slotları önek
    // taşımadığı için kimlikler geçerli kalır. Önekli bir parça kaldıysa set
    // olarak bırakıyoruz.
    if (rest.length === 1 && !rest[0].slots.some((s) => s.id.includes("__"))) {
      rest = [{ ...rest[0], id: SINGLE_PIECE_ID }];
    }
    commitPieces(rest);
    setActivePieceId(rest[0]?.id ?? SINGLE_PIECE_ID);
    select(null);
  }

  // ── Ölçü ─────────────────────────────────────────────────────────────────
  const [sizeDraft, setSizeDraft] = useState<null | { width: string; height: string; bleed: string; safe: string; dpi: string }>(null);
  const lastCreated = useRef<string | undefined>(createdSizeId);
  useEffect(() => {
    if (createdSizeId && createdSizeId !== lastCreated.current) {
      lastCreated.current = createdSizeId;
      withActive((p) => ({ ...p, print_product_id: createdSizeId }));
      setSizeDraft(null);
    }
  }, [createdSizeId]);

  function changeSize(id: string) {
    if (!active) return;
    const nextProduct = printProducts.find((p) => p.id === id);
    const current = product;
    withActive((p) => ({ ...p, print_product_id: id }));
    if (nextProduct && current && Math.abs(nextProduct.width_mm / nextProduct.height_mm - current.width_mm / current.height_mm) > 0.01 && active.slots.length > 0) {
      setNote({
        tone: "warning",
        text: L.aspectChanged,
      });
    }
  }

  // ── Klavye ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable=true]"))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      if (!active || !canvas) return;
      if (mod && e.key.toLowerCase() === "a" && view === "design") {
        e.preventDefault();
        setSelectedIds(active.slots.map((s) => s.id));
        return;
      }
      if (selectedSlots.length === 0) return;
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSlots(selectedIds); return; }
      if (mod && e.key.toLowerCase() === "g" && selectedSlots.filter(isImageSlot).length > 1) {
        e.preventDefault();
        mergeSelected();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSlots(selectedIds); return; }
      if (e.key === "Escape") { select(null); return; }
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (delta) {
        e.preventDefault();
        const dx = ((delta[0] / 25.4) * dpi) / canvas.canvasWidth;
        const dy = ((delta[1] / 25.4) * dpi) / canvas.canvasHeight;
        withActive((p) => ({
          ...p,
          slots: p.slots.map((s) => {
            if (!selectedIds.includes(s.id)) return s;
            const moved = { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy };
            return { ...s, rect: s.rotation ? moved : clampRect(moved) };
          }),
        }), `nudge:${selectedIds.join(",")}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Kayıt ve deneme ──────────────────────────────────────────────────────
  function save() {
    if (saving) return;
    pendingSave.current = snapshot;
    onSave({ pieces, grid_config: grid, mockups });
  }

  async function runTest() {
    setTest({ busy: true });
    try {
      const res = await fetch("/api/personalizer/test-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, _lang: lang }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || L.testFailed);
      setTest({
        busy: false,
        images: data.pieces ?? [{ id: "main", name: "", url: data.url }],
        issues: data.issues,
      });
    } catch (err) {
      setTest({ busy: false, error: err instanceof Error ? err.message : L.testFailed });
    }
  }

  const issues = useMemo(() => (canvas && active ? validateSlots(active.slots, canvas, { lang }) : []), [canvas, active, lang]);
  const missingSize = pieces.filter((p) => !p.print_product_id);

  // Hazır düzen küçük resimleri etkin ölçüye göre çiziliyor: dikey bir
  // çerçevede "2 fotoğraf" alt alta görünmeli.
  const presetThumbs = useMemo(() => {
    if (!canvas) return [];
    return LAYOUT_PRESETS.map((preset) => ({
      preset,
      slots: presetSlots(preset, grid, canvas, dpi).slots,
    }));
  }, [canvas, grid, dpi]);

  const layerInputs = { background_url: useRef<HTMLInputElement>(null), overlay_url: useRef<HTMLInputElement>(null) };

  if (!active) return null;

  return (
    <div className="fs-shell">
      {/* ── Araç çubuğu ── */}
      <header className="fs-toolbar">
        <div className="fs-toolbar-start">
          <Button
            variant="tertiary"
            onClick={() => {
              if (dirty && !window.confirm(L.confirmLeave)) return;
              onBack();
            }}
          >
            {L.backToTemplate}
          </Button>
          <div className="fs-title">
            <Text as="h1" variant="headingMd" truncate>{templateName || L.untitledTemplate}</Text>
            <Text as="span" tone="subdued" variant="bodySm">{L.studioName}</Text>
          </div>
        </div>

        <div className="fs-toolbar-center">
          <ButtonGroup variant="segmented">
            <Button pressed={view === "design"} onClick={() => setView("design")}>{L.tabDesign}</Button>
            <Button pressed={view === "mockups"} onClick={() => setView("mockups")}>
              {mockups.length > 0 ? L.tabMockupsCount(mockups.length) : L.tabMockups}
            </Button>
          </ButtonGroup>
          {view === "design" && (
            <ButtonGroup variant="segmented">
              <Button onClick={undo} disabled={history.past.length === 0}>{L.undo}</Button>
              <Button onClick={redo} disabled={history.future.length === 0}>{L.redo}</Button>
            </ButtonGroup>
          )}
        </div>

        <div className="fs-toolbar-end">
          <span className={`fs-save-state${dirty ? " is-dirty" : ""}`} aria-live="polite">
            {saving ? L.saving : dirty ? L.unsaved : L.saved}
          </span>
          <Button
            onClick={runTest}
            loading={test.busy}
            disabled={dirty || missingSize.length > 0}
          >
            {L.testPrint}
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>{L.save}</Button>
        </div>
      </header>

      {saveError && <div className="fs-banner"><Banner tone="critical">{saveError}</Banner></div>}
      {note && (
        <div className="fs-banner">
          <Banner tone={note.tone} onDismiss={() => setNote(null)}>{note.text}</Banner>
        </div>
      )}

      {/* ── Set sekmeleri ── */}
      {view === "design" && (
        <nav className="fs-pieces" aria-label={L.piecesNav}>
          {pieces.length > 1 ? pieces.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`fs-piece-tab${p.id === active.id ? " is-active" : ""}`}
              onClick={() => { setActivePieceId(p.id); select(null); }}
            >
              {p.name}
              <span className="fs-piece-count">{p.slots.filter(isImageSlot).length}</span>
            </button>
          )) : (
            <Text as="span" tone="subdued" variant="bodySm">{L.singlePiece}</Text>
          )}
          <Button size="slim" variant="plain" onClick={addPiece}>
            {pieces.length > 1 ? L.addPiece : L.makeSet}
          </Button>
        </nav>
      )}

      {view === "mockups" ? (
        <div className="fs-mockups">
          <MockupEditor
            mockups={mockups}
            onChange={setMockups}
            designAspect={canvas ? canvas.canvasWidth / canvas.canvasHeight : undefined}
          />
        </div>
      ) : (
        <div className="fs-body">
          {/* ── Sol panel ── */}
          <aside className="fs-panel fs-panel-left" aria-label={L.leftPanel}>
            <section className="fs-section">
              <Text as="h2" variant="headingSm">{pieces.length > 1 ? L.pieceSize(active.name) : L.size}</Text>
              {pieces.length > 1 && (
                <TextField
                  label={L.pieceNameLabel}
                  autoComplete="off"
                  value={active.name}
                  onChange={(v) => withActive((p) => ({ ...p, name: v }), `piece-name:${active.id}`)}
                />
              )}
              {printProducts.length > 0 && (
                <Select
                  label={L.printSize}
                  labelHidden={pieces.length <= 1}
                  options={[
                    { label: L.chooseSize, value: "" },
                    ...printProducts.map((p) => ({
                      label: `${p.name} (${p.width_mm / 10}×${p.height_mm / 10} cm, ${aspectLabel(p.width_mm / p.height_mm)})`,
                      value: p.id,
                    })),
                  ]}
                  value={active.print_product_id}
                  onChange={changeSize}
                />
              )}
              {sizeDraft ? (
                <div className="fs-size-form">
                  <div className="fs-grid-2">
                    <TextField label={L.width} type="number" suffix="cm" autoComplete="off" value={sizeDraft.width}
                      onChange={(v) => setSizeDraft({ ...sizeDraft, width: v })} />
                    <TextField label={L.height} type="number" suffix="cm" autoComplete="off" value={sizeDraft.height}
                      onChange={(v) => setSizeDraft({ ...sizeDraft, height: v })} />
                    <TextField label={L.bleed} type="number" suffix="mm" autoComplete="off" value={sizeDraft.bleed}
                      onChange={(v) => setSizeDraft({ ...sizeDraft, bleed: v })} />
                    <TextField label={L.safeArea} type="number" suffix="mm" autoComplete="off" value={sizeDraft.safe}
                      onChange={(v) => setSizeDraft({ ...sizeDraft, safe: v })} />
                  </div>
                  <TextField label={L.resolution} type="number" suffix="dpi" autoComplete="off" value={sizeDraft.dpi}
                    onChange={(v) => setSizeDraft({ ...sizeDraft, dpi: v })}
                    helpText={L.sizeHelp} />
                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      loading={creatingSize}
                      disabled={!(Number(sizeDraft.width.replace(",", ".")) > 0 && Number(sizeDraft.height.replace(",", ".")) > 0)}
                      onClick={() => {
                        const w = Number(sizeDraft.width.replace(",", ".")) * 10;
                        const h = Number(sizeDraft.height.replace(",", ".")) * 10;
                        onCreateSize({
                          name: `${sizeDraft.width}×${sizeDraft.height} cm`,
                          width_mm: w,
                          height_mm: h,
                          dpi: Math.round(Number(sizeDraft.dpi) || 300),
                          bleed_mm: Math.max(0, Number(sizeDraft.bleed.replace(",", ".")) || 0),
                          safe_mm: Math.max(0, Number(sizeDraft.safe.replace(",", ".")) || 0),
                        });
                      }}
                    >
                      {L.addSize}
                    </Button>
                    <Button onClick={() => setSizeDraft(null)}>{L.cancel}</Button>
                  </InlineStack>
                </div>
              ) : (
                <Button
                  variant="plain"
                  onClick={() => setSizeDraft({ width: "30", height: "40", bleed: "3", safe: "5", dpi: "300" })}
                >
                  {L.newSize}
                </Button>
              )}
            </section>

            {canvas && (
              <>
                <section className="fs-section">
                  <Text as="h2" variant="headingSm">{L.presets}</Text>
                  <div className="fs-presets">
                    {presetThumbs.map(({ preset, slots }) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`fs-preset${lastPreset?.id === preset.id ? " is-active" : ""}`}
                        onClick={() => applyPreset(preset)}
                        title={lang === "en" ? preset.labelEn : preset.label}
                      >
                        <svg viewBox={`0 0 100 ${(100 / canvas.aspect).toFixed(2)}`} aria-hidden="true">
                          <rect x="0" y="0" width="100" height={100 / canvas.aspect} className="fs-preset-bg" />
                          {slots.map((s) => (
                            <rect key={s.id} x={s.rect.x * 100} y={s.rect.y * (100 / canvas.aspect)}
                              width={s.rect.w * 100} height={s.rect.h * (100 / canvas.aspect)} className="fs-preset-slot" />
                          ))}
                        </svg>
                        <span>{lang === "en" ? preset.labelEn : preset.label}</span>
                      </button>
                    ))}
                  </div>
                  <Button variant="plain" onClick={() => setShowGridSettings((v) => !v)} ariaExpanded={showGridSettings}>
                    {showGridSettings ? L.hideGapSettings : L.gapSettings}
                  </Button>
                  {showGridSettings && (
                    <BlockStack gap="200">
                      <div className="fs-grid-2">
                        <NumberField label={L.margin} value={grid.margin_mm.top} min={0}
                          onCommit={(v) => setGrid({ ...grid, margin_mm: { top: v, right: v, bottom: grid.margin_mm.bottom === grid.margin_mm.top ? v : grid.margin_mm.bottom, left: v } })} />
                        <NumberField label={L.bottomMargin} value={grid.margin_mm.bottom} min={0}
                          onCommit={(v) => setGrid({ ...grid, margin_mm: { ...grid.margin_mm, bottom: v } })} />
                        <NumberField label={L.gapX} value={grid.gap_x_mm} min={0}
                          onCommit={(v) => setGrid({ ...grid, gap_x_mm: v })} />
                        <NumberField label={L.gapY} value={grid.gap_y_mm} min={0}
                          onCommit={(v) => setGrid({ ...grid, gap_y_mm: v })} />
                        <NumberField label={L.columns} suffix="" step={1} value={grid.cols} min={1}
                          onCommit={(v) => setGrid({ ...grid, cols: Math.max(1, Math.round(v)), merges: [] })} />
                        <NumberField label={L.rows} suffix="" step={1} value={grid.rows} min={1}
                          onCommit={(v) => setGrid({ ...grid, rows: Math.max(1, Math.round(v)), merges: [] })} />
                      </div>
                      <NumberField label={L.cornerRadius} value={grid.corner_radius_mm} min={0}
                        onCommit={(v) => setGrid({ ...grid, corner_radius_mm: v })} />
                      <Text as="p" tone="subdued" variant="bodySm">
                        {L.bottomMarginHint}
                      </Text>
                      <Button onClick={() => (lastPreset && lastPreset.grid(canvas).cols === grid.cols && lastPreset.grid(canvas).rows === grid.rows
                        ? applyPreset(lastPreset, grid)
                        : regenerateGrid())}
                      >
                        {L.regenerate(buildGridSlots(grid, canvas, dpi).length)}
                      </Button>
                    </BlockStack>
                  )}
                </section>

                <section className="fs-section">
                  <Text as="h2" variant="headingSm">{L.add}</Text>
                  <div className="fs-grid-2">
                    <Button onClick={addImageSlot}>{L.photoSlot}</Button>
                    <Button onClick={addTextSlot}>{L.textSlot}</Button>
                  </div>
                  {showLetters ? (
                    <LetterPhotoForm onApply={applyLetters} onCancel={() => setShowLetters(false)} />
                  ) : (
                    <Button onClick={() => setShowLetters(true)} fullWidth>
                      {L.letterPhotos}
                    </Button>
                  )}
                  {showCards ? (
                    <CardGridForm fits={cardFit} onApply={applyCards} onCancel={() => setShowCards(false)} />
                  ) : (
                    <Button onClick={() => setShowCards(true)} fullWidth>
                      {L.cardSheet}
                    </Button>
                  )}
                </section>

                <section className="fs-section">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingSm">{L.layers}</Text>
                    {active.slots.filter(isImageSlot).length > 1 && (
                      <Button variant="plain" onClick={renumber}>{L.fixOrder}</Button>
                    )}
                  </InlineStack>
                  {active.slots.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">{L.noSlots}</Text>
                  ) : (
                    <ul className="fs-layers">
                      {[...active.slots]
                        .sort((a, b) => (isImageSlot(a) === isImageSlot(b) ? a.order - b.order : isImageSlot(a) ? -1 : 1))
                        .map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className={`fs-layer${selectedIds.includes(s.id) ? " is-selected" : ""}`}
                              onClick={(e) => setSelectedIds(e.shiftKey || e.metaKey || e.ctrlKey
                                ? (selectedIds.includes(s.id) ? selectedIds.filter((id) => id !== s.id) : [...selectedIds, s.id])
                                : [s.id])}
                            >
                              <span className={`fs-layer-badge ${isImageSlot(s) ? "is-image" : "is-text"}`}>
                                {isImageSlot(s) ? s.order : "T"}
                              </span>
                              <span className="fs-layer-name">{s.label || s.id}</span>
                              {isImageSlot(s) && s.source !== s.id && <Badge size="small">{L.repeatBadge}</Badge>}
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </section>

                <section className="fs-section">
                  <Text as="h2" variant="headingSm">{L.designImages}</Text>
                  {(["background_url", "overlay_url"] as const).map((field) => (
                    <div key={field} className="fs-asset">
                      <div className="fs-asset-thumb">
                        {active[field] ? <img src={active[field]} alt="" /> : <span aria-hidden="true">—</span>}
                      </div>
                      <div className="fs-asset-body">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {field === "background_url" ? L.background : L.overlay}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {field === "background_url" ? L.backgroundHint : L.overlayHint}
                        </Text>
                        <InlineStack gap="200">
                          <input
                            ref={layerInputs[field]}
                            type="file"
                            accept={field === "overlay_url" ? "image/png,image/webp" : "image/png,image/jpeg,image/webp"}
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void uploadLayer(f, field);
                            }}
                          />
                          <Button size="slim" loading={uploading === field} onClick={() => layerInputs[field].current?.click()}>
                            {active[field] ? L.replace : L.upload}
                          </Button>
                          {active[field] && (
                            <Button size="slim" variant="plain" tone="critical"
                              onClick={() => withActive((p) => ({ ...p, [field]: undefined }))}>
                              {L.remove}
                            </Button>
                          )}
                        </InlineStack>
                      </div>
                    </div>
                  ))}
                  {(active.background_url || active.overlay_url) && (
                    <Button onClick={detectHoles} loading={holeBusy}>{L.detectHoles}</Button>
                  )}
                  <Checkbox label={L.showOverlay} checked={showOverlay} onChange={setShowOverlay}
                    disabled={!active.overlay_url} />
                  <Checkbox label={L.showGuides} checked={showGuides} onChange={setShowGuides} />
                </section>

                {pieces.length > 1 && (
                  <section className="fs-section">
                    <Button tone="critical" variant="plain" onClick={() => removePiece(active.id)}>
                      {L.deletePiece(active.name)}
                    </Button>
                  </section>
                )}
              </>
            )}
          </aside>

          {/* ── Tuval ── */}
          <main className="fs-center">
            {canvas ? (
              <>
                <StudioCanvas
                  canvas={canvas}
                  slots={active.slots}
                  selectedIds={selectedIds}
                  onSelect={setSelectedIds}
                  onLive={(slots) => setHistory((h) => ({
                    ...h, pieces: h.pieces.map((p) => (p.id === active.id ? { ...p, slots } : p)),
                  }))}
                  onCommit={(slots, before) => commitPieces(
                    pieces.map((p) => (p.id === active.id ? { ...p, slots } : p)),
                    "",
                    pieces.map((p) => (p.id === active.id ? { ...p, slots: before } : p)),
                  )}
                  backgroundUrl={active.background_url}
                  overlayUrl={active.overlay_url}
                  showOverlay={showOverlay}
                  showGuides={showGuides}
                />
                <div className="fs-canvas-meta">
                  {product && L.canvasMeta(product.width_mm / 10, product.height_mm / 10, product.bleed_mm, product.safe_mm, product.dpi)}
                  {showGuides && (
                    <span className="fs-legend">
                      <i className="is-trim" /> {L.legendTrim} <i className="is-safe" /> {L.legendSafe}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="fs-empty">
                <Text as="h2" variant="headingMd">{L.pickSizeFirst}</Text>
                <Text as="p" tone="subdued">
                  {L.pickSizeFirstBody}
                </Text>
              </div>
            )}
          </main>

          {/* ── Sağ panel ── */}
          <aside className="fs-panel fs-panel-right" aria-label={L.rightPanel}>
            {(test.images || test.error) && (
              <section className="fs-section">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingSm">{L.testPrint}</Text>
                  <Button variant="plain" onClick={() => setTest({ busy: false })}>{L.close}</Button>
                </InlineStack>
                {test.error && <Banner tone="critical">{test.error}</Banner>}
                {test.issues && test.issues.length > 0 && (
                  <Banner tone={test.issues.some((i) => i.level === "error") ? "critical" : "warning"}>
                    <ul className="fs-list">{test.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
                  </Banner>
                )}
                {test.images?.map((img) => (
                  <figure key={img.id} className="fs-test-image">
                    <a href={img.url} target="_blank" rel="noreferrer"><img src={img.url} alt={img.name || L.testPrint} /></a>
                    {img.name && <figcaption>{img.name}</figcaption>}
                  </figure>
                ))}
              </section>
            )}
            {canvas ? (
              <section className="fs-section">
                <StudioInspector
                  canvas={canvas}
                  dpi={dpi}
                  slots={active.slots}
                  selected={selected}
                  selectedSlots={selectedSlots}
                  issues={issues}
                  onPatchSlot={patchSlot}
                  onDelete={() => deleteSlots(selectedIds)}
                  onDuplicate={() => duplicateSlots(selectedIds)}
                  onSelect={select}
                  onMerge={mergeSelected}
                  onSplit={splitSelected}
                  onTransform={transformSelected}
                />
              </section>
            ) : null}
            {missingSize.length > 0 && pieces.length > 1 && (
              <section className="fs-section">
                <Banner tone="warning">
                  {L.missingSize(missingSize.map((p) => p.name).join(", "))}
                </Banner>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
