import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { randomBytes } from "crypto";
import {
  Page, Layout, Card, Text, BlockStack, Badge,
  Button, Box, TextField, Banner, InlineStack, Select, Divider,
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
  priority: string;
  category: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export const headers = () => ({ "Cache-Control": "no-store" });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticate(request);
  const tickets = await query<TicketRow>(
    `SELECT id, subject, status, priority, category, messages, created_at, updated_at
     FROM support_tickets WHERE shop = $1 ORDER BY updated_at DESC LIMIT 50`,
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
    const category = normalizeCategory(form.get("category"));
    const priority = normalizePriority(form.get("priority"));
    if (!subject || !message) return json({ error: "Konu ve mesaj gereklidir.", success: false });
    const id = `tkt_${randomBytes(8).toString("hex")}`;
    const firstMsg: Message = { role: "merchant", text: message, at: new Date().toISOString() };
    await query(
      `INSERT INTO support_tickets
        (id, shop, subject, message, status, priority, category, messages, last_merchant_reply_at)
       VALUES ($1,$2,$3,$4,'open',$5,$6,$7,now())`,
      [id, shop, subject, message, priority, category, JSON.stringify([firstMsg])],
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
       SET messages = messages || $2::jsonb,
           status = 'open',
           updated_at = now(),
           last_merchant_reply_at = now()
       WHERE id = $1 AND shop = $3 AND status != 'closed'`,
      [ticketId, JSON.stringify([newMsg]), shop],
    );
    return json({ success: true, error: null });
  }

  return json({ error: null, success: false });
};

function normalizeCategory(value: FormDataEntryValue | null) {
  const category = String(value ?? "general");
  return ["setup", "billing", "designer", "orders", "bug", "general"].includes(category) ? category : "general";
}

function normalizePriority(value: FormDataEntryValue | null) {
  const priority = String(value ?? "normal");
  return ["normal", "high", "urgent"].includes(priority) ? priority : "normal";
}

function StatusBadge({ status, t }: { status: string; t: (k: never) => string }) {
  if (status === "open") return <Badge tone="attention">{t("support.statusOpen" as never)}</Badge>;
  if (status === "answered") return <Badge tone="success">{t("support.statusAnswered" as never)}</Badge>;
  if (status === "closed") return <Badge tone="enabled">{t("support.statusClosed" as never)}</Badge>;
  return <Badge>{status}</Badge>;
}

function PriorityBadge({ priority, lang }: { priority: string; lang: string }) {
  if (priority === "urgent") return <Badge tone="critical">{lang === "tr" ? "Acil" : "Urgent"}</Badge>;
  if (priority === "high") return <Badge tone="warning">{lang === "tr" ? "Yüksek" : "High"}</Badge>;
  return <Badge>{lang === "tr" ? "Normal" : "Normal"}</Badge>;
}

function categoryLabel(category: string, lang: string) {
  const tr: Record<string, string> = {
    setup: "Kurulum",
    billing: "Ödeme",
    designer: "Tasarım editörü",
    orders: "Siparişler",
    bug: "Hata bildirimi",
    general: "Genel",
  };
  const en: Record<string, string> = {
    setup: "Setup",
    billing: "Billing",
    designer: "Designer",
    orders: "Orders",
    bug: "Bug report",
    general: "General",
  };
  return (lang === "tr" ? tr : en)[category] ?? category;
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
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const showSuccess = actionData?.success === true;
  const openCount = tickets.filter((ticket) => ticket.status === "open").length;
  const answeredCount = tickets.filter((ticket) => ticket.status === "answered").length;
  const locale = lang === "tr" ? "tr-TR" : "en-US";

  const categoryOptions = [
    { label: lang === "tr" ? "Genel soru" : "General question", value: "general" },
    { label: lang === "tr" ? "Kurulum / entegrasyon" : "Setup / integration", value: "setup" },
    { label: lang === "tr" ? "Ödeme / abonelik" : "Billing / subscription", value: "billing" },
    { label: lang === "tr" ? "Tasarım editörü" : "Designer", value: "designer" },
    { label: lang === "tr" ? "Sipariş / üretim" : "Orders / production", value: "orders" },
    { label: lang === "tr" ? "Hata bildirimi" : "Bug report", value: "bug" },
  ];
  const priorityOptions = [
    { label: lang === "tr" ? "Normal" : "Normal", value: "normal" },
    { label: lang === "tr" ? "Yüksek" : "High", value: "high" },
    { label: lang === "tr" ? "Acil" : "Urgent", value: "urgent" },
  ];

  return (
    <Page title={t("support.title" as never)}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">

            <Banner>
              <p>{t("support.description" as never)}</p>
            </Banner>

            {showSuccess && <Banner tone="success">{t("support.successMsg" as never)}</Banner>}
            {actionData?.error && <Banner tone="critical"><p>{actionData.error}</p></Banner>}

            <InlineStack gap="300" wrap>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" tone="subdued">{lang === "tr" ? "Açık talep" : "Open tickets"}</Text>
                  <Text as="p" variant="headingLg">{openCount}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" tone="subdued">{lang === "tr" ? "Yanıt bekleyen" : "Waiting for you"}</Text>
                  <Text as="p" variant="headingLg">{answeredCount}</Text>
                </BlockStack>
              </Card>
            </InlineStack>

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
                    <InlineStack gap="300" wrap>
                      <Box minWidth="220px">
                        <Select
                          label={lang === "tr" ? "Kategori" : "Category"}
                          name="category"
                          options={categoryOptions}
                          value={category}
                          onChange={setCategory}
                        />
                      </Box>
                      <Box minWidth="220px">
                        <Select
                          label={lang === "tr" ? "Öncelik" : "Priority"}
                          name="priority"
                          options={priorityOptions}
                          value={priority}
                          onChange={setPriority}
                        />
                      </Box>
                    </InlineStack>
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

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t("support.myTickets" as never)}</Text>
                {tickets.length === 0 ? (
                  <Text as="p" tone="subdued">{t("support.noTickets" as never)}</Text>
                ) : (
                  <BlockStack gap="300">
                    {tickets.map((ticket) => {
                      const messages = ticket.messages ?? [];
                      const lastMessage = messages[messages.length - 1];
                      return (
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
                          <InlineStack gap="200" blockAlign="center" wrap={false}>
                            <StatusBadge status={ticket.status} t={t as never} />
                            <PriorityBadge priority={ticket.priority} lang={lang} />
                            <Box>
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{ticket.subject}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {categoryLabel(ticket.category, lang)}
                                {lastMessage ? ` · ${lastMessage.role === "admin" ? "PrintLab" : lang === "tr" ? "Siz" : "You"}` : ""}
                              </Text>
                            </Box>
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(ticket.updated_at ?? ticket.created_at).toLocaleDateString(locale)}
                            {" "}{expanded === ticket.id ? "▲" : "▼"}
                          </Text>
                        </button>

                        {expanded === ticket.id && (
                          <div style={{ padding: "12px 16px", background: "#fafafa", borderTop: "1px solid #f0f0f0" }}>
                            <BlockStack gap="300">
                              <InlineStack gap="200" wrap>
                                <Badge>{ticket.id}</Badge>
                                <Badge>{categoryLabel(ticket.category, lang)}</Badge>
                                <Badge>{`${messages.length} ${lang === "tr" ? "mesaj" : "messages"}`}</Badge>
                              </InlineStack>
                              <Divider />
                              <ConversationThread messages={messages} lang={lang} />

                              {ticket.status !== "closed" ? (
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
                              ) : (
                                <Banner tone="info">
                                  <p>{lang === "tr" ? "Bu talep kapatılmış. Yeni bir konu için yeni destek talebi oluşturabilirsiniz." : "This request is closed. Create a new request for a new issue."}</p>
                                </Banner>
                              )}
                            </BlockStack>
                          </div>
                        )}
                      </div>
                    );
                    })}
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
