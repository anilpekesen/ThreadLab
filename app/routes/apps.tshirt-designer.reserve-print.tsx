import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { isPrintSide, reservePrintKeys } from "~/lib/print-reservations.server";

const useR2 = Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_PUBLIC_URL);

export const loader = async (_args: LoaderFunctionArgs) => {
  return json({ error: "Method not allowed" }, { status: 405 });
};

/**
 * Baskı dosyası için R2 adresi ayırır; dosya sepete eklendikten sonra arka
 * planda bu adrese yüklenir (bkz. print-reservations.server.ts).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  // Yerel disk kurulumunda adres ayırma yok — tasarımcı eski bekleyen akışa döner
  if (!useR2) return json({ error: "Reservations unavailable" }, { status: 501 });

  const body = await request.json().catch(() => null) as { sides?: unknown } | null;
  const sides = Array.isArray(body?.sides) ? [...new Set(body!.sides.filter(isPrintSide))] : [];
  if (!sides.length) return json({ error: "sides required" }, { status: 422 });

  const reserved = await reservePrintKeys(sides);
  const publicUrl = process.env.R2_PUBLIC_URL;
  return json({
    reservations: reserved.map((r) => ({ side: r.side, key: r.key, url: `${publicUrl}/${r.key}` })),
  });
};
