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
import type { TranslationKey } from "~/i18n/tr";

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

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  general: "support.catGeneral",
  setup: "support.catSetup",
  billing: "support.catBilling",
  designer: "support.catDesigner",
  orders: "support.catOrders",
  bug: "support.catBug",
};

function categoryLabel(category: string, t: (k: TranslationKey) => string): string {
  return CATEGORY_LABEL_KEYS[category] ? t(CATEGORY_LABEL_KEYS[category]) : category;
}

function StatusBadge({ status, t }: { status: string; t: (k: never) => string }) {
  if (status === "open") return <Badge tone="attention">{t("support.statusOpen" as never)}</Badge>;
  if (status === "answered") return <Badge tone="success">{t("support.statusAnswered" as never)}</Badge>;
  if (status === "closed") return <Badge tone="enabled">{t("support.statusClosed" as never)}</Badge>;
  return <Badge>{status}</Badge>;
}

function PriorityBadge({ priority, t }: { priority: string; t: (k: never) => string }) {
  if (priority === "urgent") return <Badge tone="critical">{t("support.priorityUrgent" as never)}</Badge>;
  if (priority === "high") return <Badge tone="warning">{t("support.priorityHigh" as never)}</Badge>;
  return <Badge>{t("support.priorityNormal" as never)}</Badge>;
}

function ConversationThread({ messages, t }: { messages: Message[]; t: (k: never) => string }) {
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
            {m.role === "admin" ? "PrintLab" : t("support.you" as never)}
          </Text>
          <Text as="p" variant="bodySm">{m.text}</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {new Date(m.at).toLocaleString()}
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
  const { t } = useTranslation();
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

  const categoryOptions = [
    { label: t("support.catGeneral" as never), value: "general" },
    { label: t("support.catSetup" as never), value: "setup" },
    { label: t("support.catBilling" as never), value: "billing" },
    { label: t("support.catDesigner" as never), value: "designer" },
    { label: t("support.catOrders" as never), value: "orders" },
    { label: t("support.catBug" as never), value: "bug" },
  ];
  const priorityOptions = [
    { label: t("support.priorityNormal" as never), value: "normal" },
    { label: t("support.priorityHigh" as never), value: "high" },
    { label: t("support.priorityUrgent" as never), value: "urgent" },
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
                  <Text as="p" tone="subdued">{t("support.openTickets" as never)}</Text>
                  <Text as="p" variant="headingLg">{openCount}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" tone="subdued">{t("support.waitingForYou" as never)}</Text>
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
                          label={t("support.category" as never)}
                          name="category"
                          options={categoryOptions}
                          value={category}
                          onChange={setCategory}
                        />
                      </Box>
                      <Box minWidth="220px">
                        <Select
                          label={t("support.priority" as never)}
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
                            <PriorityBadge priority={ticket.priority} t={t as never} />
                            <Box>
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{ticket.subject}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {categoryLabel(ticket.category, t as never)}
                                {lastMessage ? ` · ${lastMessage.role === "admin" ? "PrintLab" : t("support.you" as never)}` : ""}
                              </Text>
                            </Box>
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(ticket.updated_at ?? ticket.created_at).toLocaleDateString()}
                            {" "}{expanded === ticket.id ? "▲" : "▼"}
                          </Text>
                        </button>

                        {expanded === ticket.id && (
                          <div style={{ padding: "12px 16px", background: "#fafafa", borderTop: "1px solid #f0f0f0" }}>
                            <BlockStack gap="300">
                              <InlineStack gap="200" wrap>
                                <Badge>{ticket.id}</Badge>
                                <Badge>{categoryLabel(ticket.category, t as never)}</Badge>
                                <Badge>{`${messages.length} ${t("support.messagesCount" as never)}`}</Badge>
                              </InlineStack>
                              <Divider />
                              <ConversationThread messages={messages} t={t as never} />

                              {ticket.status !== "closed" ? (
                                <Form method="post">
                                  <input type="hidden" name="intent" value="reply" />
                                  <input type="hidden" name="ticketId" value={ticket.id} />
                                  <BlockStack gap="200">
                                    <TextField
                                      label={t("support.replyPlaceholder" as never)}
                                      name="text"
                                      value={replyText[ticket.id] ?? ""}
                                      onChange={(v) => setReplyText((p) => ({ ...p, [ticket.id]: v }))}
                                      multiline={3}
                                      autoComplete="off"
                                    />
                                    <Box>
                                      <Button variant="primary" submit loading={isSubmitting} size="slim">
                                        {t("support.send" as never)}
                                      </Button>
                                    </Box>
                                  </BlockStack>
                                </Form>
                              ) : (
                                <Banner tone="info">
                                  <p>{t("support.closedNotice" as never)}</p>
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
