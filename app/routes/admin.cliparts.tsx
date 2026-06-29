import {
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
  redirect,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, Form } from "@remix-run/react";
import { useState } from "react";
import {
  getAllCliparts,
  addClipart,
  deleteClipart,
  toggleClipartActive,
  type Clipart,
} from "~/models/cliparts.server";

const CLIPART_CATEGORIES = [
  { value: "sekil",   label: "Şekil" },
  { value: "cerceve", label: "Çerçeve" },
  { value: "spor",    label: "Spor" },
  { value: "anadolu", label: "Anadolu" },
  { value: "doga",    label: "Doğa" },
  { value: "genel",   label: "Genel" },
] as const;

const AUTH_COOKIE = "panel_auth";
const MAX_BYTES = 5 * 1024 * 1024;

function isAuthed(request: Request): boolean {
  const secret = process.env.ADMIN_PANEL_SECRET ?? "";
  if (!secret) return false;
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === `${AUTH_COOKIE}=${encodeURIComponent(secret)}`);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthed(request)) return redirect("/admin");
  const cliparts = await getAllCliparts();
  return json({ cliparts });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!isAuthed(request)) return redirect("/admin");

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const cloned = request.clone();
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_BYTES });
    const form = await unstable_parseMultipartFormData(cloned, uploadHandler);
    const intent = String(form.get("intent") || "");

    if (intent === "upload") {
      const file = form.get("image");
      const name = String(form.get("name") || "Klipart").trim().slice(0, 80);
      const category = String(form.get("category") || "genel");
      if (!(file instanceof File) || file.size === 0)
        return json({ error: "Dosya seçilmedi" }, { status: 400 });
      try {
        await addClipart(name, category, file, request.url);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 });
      }
      return json({ ok: true });
    }
  }

  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "delete") {
    const id = String(form.get("id") || "");
    if (id) await deleteClipart(id);
    return json({ ok: true });
  }

  if (intent === "toggle") {
    const id = String(form.get("id") || "");
    const active = form.get("active") === "1";
    if (id) await toggleClipartActive(id, active);
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

function ClipartCard({ c }: { c: Clipart }) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";
  const isToggling = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "toggle";

  return (
    <div style={{
      border: `2px solid ${c.isActive ? "#d1fae5" : "#fee2e2"}`,
      borderRadius: 12,
      overflow: "hidden",
      background: "#fff",
    }}>
      <div style={{
        background: "#f8fafc",
        height: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 8,
      }}>
        <img
          src={c.imageUrl.startsWith("https://assets.printlabapp.com/") ? `/api/img-proxy?url=${encodeURIComponent(c.imageUrl)}` : c.imageUrl}
          alt={c.name}
          style={{ maxHeight: 100, maxWidth: "100%", objectFit: "contain" }}
        />
      </div>
      <div style={{ padding: "10px 12px" }}>
        <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>{c.name}</p>
        <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 8px" }}>{c.category}</p>
        <div style={{ display: "flex", gap: 6 }}>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="toggle" />
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="active" value={c.isActive ? "0" : "1"} />
            <button
              type="submit"
              disabled={isToggling}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                border: "none",
                background: c.isActive ? "#fef3c7" : "#d1fae5",
                color: c.isActive ? "#92400e" : "#065f46",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {c.isActive ? "Pasif Et" : "Aktif Et"}
            </button>
          </fetcher.Form>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={c.id} />
            <button
              type="submit"
              disabled={isDeleting}
              onClick={(e) => { if (!confirm("Silinsin mi?")) e.preventDefault(); }}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                border: "none",
                background: "#fee2e2",
                color: "#991b1b",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Sil
            </button>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}

export default function AdminClipartsRoute() {
  const { cliparts } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const uploadFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isUploading = uploadFetcher.state !== "idle";
  const uploadOk = !isUploading && uploadFetcher.data?.ok;
  const uploadError = !isUploading && uploadFetcher.data?.error;

  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("genel");

  if (uploadOk && preview) {
    setPreview(null);
    setName("");
    revalidate();
  }

  const byCategory = CLIPART_CATEGORIES.map((cat) => ({
    ...cat,
    items: cliparts.filter((c) => c.category === cat.value),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Global Klipart Kütüphanesi</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>Tüm merchant'ların designer'ında görünen klipartlar</p>
        </div>
        <a href="/admin" style={{ fontSize: 13, color: "#6366f1" }}>← Admin Panel</a>
      </div>

      {/* Upload form */}
      <div style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
        marginBottom: 32,
      }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Yeni Klipart Ekle</h2>
        {uploadError && (
          <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13 }}>
            {uploadError}
          </div>
        )}
        <uploadFetcher.Form method="post" encType="multipart/form-data">
          <input type="hidden" name="intent" value="upload" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Görsel (PNG/SVG/JPG, max 5MB)</label>
              <input
                type="file"
                name="image"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                style={{ fontSize: 13 }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
                  const reader = new FileReader();
                  reader.onload = (ev) => setPreview(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>İsim</label>
              <input
                type="text"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="örn. Türk Yıldızı"
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Kategori</label>
              <select
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
              >
                {CLIPART_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={isUploading || !preview}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: "#4f46e5",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                opacity: (isUploading || !preview) ? 0.5 : 1,
              }}
            >
              {isUploading ? "Yükleniyor..." : "Kaydet"}
            </button>
          </div>
          {preview && (
            <div style={{ marginTop: 12 }}>
              <img src={preview} alt="Önizleme" style={{ height: 80, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 8, padding: 4 }} />
            </div>
          )}
        </uploadFetcher.Form>
      </div>

      {/* Clipart list by category */}
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
        Toplam: <strong>{cliparts.length}</strong> klipart ({cliparts.filter((c) => c.isActive).length} aktif)
      </p>

      {cliparts.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "40px 0" }}>
          Henüz klipart yok. Yukarıdan ekleyin.
        </div>
      ) : (
        byCategory.map((cat) => (
          <div key={cat.value} style={{ marginBottom: 32 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#374151" }}>
              {cat.label} <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: 13 }}>({cat.items.length})</span>
            </h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 12,
            }}>
              {cat.items.map((c) => <ClipartCard key={c.id} c={c} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
