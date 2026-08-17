const FROM = process.env.NOTIFICATION_FROM_EMAIL ?? "notification@printlabapp.com";
const API_KEY = process.env.RESEND_API_KEY ?? "";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  /** Alıcının gelen kutusunda görünen ad. Gönderici adresi doğrulanmış FROM olarak kalır. */
  fromName?: string;
}

function safeFromName(value?: string): string {
  const cleaned = value
    ?.replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned || "PrintLab";
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  if (!API_KEY) {
    console.warn("[email] RESEND_API_KEY tanımlı değil, mail gönderilmedi");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${safeFromName(opts.fromName)} <${FROM}>`,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  const data = await res.json().catch(() => ({})) as { id?: string };
  console.log(`[email] gönderildi → ${Array.isArray(opts.to) ? opts.to.join(",") : opts.to} id=${data.id ?? "?"}`);
}
