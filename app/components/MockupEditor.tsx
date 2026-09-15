import { useEffect, useRef, useState } from "react";
import {
  Card, BlockStack, InlineStack, Text, Button, Badge, Box,
  TextField, Banner, Divider, Checkbox, Select,
} from "@shopify/polaris";
import type { MockupOpeningRect, Rect, TemplateMockup } from "~/lib/slots";

/**
 * Mockup editörü — varyanta göre ürün görselleri.
 *
 * Çerçeve rengi baskı dosyasını değiştirmiyor; değişen tek şey müşterinin
 * gördüğü ürün. Anahtar, Shopify'daki seçenek değeriyle eşleşiyor ("Ceviz");
 * müşteri o varyantı seçtiğinde fotoğrafını o çerçevenin içinde görüyor.
 *
 * Görselin ortası şeffaf bırakılmışsa açıklık kendiliğinden bulunuyor. Bulunan
 * yer yanlışsa (beyaz çerçeve, açık iç kenar) mağaza sahibi alanı elle çiziyor;
 * delik orijinal görselden tam o yere açılıyor.
 */

export interface MockupEditorProps {
  mockups: TemplateMockup[];
  onChange: (mockups: TemplateMockup[]) => void;
  /**
   * Tasarım tuvalinin en/boy oranı (taşma dahil). Müşteri sayfasında tasarım
   * açıklığın içine sığdırıldığı için açıklık bu orandan saparsa tasarım esner.
   */
  designAspect?: number;
}

export function MockupEditor({ mockups, onChange, designAspect }: MockupEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uyari, setUyari] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [drawing, setDrawing] = useState<number | null>(null);
  /**
   * Başarılı bir yüklemede bulunan açıklık, görsel ölçüsüne göre saklanıyor.
   * Mağazalar aynı çekimin renk varyantlarını yüklüyor ve beyaz çerçevede iç
   * alanla çerçevenin yüzü arasında ışık farkı olmadığı için tarama yetmiyor;
   * kardeş görselden ölçülen dikdörtgen o durumu kurtarıyor.
   */
  const acikliklar = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const hedef = useRef<number | null>(null);

  function patch(i: number, next: Partial<TemplateMockup>) {
    onChange(mockups.map((m, k) => (k === i ? { ...m, ...next } : m)));
  }

  function ekle() {
    onChange([...mockups, { key: "", label: "", url: "", areas: [] }]);
  }

  function sil(i: number) {
    onChange(mockups.filter((_, k) => k !== i));
    if (drawing === i) setDrawing(null);
  }

  async function yukle(file: File, i: number) {
    setBusy(true);
    setError("");
    setUyari("");
    setBilgi("");
    try {
      const olcu = await gorselOlcusu(file);
      const fd = new FormData();
      fd.append("image", file);
      fd.append("folder", "personalizer-mockup");
      const ipucu = olcu ? acikliklar.current[olcu] : undefined;
      if (ipucu) fd.append("openingHint", JSON.stringify(ipucu));

      const res = await fetch("/api/personalizer/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Yüklenemedi");
      // Yeni görselde eski elle çizilmiş alan geçersiz
      patch(i, { url: data.url, source_url: data.sourceUrl || data.url, opening: undefined });

      if (data.opening && olcu) acikliklar.current[olcu] = data.opening;
      if (data.uyari) setUyari(data.uyari);
      else if (data.openingCut) {
        setBilgi(
          "Görselin ortası şeffaf değildi, fotoğrafın gireceği alan otomatik açıldı. "
          + "Yanlış yerdeyse \"Fotoğraf alanını çiz\" ile düzeltin.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function alaniKes(i: number, rect: Rect, natural: { w: number; h: number }) {
    const m = mockups[i];
    // Kanvas/düz yüzeyde görsel delinmiyor: fotoğrafın üstüne çarpma
    // karışımıyla biniyor, dokusu ve gölgesi fotoğrafa işleniyor.
    if (m.blend === "multiply") {
      patch(i, {
        url: m.source_url || m.url,
        source_url: m.source_url || m.url,
        opening: { ...rect, aspect: natural.w / natural.h },
      });
      setDrawing(null);
      setBilgi("Fotoğraf alanı ayarlandı. Kaydetmeyi unutmayın.");
      return;
    }
    setBusy(true);
    setError("");
    setBilgi("");
    try {
      const res = await fetch("/api/personalizer/mockup-opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: m.source_url || m.url, rect }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Alan kesilemedi");
      patch(i, {
        url: data.url,
        source_url: m.source_url || m.url,
        opening: data.opening as MockupOpeningRect,
      });
      setDrawing(null);
      setBilgi("Fotoğraf alanı çizdiğiniz yere açıldı. Kaydetmeyi unutmayın.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alan kesilemedi");
    } finally {
      setBusy(false);
    }
  }

  /** Sunucuya ipucu gönderirken hangi kardeş görselin ölçüsü olduğunu bilmek gerekiyor */
  function gorselOlcusu(file: File): Promise<string | null> {
    return new Promise((cozumle) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); cozumle(`${im.naturalWidth}x${im.naturalHeight}`); };
      im.onerror = () => { URL.revokeObjectURL(url); cozumle(null); };
      im.src = url;
    });
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="300">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">Varyant görselleri</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Müşteri fotoğrafını seçtiği varyantın ürün görselinde görür. Zorunlu değil.
            </Text>
          </BlockStack>
          <Button onClick={ekle}>Görsel ekle</Button>
        </InlineStack>

        {mockups.length === 0 && (
          <Text as="p" tone="subdued" variant="bodySm">
            Henüz görsel eklenmemiş. Eklerseniz müşteri düzenlemesini gerçek ürünün üstünde
            yapar; eklemezseniz yalnızca baskı tuvalini görür.
          </Text>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            const i = hedef.current;
            e.target.value = "";
            hedef.current = null;
            if (f && i !== null) void yukle(f, i);
          }}
        />

        {bilgi && <Banner tone="success" onDismiss={() => setBilgi("")}><p>{bilgi}</p></Banner>}
        {uyari && <Banner tone="warning" onDismiss={() => setUyari("")}><p>{uyari}</p></Banner>}
        {error && <Banner tone="critical" onDismiss={() => setError("")}><p>{error}</p></Banner>}

        {mockups.map((m, i) => (
          <Box key={i} background="bg-surface-secondary" padding="300" borderRadius="200">
            <BlockStack gap="300">
              <InlineStack gap="300" blockAlign="center" align="space-between" wrap={false}>
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  {!m.url && <Badge tone="warning">Görsel yok</Badge>}
                  {m.url && (
                    m.opening
                      ? <Badge tone="success">Fotoğraf alanı elle çizildi</Badge>
                      : m.blend === "multiply"
                        ? <Badge tone="warning">Fotoğraf alanı çizilmedi</Badge>
                        : <Badge>Fotoğraf alanı otomatik</Badge>
                  )}
                  <Button
                    size="slim"
                    loading={busy && drawing === null}
                    onClick={() => { hedef.current = i; fileInput.current?.click(); }}
                  >
                    {m.url ? "Görseli değiştir" : "Görsel yükle"}
                  </Button>
                  {m.url && drawing !== i && (
                    <Button size="slim" onClick={() => setDrawing(i)}>Fotoğraf alanını çiz</Button>
                  )}
                </InlineStack>
                <Button tone="critical" variant="plain" onClick={() => sil(i)}>Sil</Button>
              </InlineStack>

              {m.url && (
                drawing === i ? (
                  <OpeningDrawer
                    imageUrl={m.source_url || m.url}
                    initial={m.opening}
                    designAspect={designAspect}
                    busy={busy}
                    onCancel={() => setDrawing(null)}
                    onApply={(rect, natural) => void alaniKes(i, rect, natural)}
                  />
                ) : (
                  <MockupPreview url={m.url} opening={m.opening} />
                )
              )}

              <InlineStack gap="300" wrap>
                <Box minWidth="220px">
                  <Select
                    label="Görsel türü"
                    options={[
                      { label: "Çerçeve — ortası şeffaf, fotoğraf içine girer", value: "frame" },
                      { label: "Kanvas / düz yüzey — doku fotoğrafın üstüne işlenir", value: "surface" },
                    ]}
                    value={m.blend === "multiply" ? "surface" : "frame"}
                    onChange={(v) => patch(i, v === "surface"
                      // Delinmiş bir görsel varsa orijinaline dönülüyor: yüzeyde delik olmamalı
                      ? { blend: "multiply", url: m.source_url || m.url }
                      : { blend: undefined })}
                    helpText={m.blend === "multiply"
                      ? "Beyaz yüzey fotoğrafı değiştirmez; keten dokusu ve kenar gölgesi fotoğrafa işlenir."
                      : "Görselin ortası şeffaf olmalı; değilse alanı elle çizin."}
                  />
                </Box>
                <Box minWidth="220px">
                  <TextField
                    label="Seçenek değeri"
                    autoComplete="off"
                    value={m.key}
                    placeholder="Ceviz"
                    helpText="Shopify'daki değerle birebir aynı olmalı; boş bırakılırsa varsayılan olur"
                    onChange={(v) => patch(i, { key: v })}
                  />
                </Box>
                <Box minWidth="220px">
                  <TextField
                    label="Görünen ad"
                    autoComplete="off"
                    value={m.label}
                    placeholder="Ceviz çerçeve"
                    onChange={(v) => patch(i, { label: v })}
                  />
                </Box>
              </InlineStack>
            </BlockStack>
          </Box>
        ))}

        {mockups.length > 0 && (
          <>
            <Divider />
            <Text as="p" variant="bodySm" tone="subdued">
              Görselin fotoğrafın görüneceği kısmı şeffafsa alan otomatik bulunur. Bulunamazsa ya da
              yanlış yerdeyse alanı elle çizin. Paspartu baskıdan geliyorsa görselde paspartu
              bulunmamalı; yoksa iki kez uygulanmış görünür.
            </Text>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

/** Kayıtlı görsel ve (varsa) elle çizilmiş alanı gösterir */
function MockupPreview({ url, opening }: { url: string; opening?: MockupOpeningRect }) {
  return (
    <div className="fs-mockup-preview">
      <div className="fs-mockup-frame">
        <img src={url} alt="" draggable={false} />
        {opening && (
          <div
            className="fs-mockup-opening is-saved"
            style={{
              left: `${opening.x * 100}%`, top: `${opening.y * 100}%`,
              width: `${opening.w * 100}%`, height: `${opening.h * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

type DragMode = { kind: "draw" | "move" | "resize"; startX: number; startY: number; origin: Rect };

/**
 * Açıklığı görselin üstünde çizdirir. Boş yerden sürüklemek yeni alan çizer,
 * alanın içinden sürüklemek taşır, sağ alt köşe boyutlandırır. Oran kilidi
 * açıksa yükseklik genişlikten, görselin piksel oranı hesaba katılarak türetilir.
 */
function OpeningDrawer({
  imageUrl, initial, designAspect, busy, onCancel, onApply,
}: {
  imageUrl: string;
  initial?: Rect;
  designAspect?: number;
  busy: boolean;
  onCancel: () => void;
  onApply: (rect: Rect, natural: { w: number; h: number }) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [lock, setLock] = useState(Boolean(designAspect));
  const [rect, setRect] = useState<Rect | null>(initial ?? null);
  const [drag, setDrag] = useState<DragMode | null>(null);

  // Görsel yüklenince, çizilmiş alan yoksa ortada makul bir başlangıç alanı
  useEffect(() => {
    if (!natural || rect) return;
    const w = 0.5;
    const h = lock && designAspect ? heightFor(w, natural, designAspect) : 0.5;
    setRect({ x: (1 - w) / 2, y: Math.max(0, (1 - h) / 2), w, h: Math.min(1, h) });
  }, [natural]);

  function norm(e: { clientX: number; clientY: number }) {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function lockHeight(next: Rect): Rect {
    if (!lock || !designAspect || !natural) return next;
    let h = heightFor(next.w, natural, designAspect);
    let w = next.w;
    if (next.y + h > 1) {
      h = 1 - next.y;
      w = (h * natural.h * designAspect) / natural.w;
    }
    return { ...next, w, h };
  }

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const p = norm(e);
      const o = drag.origin;
      let next: Rect;
      if (drag.kind === "move") {
        next = {
          ...o,
          x: Math.min(1 - o.w, Math.max(0, o.x + p.x - drag.startX)),
          y: Math.min(1 - o.h, Math.max(0, o.y + p.y - drag.startY)),
        };
      } else if (drag.kind === "resize") {
        next = lockHeight({ ...o, w: Math.max(0.02, Math.min(1 - o.x, p.x - o.x)), h: Math.max(0.02, Math.min(1 - o.y, p.y - o.y)) });
      } else {
        const x = Math.min(drag.startX, p.x);
        const y = Math.min(drag.startY, p.y);
        next = lockHeight({ x, y, w: Math.max(0.02, Math.abs(p.x - drag.startX)), h: Math.max(0.02, Math.abs(p.y - drag.startY)) });
      }
      setRect(next);
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, lock, natural, designAspect]);

  function start(e: React.PointerEvent, kind: DragMode["kind"]) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = norm(e);
    const origin = kind === "draw" ? { x: p.x, y: p.y, w: 0.02, h: 0.02 } : rect!;
    if (kind === "draw") setRect(origin);
    setDrag({ kind, startX: p.x, startY: p.y, origin });
  }

  const aspectOff = rect && natural && designAspect
    ? Math.abs((rect.w * natural.w) / (rect.h * natural.h) - designAspect) / designAspect > 0.02
    : false;

  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm">
        Müşterinin tasarımının görüneceği alanı görselin üstünde sürükleyerek çizin. Alanın içinden
        tutup taşıyabilir, sağ alt köşeden boyutlandırabilirsiniz.
      </Text>
      <div className="fs-mockup-preview">
        <div
          ref={boxRef}
          className="fs-mockup-frame is-drawing"
          onPointerDown={(e) => start(e, "draw")}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
          {rect && (
            <div
              className="fs-mockup-opening"
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
              onPointerDown={(e) => start(e, "move")}
            >
              <span className="fs-mockup-handle" onPointerDown={(e) => start(e, "resize")} />
            </div>
          )}
        </div>
      </div>
      {designAspect && (
        <Checkbox
          label="Tasarımın oranına kilitle"
          checked={lock}
          onChange={(v) => {
            setLock(v);
            if (v && rect && natural) setRect(lockHeight(rect));
          }}
          helpText={aspectOff
            ? "Alanın oranı tasarımdan farklı; müşteri sayfasında tasarım bu alana esnetilerek sığdırılır."
            : "Tasarım alanın içine esnemeden oturur."}
        />
      )}
      <InlineStack gap="200">
        <Button variant="primary" loading={busy} disabled={!rect || !natural} onClick={() => rect && natural && onApply(rect, natural)}>
          Alanı uygula
        </Button>
        <Button onClick={onCancel} disabled={busy}>Vazgeç</Button>
      </InlineStack>
    </BlockStack>
  );
}

/** Kilitli oranda, görselin piksel oranını hesaba katarak normalize yükseklik */
function heightFor(w: number, natural: { w: number; h: number }, designAspect: number): number {
  return (w * natural.w) / (designAspect * natural.h);
}
