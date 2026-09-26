/**
 * Tarayıcı tarafı: Paddle.js'i bir kez yükler ve başlatır. Ödeme penceresi
 * sunucunun açtığı işlemle açılır (bkz. ~/models/paddle-billing.server);
 * tutar ve kalem tarayıcıdan verilmez.
 */
type PaddleJs = {
  Environment: { set: (env: string) => void };
  Initialize: (o: { token: string; pwCustomer?: { id: string }; eventCallback?: (e: { name?: string }) => void }) => void;
  Checkout: { open: (o: { transactionId: string; settings?: Record<string, unknown> }) => void };
};

/** Paddle.js'i bir kez yükler ve başlatır; ödeme tamamlanınca `onDone` */
export function loadPaddle(client: { environment: string; token: string; customerId?: string | null }, onDone: () => void): Promise<PaddleJs> {
  const w = window as unknown as { Paddle?: PaddleJs; __plPaddleInit?: boolean; __plPaddleDone?: () => void };
  w.__plPaddleDone = onDone;
  const init = () => {
    const P = w.Paddle!;
    if (!w.__plPaddleInit) {
      if (client.environment === "sandbox") P.Environment.set("sandbox");
      // Paddle Retain: kayıtlı mağazanın Paddle müşteri kimliği (ctm_...)
      P.Initialize({ token: client.token, ...(client.customerId ? { pwCustomer: { id: client.customerId } } : {}), eventCallback: (e) => { if (e.name === "checkout.completed") w.__plPaddleDone?.(); } });
      w.__plPaddleInit = true;
    }
    return P;
  };
  if (w.Paddle) return Promise.resolve(init());
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.onload = () => resolve(init());
    s.onerror = () => reject(new Error("Paddle.js could not be loaded"));
    document.head.appendChild(s);
  });
}

