const FROM = process.env.NOTIFICATION_FROM_EMAIL ?? "notification@printlabapp.com";
const API_KEY = process.env.RESEND_API_KEY ?? "";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  if (!API_KEY) {
    console.warn("[email] RESEND_API_KEY tanımlı değil, mail gönderilmedi");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `PrintLab <${FROM}>`,
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
}
