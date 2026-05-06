window.BikafaTshirtPreview = {
  async create(sideName, side) {
    const W = 1200, H = 1500;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#f7f5f0";
    ctx.fillRect(0, 0, W, H);
    drawShirt(ctx, sideName, W, H);

    // Print area bounds (matches CSS .dsgn-print-area)
    const areaX = W * 0.11, areaY = H * 0.10;
    const areaW = W * 0.78, areaH = H * 0.82;

    if (side.imageDataUrl) {
      const image = await loadImage(side.imageDataUrl);
      const scale = Math.min(areaW / image.width, areaH / image.height) * (side.imageScale / 100);
      const dw = image.width * scale, dh = image.height * scale;
      const cx = areaX + (areaW * side.imageX) / 100;
      const cy = areaY + (areaH * side.imageY) / 100;

      ctx.save();
      ctx.translate(cx, cy);
      if (side.imageRotate) ctx.rotate((side.imageRotate * Math.PI) / 180);
      ctx.scale(side.flipH ? -1 : 1, side.flipV ? -1 : 1);
      ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    if (side.text) {
      const cx = areaX + (areaW * (side.textX || 50)) / 100;
      const cy = areaY + (areaH * (side.textY || 78)) / 100;
      const fs = (side.fontSize || 30) * 3;
      const font = [
        side.italic ? "italic" : "",
        (side.bold ? "800" : "400"),
        fs + "px",
        side.fontFamily || "Arial, sans-serif",
      ].filter(Boolean).join(" ");

      ctx.save();
      ctx.fillStyle = side.textColor || "#111";
      ctx.font = font;
      ctx.textAlign = side.textAlign || "center";
      ctx.textBaseline = "middle";
      wrapText(ctx, side.text, cx, cy, areaW * 0.92, fs * 1.25, side);
      ctx.restore();
    }

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
  },

  async createPrintFile(sideName, side) {
    const W = 4500, H = 5400;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    await drawDesign(ctx, side, W, H);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  },
};

function drawShirt(ctx, sideName, W, H) {
  ctx.save();
  const sx = W / 1200, sy = H / 1500;
  ctx.scale(sx, sy);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d9dde3";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(350, 130); ctx.lineTo(465, 245); ctx.lineTo(735, 245);
  ctx.lineTo(850, 130); ctx.lineTo(1110, 330); ctx.lineTo(970, 620);
  ctx.lineTo(850, 555); ctx.lineTo(850, 1320); ctx.lineTo(350, 1320);
  ctx.lineTo(350, 555); ctx.lineTo(230, 620); ctx.lineTo(90, 330);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.strokeStyle = "#ececec"; ctx.lineWidth = 36;
  ctx.beginPath(); ctx.arc(600, 160, 120, 0, Math.PI); ctx.stroke();

  // Print area dashed border
  ctx.strokeStyle = "rgba(15,118,110,.4)"; ctx.setLineDash([14, 14]); ctx.lineWidth = 4;
  ctx.strokeRect(288, 420, 624, 570); ctx.setLineDash([]);

  ctx.fillStyle = "#9ca3af"; ctx.font = "700 32px Arial,sans-serif"; ctx.textAlign = "center";
  ctx.fillText(sideName === "front" ? "ÖN BASKI" : "ARKA BASKI", 600, 360);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawDesign(ctx, side, W, H) {
  if (side.imageDataUrl) {
    const image = await loadImage(side.imageDataUrl);
    const scale = Math.min(W / image.width, H / image.height) * (side.imageScale / 100);
    const dw = image.width * scale, dh = image.height * scale;
    const cx = W * (side.imageX || 50) / 100;
    const cy = H * (side.imageY || 44) / 100;

    ctx.save();
    ctx.translate(cx, cy);
    if (side.imageRotate) ctx.rotate((side.imageRotate * Math.PI) / 180);
    ctx.scale(side.flipH ? -1 : 1, side.flipV ? -1 : 1);
    ctx.drawImage(image, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  if (side.text) {
    const fs = (side.fontSize || 30) * 8;
    const cx = W * (side.textX || 50) / 100;
    const cy = H * (side.textY || 78) / 100;
    const font = [
      side.italic ? "italic" : "",
      (side.bold ? "800" : "400"),
      fs + "px",
      side.fontFamily || "Arial, sans-serif",
    ].filter(Boolean).join(" ");

    ctx.save();
    ctx.fillStyle = side.textColor || "#111";
    ctx.font = font;
    ctx.textAlign = side.textAlign || "center";
    ctx.textBaseline = "middle";
    wrapText(ctx, side.text, cx, cy, W * 0.92, fs * 1.25, side);
    ctx.restore();
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, side) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line); line = word;
    } else { line = test; }
  });
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((txt, i) => drawTextLine(ctx, txt, x, startY + i * lineHeight, side, lineHeight));
}

function drawTextLine(ctx, text, x, y, side, lineHeight) {
  const spacing = (side.letterSpacing || 0) * 3;
  if (!spacing) {
    ctx.fillText(text, x, y);
    if (side.underline) drawUnderline(ctx, text, x, y, lineHeight);
    return;
  }
  const chars = [...text];
  const totalWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, -spacing);
  let cursor = ctx.textAlign === "right" ? x - totalWidth
             : ctx.textAlign === "center" ? x - totalWidth / 2 : x;
  chars.forEach((ch) => {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  });
  if (side.underline) {
    const start = ctx.textAlign === "right" ? x - totalWidth : ctx.textAlign === "center" ? x - totalWidth / 2 : x;
    ctx.beginPath(); ctx.moveTo(start, y + lineHeight * 0.35); ctx.lineTo(start + totalWidth, y + lineHeight * 0.35);
    ctx.lineWidth = 5; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
  }
}

function drawUnderline(ctx, text, x, y, lineHeight) {
  const w = ctx.measureText(text).width;
  const start = ctx.textAlign === "right" ? x - w : ctx.textAlign === "center" ? x - w / 2 : x;
  ctx.beginPath(); ctx.moveTo(start, y + lineHeight * 0.35); ctx.lineTo(start + w, y + lineHeight * 0.35);
  ctx.lineWidth = 5; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
}
