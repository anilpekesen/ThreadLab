import type { SavedDesign } from '@/types';

// Tasarımcı app proxy iframe'i üzerinden açıldığında URL, Shopify'ın imzaladığı
// query parametrelerini taşır (signature + logged_in_customer_id + shop).
// Bu imzalı string'i API'ye aynen geri göndeririz; sunucu HMAC ile doğrular.
const search = typeof window !== 'undefined' ? window.location.search : '';
const params = new URLSearchParams(search);
const customerId = params.get('logged_in_customer_id') ?? '';

export const customerLoggedIn = /^\d+$/.test(customerId) && !!params.get('signature');

// iframe app.printlabapp.com'dan servis edildiği için relative path yeterli
const API = '/api/storefront/saved-designs';

export async function fetchServerDesigns(): Promise<SavedDesign[]> {
  if (!customerLoggedIn) return [];
  const res = await fetch(`${API}?pq=${encodeURIComponent(search)}`);
  if (!res.ok) throw new Error(`saved-designs GET ${res.status}`);
  const data = (await res.json()) as { designs?: SavedDesign[] };
  return Array.isArray(data.designs) ? data.designs : [];
}

export function pushServerDesign(design: SavedDesign): void {
  if (!customerLoggedIn) return;
  fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pq: search, design }),
  }).catch(() => {});
}

export function deleteServerDesign(id: string): void {
  if (!customerLoggedIn) return;
  fetch(API, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pq: search, id }),
  }).catch(() => {});
}

// localStorage'daki eski kayıtların hesaba bir defalık taşınma işareti
export function migrationDone(): boolean {
  try { return localStorage.getItem(`bkf_saved_synced_${customerId}`) === '1'; } catch { return true; }
}

export function markMigrationDone(): void {
  try { localStorage.setItem(`bkf_saved_synced_${customerId}`, '1'); } catch {}
}
