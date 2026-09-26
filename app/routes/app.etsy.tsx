import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { Badge, Banner, BlockStack, Button, Card, InlineStack, Layout, List, Page, Text } from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { etsyConfigured } from "~/lib/etsy.server";
import { disconnectEtsy, getEtsyStatus, startEtsyOAuth, syncEtsyOrders } from "~/models/etsy.server";
import { useDict } from "~/i18n";

const dict = {
  tr: {
    title: "Etsy",
    subtitle: "Etsy siparişlerini üretim ekranına getirin.",
    how: "Nasıl çalışır?",
    howItems: [
      "Etsy'deki ödenmiş siparişler 10 dakikada bir PrintLab'e gelir; siparişler listesinde \"Etsy\" etiketiyle görünür.",
      "Müşterinin Etsy'de yazdığı kişiselleştirme (isim, tarih, not) siparişin altında gösterilir.",
      "Siparişi PrintLab'de \"Gönderildi\" yaptığınızda Etsy'de de gönderildi olarak işaretlenir.",
      "Etsy'de ürün sayfasına tasarımcı eklenemez; baskı dosyasını metne göre siz hazırlarsınız.",
    ],
    notReady: "Etsy bağlantısı çok yakında açılacak.",
    connect: "Etsy ile bağlan",
    connected: (name: string) => `Bağlı: ${name}`,
    lastSync: (d: string) => `Son eşitleme: ${d}`,
    never: "Henüz eşitlenmedi",
    syncNow: "Şimdi eşitle",
    synced: (n: number) => `${n} sipariş kontrol edildi.`,
    disconnect: "Bağlantıyı kaldır",
    error: "Bir hata oluştu, tekrar deneyin.",
    oauth: (r: string): string => r === "connected" ? "Etsy mağazanız bağlandı; son 30 günün siparişleri birkaç dakika içinde gelir." : r === "denied" ? "Etsy'de izin verilmedi." : r === "expired" ? "Bağlantı isteğinin süresi doldu, tekrar deneyin." : "Etsy'ye bağlanılamadı, tekrar deneyin.",
  },
  en: {
    title: "Etsy",
    subtitle: "Bring your Etsy orders into production.",
    how: "How it works",
    howItems: [
      "Paid Etsy orders arrive in PrintLab every 10 minutes and show in Orders with an \"Etsy\" label.",
      "The personalization the buyer wrote on Etsy (name, date, note) is shown under the order.",
      "When you mark the order Shipped in PrintLab, it is marked shipped on Etsy too.",
      "Etsy doesn't allow a designer on the listing page; you prepare the print file from the text.",
    ],
    notReady: "The Etsy connection will be available very soon.",
    connect: "Connect with Etsy",
    connected: (name: string) => `Connected: ${name}`,
    lastSync: (d: string) => `Last sync: ${d}`,
    never: "Not synced yet",
    syncNow: "Sync now",
    synced: (n: number) => `${n} orders checked.`,
    disconnect: "Disconnect",
    error: "Something went wrong, please try again.",
    oauth: (r: string): string => r === "connected" ? "Your Etsy shop is connected; orders from the last 30 days arrive within minutes." : r === "denied" ? "Access was not allowed on Etsy." : r === "expired" ? "The connection request expired, please try again." : "Could not connect to Etsy, please try again.",
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  return json({
    ready: etsyConfigured(),
    status: await getEtsyStatus(session.shop),
    oauthResult: new URL(request.url).searchParams.get("oauth") ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const intent = String((await request.formData()).get("intent") ?? "");
  try {
    if (intent === "connect" && etsyConfigured()) return json({ redirectUrl: await startEtsyOAuth(session.shop) });
    if (intent === "sync") {
      const r = await syncEtsyOrders(session.shop);
      return json({ synced: r.imported + r.cancelled });
    }
    if (intent === "disconnect") {
      await disconnectEtsy(session.shop);
      return json({ ok: true });
    }
  } catch (err) {
    console.error("[etsy] işlem hatası:", err);
    return json({ error: true });
  }
  return json({ ok: false });
};

export default function EtsyPage() {
  const data = useLoaderData<typeof loader>();
  const L = useDict(dict);
  const fetcher = useFetcher<{ redirectUrl?: string; synced?: number; error?: boolean }>();
  const busy = fetcher.state !== "idle";

  // Etsy'nin izin ekranı üst pencerede açılır (Shopify'da iframe'den çıkılır)
  useEffect(() => {
    const target = fetcher.data?.redirectUrl;
    if (!target) return;
    if (window.top && window.top !== window.self) window.top.location.href = target;
    else window.location.href = target;
  }, [fetcher.data?.redirectUrl]);

  return (
    <Page title={L.title} subtitle={L.subtitle}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              {data.oauthResult && (
                <Banner tone={data.oauthResult === "connected" ? "success" : "warning"}><p>{L.oauth(data.oauthResult)}</p></Banner>
              )}
              {fetcher.data?.error && <Banner tone="critical"><p>{L.error}</p></Banner>}
              {data.status?.lastError && <Banner tone="warning"><p>{data.status.lastError}</p></Banner>}
              {data.status ? (
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Badge tone="success">{L.connected(data.status.shopName || "Etsy")}</Badge>
                    <Button tone="critical" variant="plain" loading={busy} onClick={() => fetcher.submit({ intent: "disconnect" }, { method: "POST" })}>{L.disconnect}</Button>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    {data.status.lastSyncedAt ? L.lastSync(new Date(data.status.lastSyncedAt).toLocaleString()) : L.never}
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Button loading={busy} onClick={() => fetcher.submit({ intent: "sync" }, { method: "POST" })}>{L.syncNow}</Button>
                    {typeof fetcher.data?.synced === "number" && <Text as="span" tone="subdued">{L.synced(fetcher.data.synced)}</Text>}
                  </InlineStack>
                </BlockStack>
              ) : data.ready ? (
                <InlineStack>
                  <Button variant="primary" loading={busy} onClick={() => fetcher.submit({ intent: "connect" }, { method: "POST" })}>{L.connect}</Button>
                </InlineStack>
              ) : (
                <Banner tone="info"><p>{L.notReady}</p></Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">{L.how}</Text>
              <List>
                {L.howItems.map((item) => <List.Item key={item}>{item}</List.Item>)}
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
