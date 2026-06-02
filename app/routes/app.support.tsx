import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { randomBytes } from "crypto";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Badge,
  Button,
  Box,
  TextField,
  Banner,
  EmptyState,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { query } from "~/lib/db.server";
import { useState } from "react";

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  priority: string;
  admin_reply: string | null;
  created_at: string;
  replied_at: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticate(request);
  const tickets = await query<TicketRow>(
    "SELECT id, subject, status, priority, admin_reply, created_at, replied_at FROM support_tickets WHERE shop = $1 ORDER BY created_at DESC LIMIT 20",
    [shop],
  );
  return json({ tickets: tickets.rows, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const subject = form.get("subject") as string;
    const message = form.get("message") as string;
    if (!subject?.trim() || !message?.trim()) {
      return json({ error: "Konu ve mesaj gereklidir / Subject and message are required", success: false });
    }
    const id = `tkt_${randomBytes(8).toString("hex")}`;
    await query(
      `INSERT INTO support_tickets (id, shop, subject, message) VALUES ($1,$2,$3,$4)`,
      [id, shop, subject.trim(), message.trim()],
    );
    return json({ success: true, error: null });
  }

  return json({ error: null, success: false });
};

function statusBadge(status: string) {
  switch (status) {
    case "open":
      return <Badge tone="attention">Açık / Open</Badge>;
    case "answered":
      return <Badge tone="success">Yanıtlandı / Answered</Badge>;
    case "closed":
      return <Badge tone="enabled">Kapatıldı / Closed</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function SupportPage() {
  const { tickets } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const showSuccess = actionData?.success === true;

  const rows = tickets.map((t) => [
    t.subject,
    statusBadge(t.status),
    new Date(t.created_at).toLocaleDateString("tr-TR"),
    t.admin_reply ? (
      <Text as="p" variant="bodySm" tone="subdued">
        {t.admin_reply.length > 80 ? t.admin_reply.slice(0, 80) + "…" : t.admin_reply}
      </Text>
    ) : (
      <Text as="p" variant="bodySm" tone="subdued">—</Text>
    ),
  ]);

  return (
    <Page title="Destek / Support">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Banner>
                <p>
                  Sorunlarınızı buradan bize iletebilirsiniz. En kısa sürede yanıt vereceğiz. /
                  You can send us your issues here. We will respond as soon as possible.
                </p>
              </Banner>

              {showSuccess && (
                <Banner tone="success">
                  <p>
                    Talebiniz alındı, en kısa sürede yanıt vereceğiz. /
                    Your request has been received. We will respond as soon as possible.
                  </p>
                </Banner>
              )}

              {actionData?.error && (
                <Banner tone="critical">
                  <p>{actionData.error}</p>
                </Banner>
              )}

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Yeni Talep Oluştur / New Request
                  </Text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="create" />
                    <BlockStack gap="300">
                      <TextField
                        label="Konu / Subject"
                        name="subject"
                        value={subject}
                        onChange={setSubject}
                        autoComplete="off"
                      />
                      <TextField
                        label="Mesaj / Message"
                        name="message"
                        value={message}
                        onChange={setMessage}
                        multiline={4}
                        autoComplete="off"
                      />
                      <Box>
                        <Button
                          variant="primary"
                          submit
                          loading={isSubmitting}
                        >
                          Talep Gönder / Submit Request
                        </Button>
                      </Box>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Taleplerim / My Requests
                  </Text>
                  {tickets.length === 0 ? (
                    <EmptyState
                      heading="Henüz destek talebiniz yok / No support requests yet"
                      image=""
                    >
                      <p>Yukarıdaki formu kullanarak ilk talebinizi oluşturabilirsiniz. / Use the form above to create your first request.</p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text"]}
                      headings={["Konu / Subject", "Durum / Status", "Tarih / Date", "Admin Yanıtı / Admin Reply"]}
                      rows={rows as string[][]}
                    />
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
  );
}
