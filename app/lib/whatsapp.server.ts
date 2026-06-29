const WA_URL = process.env.WA_SERVICE_URL ?? "http://127.0.0.1:3002";

export interface WAStatus {
  status: "disconnected" | "connecting" | "connected";
  hasQr: boolean;
}

export interface WAQr {
  qr: string | null;
  status: WAStatus["status"];
}

export async function getWAStatus(): Promise<WAStatus> {
  try {
    const res = await fetch(`${WA_URL}/status`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json() as Promise<WAStatus>;
  } catch {
    return { status: "disconnected", hasQr: false };
  }
}

export async function getWAQr(): Promise<WAQr> {
  try {
    const res = await fetch(`${WA_URL}/qr`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json() as Promise<WAQr>;
  } catch {
    return { qr: null, status: "disconnected" };
  }
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const res = await fetch(`${WA_URL}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp send: ${body}`);
  }
}

export async function logoutWhatsApp(): Promise<void> {
  await fetch(`${WA_URL}/logout`, {
    method: "POST",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}
