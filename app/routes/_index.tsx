import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (shop) {
    throw redirect(`/auth?shop=${shop}`);
  }
  return { loginUrl: "/auth/login" };
};

export default function Index() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f6f6f7",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 12,
        padding: "40px 48px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        width: "100%",
        maxWidth: 420,
        textAlign: "center",
      }}>
        <img src="/logo.svg" alt="PrintLab" style={{ height: 48, marginBottom: 24 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: "#1a1a2e" }}>
          PrintLab'e Giriş Yap
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 28 }}>
          Shopify mağaza adresinizi girin
        </p>
        <Form method="get" action="/auth/login">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="text"
              name="shop"
              placeholder="magazaadi.myshopify.com"
              required
              style={{
                padding: "12px 16px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 15,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              style={{
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 0",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Giriş Yap →
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
