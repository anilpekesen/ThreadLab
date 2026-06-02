import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { randomBytes } from "crypto";
import {
  Page, Layout, Card, Text, BlockStack, Badge,
  Button, Box, TextField, Banner, InlineStack,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { query } from "~/lib/db.server";
import { useState } from "react";
import { useTranslation } from "~/i18n";

interface Message { role: "merchant" | "admin"; text: string; at: string }

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  messages: Message[];
  created_at: string;
}

export const headers = () => ({ "Cache-Control": "no-store" });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticate(request);
  const tickets = await query<{ id: string; subject: string; status: string; messages: Message[]; created_at: string }>(
    `SELECT id, subject, status, messages, created_at
     FROM support_tickets WHERE shop = $1 ORDER BY created_at DESC LIMIT 20`,
    [shop],
  );
  return json({ tickets: tickets.rows });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const subject = (form.get("subject") as string)?.trim();
    const message = (form.get("message") as string)?.trim();
    if (!subject || !message) return json({ error: "Konu ve mesaj gereklidir.", success: false });
    const id = `tkt_${randomBytes(8).toString("hex")}`;
    const firstMsg: Message = { role: "merchant", text: message, at: new Date().toISOString() };
    await query(
      `INSERT INTO support_tickets (id, shop, subject, message, messages) VALUES ($1,$2,$3,$4,$5)`,
      [id, shop, subject, message, JSON.stringify([firstMsg])],
    );
    return json({ success: true, error: null });
  }

  if (intent === "reply") {
    const ticketId = (form.get("ticketId") as string)?.trim();
    const text = (form.get("text") as string)?.trim();
    if (!ticketId || !text) return json({ error: "Mesaj boş olamaz.", success: false });
    const newMsg: Message = { role: "merchant", text, at: new Date().toISOString() };
    await query(
      `UPDATE support_tickets
       SET messages = messages || $2::jsonb, status = 'open', updated_at = now()
       WHERE id = $1 AND shop = $3`,
      [ticketId, JSON.stringify([newMsg]), shop],
    );
    return json({ success: true, error: null });
  }

  return json({ error: null, success: false });
};

function StatusBadge({ status, t }: { status: string; t: (k: never) => string }) {
  if (status === "open") return <Badge tone="attention">{t("support.statusOpen" as never)}</Badge>;
  if (status === "answered") return <Badge tone="success">{t("support.statusAnswered" as never)}</Badge>;
  if (status === "closed") return <Badge tone="enabled">{t("support.statusClosed" as never)}</Badge>;
  return <Badge>{status}</Badge>;
}

function ConversationThread({ messages, lang }: { messages: Message[]; lang: string }) {
  return (
    <BlockStack gap="200">
      {messages.map((m, i) => (
        <div
          key={i}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: m.role === "admin" ? "#f0f4ff" : "#f9fafb",
            border: `1px solid ${m.role === "admin" ? "#c7d2fe" : "#e5e7eb"}`,
            alignSelf: m.role === "admin" ? "flex-start" : "flex-end",
          }}
        >
          <Text as="p" variant="bodySm" fontWeight="semibold" tone={m.role === "admin" ? "magic" : undefined}>
            {m.role === "admin" ? "PrintLab" : lang === "tr" ? "Siz" : "You"}
          </Text>
          <Text as="p" variant="bodySm">{m.text}</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {new Date(m.at).toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}
          </Text>
        </div>
      ))}
    </BlockStack>
  );
}

export default function SupportPage() {
  const { tickets } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { t, lang } = useTranslation();
  const isSubmitting = navigation.state === "submitting";

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const showSuccess = actionData?.success === true;

  return (
    <Page title={t("support.title" as never)}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">

            <Banner>{t("support.description" as never)}</Banner>

            {showSuccess && <Banner tone="success">{t("support.successMsg" as never)}</Banner>}
            {actionData?.error && <Banner tone="critical"><p>{actionData.error}</p></Banner>}

            {/* Yeni talep formu */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t("support.newTicket" as never)}</Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="create" />
                  <BlockStack gap="300">
                    <TextField
                      label={t("support.subject" as never)}
                      name="subject"
                      value={subject}
                      onChange={(v) => { setSubject(v); }}
                      autoComplete="off"
                    />
                    <TextField
                      label={t("support.message" as never)}
                      name="message"
                      value={message}
                      onChange={(v) => { setMessage(v); }}
                      multiline={4}
                      autoComplete="off"
                    />
                    <Box>
                      <Button variant="primary" submit loading={isSubmitting}>
                        {t("support.submit" as never)}
                      </Button>
                    </Box>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>

            {/* Talepler listesi */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t("support.myTickets" as never)}</Text>
                {tickets.length === 0 ? (
                  <Text as="p" tone="subdued">{t("support.noTickets" as never)}</Text>
                ) : (
                  <BlockStack gap="300">
                    {tickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}
                      >
                        {/* Başlık satırı */}
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
                          style={{
                            width: "100%", textAlign: "left", padding: "12px 16px",
                            background: expanded === ticket.id ? "#f8fafc" : "#fff",
                            border: "none", cursor: "pointer", display: "flex",
                            alignItems: "center", justifyContent: "space-between", gap: 12,
                          }}
                        >
                          <InlineStack gap="200" blockAlign="center">
                            <StatusBadge status={ticket.status} t={t as never} />
                            <Text as="span" variant="bodyMd" fontWeight="semibold">{ticket.subject}</Text>
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(ticket.created_at).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US")}
                            {" "}{expanded === ticket.id ? "▲" : "▼"}
                          </Text>
                        </button>

                        {/* Konuşma thread */}
                        {expanded === ticket.id && (
                          <div style={{ padding: "12px 16px", background: "#fafafa", borderTop: "1px solid #f0f0f0" }}>
                            <BlockStack gap="300">
                              <ConversationThread messages={ticket.messages ?? []} lang={lang} />

                              {/* Cevap formu — sadece answered durumunda */}
                              {ticket.status === "answered" && (
                                <Form method="post">
                                  <input type="hidden" name="intent" value="reply" />
                                  <input type="hidden" name="ticketId" value={ticket.id} />
                                  <BlockStack gap="200">
                                    <TextField
                                      label={lang === "tr" ? "Yanıt yaz..." : "Write a reply..."}
                                      name="text"
                                      value={replyText[ticket.id] ?? ""}
                                      onChange={(v) => setReplyText((p) => ({ ...p, [ticket.id]: v }))}
                                      multiline={3}
                                      autoComplete="off"
                                    />
                                    <Box>
                                      <Button variant="primary" submit loading={isSubmitting} size="slim">
                                        {lang === "tr" ? "Gönder" : "Send"}
                                      </Button>
                                    </Box>
                                  </BlockStack>
                                </Form>
                              )}
                            </BlockStack>
                          </div>
                        )}
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
