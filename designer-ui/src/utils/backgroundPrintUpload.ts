/**
 * Baskı dosyasının sepete eklendikten sonra arka planda yüklenmesi.
 *
 * 300 DPI baskı dosyası 6-17 MB ve müşterinin yükleme hızıyla 20+ saniye
 * sürüyordu; müşteri bu süre boyunca "Sepete ekle" düğmesinde bekliyordu.
 * Artık sunucudan önce bir R2 adresi ayrılıyor, ürün o adresle hemen sepete
 * ekleniyor ve dosya bu kuyrukta yükleniyor.
 *
 * Sayfa değişirse tarayıcı yüklemeyi keser. Bu yüzden "Sepete git / Ödemeye geç"
 * kuyruk boşalana kadar bekler ve yükleme sürerken sekme kapatılırsa uyarılır.
 * Yine de tamamlanmazsa sipariş ekranı dosyayı "eksik" gösterir.
 */

export type PrintUploadSide = 'front-print' | 'back-print';

export interface PrintReservation {
  side: PrintUploadSide;
  key: string;
  url: string;
}

type ItemStatus = 'uploading' | 'done' | 'failed';

interface UploadItem {
  id: number;
  side: PrintUploadSide;
  key: string;
  dataUrl: string;
  loaded: number;
  total: number;
  status: ItemStatus;
  startedAt: number;
  finishedAt?: number;
  serverMs?: number;
  kb?: number;
  attempts: number;
  error?: string;
}

export interface PrintUploadSummary {
  /** Henüz bitmemiş yükleme sayısı */
  pending: number;
  /** Başarısız ve yeniden denenmeyi bekleyen yükleme sayısı */
  failed: number;
  /** 0-1 arası toplam ilerleme (yalnız bekleyen ve başarısızlar) */
  progress: number;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1500, 4000];

export async function reservePrintUploads(sides: PrintUploadSide[]): Promise<PrintReservation[] | null> {
  if (!sides.length) return [];
  try {
    const res = await fetch('/apps/tshirt-designer/reserve-print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sides }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { reservations?: PrintReservation[] };
    const reservations = data.reservations ?? [];
    return sides.every((side) => reservations.some((r) => r.side === side)) ? reservations : null;
  } catch {
    return null;
  }
}

function postWithProgress(
  form: FormData,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ status: number; body: { url?: string; serverMs?: number; error?: string } | null }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/apps/tshirt-designer/upload');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* boş gövde */ }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.ontimeout = () => resolve({ status: 0, body: null });
    xhr.timeout = 10 * 60_000;
    xhr.send(form);
  });
}

type Listener = () => void;

class PrintUploadQueue {
  private items = new Map<number, UploadItem>();
  private listeners = new Set<Listener>();
  private nextId = 1;
  private summary: PrintUploadSummary = { pending: 0, failed: 0, progress: 1 };

  /** Tamamlanan her yükleme için çağrılır (analitik) */
  onItemFinished: ((item: { side: string; kb: number; ms: number; serverMs?: number; ok: boolean; attempts: number }) => void) | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSummary = () => this.summary;

  private emit() {
    let pending = 0, failed = 0, loaded = 0, total = 0;
    for (const item of this.items.values()) {
      if (item.status === 'done') continue;
      if (item.status === 'uploading') pending++;
      else failed++;
      loaded += item.loaded;
      total += item.total || 1;
    }
    const progress = pending + failed === 0 ? 1 : Math.min(1, loaded / Math.max(total, 1));
    this.summary = { pending, failed, progress };
    for (const listener of this.listeners) listener();
  }

  start(reservation: PrintReservation, dataUrl: string) {
    const item: UploadItem = {
      id: this.nextId++, side: reservation.side, key: reservation.key, dataUrl,
      loaded: 0, total: 0, status: 'uploading', startedAt: performance.now(), attempts: 0,
    };
    this.items.set(item.id, item);
    this.emit();
    void this.run(item);
  }

  retryFailed() {
    for (const item of this.items.values()) {
      if (item.status !== 'failed') continue;
      item.status = 'uploading';
      item.attempts = 0;
      item.loaded = 0;
      item.error = undefined;
      void this.run(item);
    }
    this.emit();
  }

  private async run(item: UploadItem) {
    let blob: Blob;
    try {
      blob = await fetch(item.dataUrl).then((r) => r.blob());
    } catch (err) {
      this.fail(item, String(err));
      return;
    }
    item.total = blob.size;
    item.kb = Math.round(blob.size / 1024);

    while (item.attempts < MAX_ATTEMPTS) {
      item.attempts++;
      item.loaded = 0;
      const form = new FormData();
      form.append('image', blob, `${item.side}.png`);
      form.append('side', item.side);
      form.append('reservation', item.key);
      const { status, body } = await postWithProgress(form, (loaded, total) => {
        item.loaded = loaded;
        item.total = total;
        this.emit();
      });
      if (status >= 200 && status < 300 && body?.url) {
        item.status = 'done';
        item.finishedAt = performance.now();
        item.serverMs = body.serverMs;
        item.loaded = item.total;
        item.dataUrl = ''; // belleği bırak
        this.emit();
        this.onItemFinished?.({ side: item.side, kb: item.kb ?? 0, ms: Math.round(item.finishedAt - item.startedAt), serverMs: item.serverMs, ok: true, attempts: item.attempts });
        return;
      }
      // Rezervasyon geçersizse yeniden denemenin anlamı yok
      if (status === 409) break;
      const delay = RETRY_DELAYS_MS[item.attempts - 1];
      if (delay && item.attempts < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, delay));
    }
    this.fail(item, `upload failed after ${item.attempts} attempts`);
  }

  private fail(item: UploadItem, error: string) {
    item.status = 'failed';
    item.error = error;
    this.emit();
    this.onItemFinished?.({ side: item.side, kb: item.kb ?? 0, ms: Math.round(performance.now() - item.startedAt), ok: false, attempts: item.attempts });
  }
}

export const printUploadQueue = new PrintUploadQueue();
