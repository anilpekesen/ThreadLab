import { useRouteError, isRouteErrorResponse } from "@remix-run/react";

export function loader() {
  throw new Response("Not Found", { status: 404 });
}

function NotFoundPage() {
  return (
    <div
      style={{
        fontFamily: "system-ui,-apple-system,sans-serif",
        background: "#ffffff",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center", padding: "0 24px" }}>
        <div
          style={{
            fontSize: "8rem",
            fontWeight: 900,
            color: "#111827",
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#374151",
            margin: "0 0 12px",
          }}
        >
          Sayfa bulunamadı
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: "#6b7280",
            margin: "0 0 32px",
            maxWidth: 400,
          }}
        >
          Aradığınız sayfa taşınmış veya silinmiş olabilir.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            background: "#6366f1",
            color: "#ffffff",
            textDecoration: "none",
            padding: "10px 28px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.95rem",
          }}
        >
          Ana Sayfaya Dön
        </a>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }
  return <NotFoundPage />;
}

export default function CatchAll() {
  return null;
}
