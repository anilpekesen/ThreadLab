import { create } from 'zustand';
import type { Side, LeftTab, UploadedImage, SavedDesign, DesignerConfig } from '@/types';
import {
  customerLoggedIn, fetchServerDesigns, pushServerDesign, deleteServerDesign,
  migrationDone, markMigrationDone,
} from '@/utils/savedDesignsSync';

const IMAGES_KEY = 'bkf_uploaded_images';
const SAVED_KEY = 'bkf_saved_designs';

interface CanvasState {
  frontJson: string;
  backJson: string;
}

interface DesignerState {
  config: DesignerConfig | null;
  activeSide: Side;
  activeTab: LeftTab;
  sizeQuantities: Record<string, number>;
  uploadedImages: UploadedImage[];
  savedDesigns: SavedDesign[];
  canvasState: CanvasState;
  selectedObjectId: string | null;
  isBgRemoving: boolean;
  printSide: 'single' | 'double';

  setConfig: (c: DesignerConfig) => void;
  setActiveSide: (s: Side) => void;
  setActiveTab: (t: LeftTab) => void;
  setSizeQuantity: (size: string, qty: number) => void;
  addUploadedImage: (img: UploadedImage) => void;
  removeUploadedImage: (id: string) => void;
  addSavedDesign: (d: SavedDesign) => void;
  removeSavedDesign: (id: string) => void;
  setCanvasJson: (side: Side, json: string) => void;
  setSelectedObjectId: (id: string | null) => void;
  setIsBgRemoving: (v: boolean) => void;
  setPrintSide: (v: 'single' | 'double') => void;
}

function loadImages(): UploadedImage[] {
  try { return JSON.parse(localStorage.getItem(IMAGES_KEY) || '[]'); } catch { return []; }
}

function loadSaved(): SavedDesign[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}

export const useDesignerStore = create<DesignerState>((set, get) => ({
  config: null,
  activeSide: 'front',
  activeTab: 'image',
  sizeQuantities: {},
  uploadedImages: loadImages(),
  savedDesigns: loadSaved(),
  canvasState: { frontJson: '', backJson: '' },
  selectedObjectId: null,
  isBgRemoving: false,
  printSide: 'single',

  setConfig: (config) => set({ config }),
  setActiveSide: (activeSide) => set({ activeSide }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSizeQuantity: (size, qty) => set((s) => ({
    sizeQuantities: { ...s.sizeQuantities, [size]: Math.max(0, qty) },
  })),

  addUploadedImage: (img) => {
    const images = [img, ...get().uploadedImages].slice(0, 30);
    set({ uploadedImages: images });
    try { localStorage.setItem(IMAGES_KEY, JSON.stringify(images)); } catch {}
  },

  removeUploadedImage: (id) => {
    const images = get().uploadedImages.filter((i) => i.id !== id);
    set({ uploadedImages: images });
    try { localStorage.setItem(IMAGES_KEY, JSON.stringify(images)); } catch {}
  },

  addSavedDesign: (design) => {
    const designs = [design, ...get().savedDesigns].slice(0, 20);
    set({ savedDesigns: designs });
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(designs)); } catch {}
    pushServerDesign(design);
  },

  removeSavedDesign: (id) => {
    const designs = get().savedDesigns.filter((d) => d.id !== id);
    set({ savedDesigns: designs });
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(designs)); } catch {}
    deleteServerDesign(id);
  },

  setCanvasJson: (side, json) => {
    set((s) => ({
      canvasState: {
        ...s.canvasState,
        [`${side}Json`]: json,
      },
    }));
  },

  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setIsBgRemoving: (v) => set({ isBgRemoving: v }),
  setPrintSide: (v) => set({ printSide: v }),
}));

// Giriş yapmış müşteri: kayıtlı tasarımları hesabından yükle. localStorage'daki
// eski kayıtlar ilk girişte bir defalık hesaba taşınır; sonrasında hesap (sunucu)
// tek doğruluk kaynağıdır. Misafir kullanıcılar localStorage ile devam eder.
if (customerLoggedIn) {
  fetchServerDesigns()
    .then((remote) => {
      let designs = remote;
      if (!migrationDone()) {
        const remoteIds = new Set(remote.map((d) => d.id));
        const localOnly = useDesignerStore.getState().savedDesigns.filter((d) => !remoteIds.has(d.id));
        localOnly.forEach(pushServerDesign);
        markMigrationDone();
        designs = [...localOnly, ...remote]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 20);
      }
      useDesignerStore.setState({ savedDesigns: designs });
    })
    .catch(() => {});
}
