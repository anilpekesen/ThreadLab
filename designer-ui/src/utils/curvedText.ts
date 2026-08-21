import { fabric } from 'fabric';

export interface CurvedTextOptions extends fabric.IObjectOptions {
  text?: string;
  radius?: number;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  fontWeight?: string;
  fontStyle?: string;
  reverse?: boolean;
  charSpacing?: number;
}

interface Glyph {
  char: string;
  /** Center of the glyph in the arc frame */
  x: number;
  y: number;
  /** Rotation applied to the glyph, in radians */
  angle: number;
  width: number;
}

interface Layout {
  glyphs: Glyph[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Shared 1x1 offscreen context, used only for text measurement. */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    const el = fabric.util.createCanvasElement();
    el.width = 1;
    el.height = 1;
    measureCtx = el.getContext('2d');
  }
  return measureCtx ?? null;
}

export class CurvedText extends fabric.Object {
  type = 'curvedText';
  text: string;
  radius: number;
  fontSize: number;
  fontFamily: string;
  fill: string;
  fontWeight: string;
  fontStyle: string;
  reverse: boolean;
  charSpacing: number;

  // Fabric renders cached objects into an offscreen canvas sized from
  // width/height, so anything the arc draws outside that box is silently cut
  // off - and on large exports fabric also caps the cache resolution
  // (fabric.perfLimitSizeTotal), which softens the glyphs. A curved text is
  // only a handful of fillText calls, so drawing it live is cheap and avoids
  // both problems.
  objectCaching = false;

  private _layout: Layout | null = null;
  private _layoutKey = '';
  private _offsetX = 0;
  private _offsetY = 0;

  constructor(options: CurvedTextOptions = {}) {
    super(options as fabric.IObjectOptions);
    this.text = String(options.text ?? 'Kavisli Yazı');
    this.radius = Number(options.radius ?? 100);
    this.fontSize = Number(options.fontSize ?? 36);
    this.fontFamily = String(options.fontFamily ?? 'Inter');
    this.fill = String(options.fill ?? '#111827');
    this.fontWeight = String(options.fontWeight ?? 'normal');
    this.fontStyle = String(options.fontStyle ?? 'normal');
    this.reverse = Boolean(options.reverse ?? false);
    this.charSpacing = Number(options.charSpacing ?? 0);
    this._refreshBounds();
  }

  /**
   * Assigns text/appearance properties and keeps the bounding box, the cached
   * glyph layout and the canvas in sync. Prefer this over assigning fields
   * directly - a raw assignment leaves the box (and fabric's cache) stale.
   */
  applyProps(props: Partial<CurvedTextOptions>): void {
    if (props.text !== undefined) this.text = String(props.text);
    if (props.radius !== undefined) this.radius = Number(props.radius);
    if (props.fontSize !== undefined) this.fontSize = Number(props.fontSize);
    if (props.fontFamily !== undefined) this.fontFamily = String(props.fontFamily);
    if (props.fill !== undefined) this.fill = String(props.fill);
    if (props.fontWeight !== undefined) this.fontWeight = String(props.fontWeight);
    if (props.fontStyle !== undefined) this.fontStyle = String(props.fontStyle);
    if (props.reverse !== undefined) this.reverse = Boolean(props.reverse);
    if (props.charSpacing !== undefined) this.charSpacing = Number(props.charSpacing);
    this._refreshBounds();
    this.setCoords();
  }

  private _font(): string {
    return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px '${this.fontFamily}', sans-serif`;
  }

  /** Everything the glyph layout depends on - used to detect a stale layout. */
  private _key(): string {
    return [
      this.text,
      this.radius,
      this.fontSize,
      this.fontFamily,
      this.fontWeight,
      this.fontStyle,
      this.reverse,
      this.charSpacing,
    ].join(' ');
  }

  /**
   * Places every character on the arc and measures the real extent of the
   * result. Character widths and ascent/descent come from the browser's own
   * text metrics, so the box matches whatever font actually renders.
   */
  private _buildLayout(): Layout {
    const chars = [...this.text];
    const r = Math.max(this.radius, 1);
    const fs = this.fontSize;
    const extra = this.charSpacing;

    const ctx = getMeasureCtx();
    let widths: number[];
    // Fallbacks for the (rare) case where metrics are unavailable
    let ascent = fs * 0.8;
    let descent = fs * 0.3;

    if (ctx) {
      ctx.font = this._font();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      widths = chars.map((c) => ctx.measureText(c).width);
      const m = ctx.measureText(this.text || 'Hg');
      // Measured from the 'middle' baseline, matching how the glyphs are drawn.
      if (typeof m.actualBoundingBoxAscent === 'number' && isFinite(m.actualBoundingBoxAscent)) {
        ascent = Math.max(m.actualBoundingBoxAscent, fs * 0.35);
      }
      if (typeof m.actualBoundingBoxDescent === 'number' && isFinite(m.actualBoundingBoxDescent)) {
        descent = Math.max(m.actualBoundingBoxDescent, fs * 0.2);
      }
    } else {
      widths = chars.map(() => fs * 0.6);
    }

    const totalWidth =
      widths.reduce((s, w) => s + w, 0) + extra * Math.max(chars.length - 1, 0);
    const totalAngle = totalWidth / r;
    const dir = this.reverse ? -1 : 1;
    // Arc centre sits r away from the middle character, on the opposite side
    const yOffset = this.reverse ? -r : r;
    let theta = this.reverse
      ? Math.PI / 2 + totalAngle / 2
      : -Math.PI / 2 - totalAngle / 2;

    const glyphs: Glyph[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < chars.length; i++) {
      const halfA = widths[i] / 2 / r;
      theta += dir * halfA;

      const angle = theta + (this.reverse ? -Math.PI / 2 : Math.PI / 2);
      const g: Glyph = {
        char: chars[i],
        x: Math.cos(theta) * r,
        y: Math.sin(theta) * r + yOffset,
        angle,
        width: widths[i],
      };
      glyphs.push(g);

      // Rotated glyph box -> arc-frame corners
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hw = g.width / 2;
      const corners: Array<[number, number]> = [
        [-hw, -ascent],
        [hw, -ascent],
        [hw, descent],
        [-hw, descent],
      ];
      for (const [lx, ly] of corners) {
        const px = g.x + lx * cos - ly * sin;
        const py = g.y + lx * sin + ly * cos;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }

      theta += dir * (halfA + extra / r);
    }

    if (!glyphs.length) {
      minX = -fs;
      maxX = fs;
      minY = -fs * 0.8;
      maxY = fs * 0.8;
    }

    return { glyphs, minX, maxX, minY, maxY };
  }

  /**
   * Recomputes the tight bounding box from the measured arc plus the offset
   * that recentres the arc inside it. The arc is strongly asymmetric - the
   * outer characters drop far below the middle one - so the drawing has to be
   * shifted, otherwise the box would sit around the wrong area and cut the
   * outer characters in half.
   */
  _refreshBounds(): void {
    const layout = this._buildLayout();
    this._layout = layout;
    this._layoutKey = this._key();

    const pad = Math.max(this.fontSize * 0.06, 1);
    this.width = Math.max(layout.maxX - layout.minX + pad * 2, 1);
    this.height = Math.max(layout.maxY - layout.minY + pad * 2, 1);
    this._offsetX = -(layout.minX + layout.maxX) / 2;
    this._offsetY = -(layout.minY + layout.maxY) / 2;
    this.dirty = true;
  }

  _render(ctx: CanvasRenderingContext2D) {
    // Self-heal if a property was assigned without going through applyProps
    // (e.g. a webfont finished loading and changed the metrics).
    if (!this._layout || this._layoutKey !== this._key()) this._refreshBounds();
    const layout = this._layout;
    if (!layout || !layout.glyphs.length) return;

    ctx.font = this._font();
    ctx.fillStyle = this.fill as string;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (const g of layout.glyphs) {
      ctx.save();
      ctx.translate(this._offsetX + g.x, this._offsetY + g.y);
      ctx.rotate(g.angle);
      ctx.fillText(g.char, 0, 0);
      ctx.restore();
    }
  }

  toObject(propertiesToInclude?: string[]) {
    return {
      ...super.toObject(propertiesToInclude),
      text: this.text,
      radius: this.radius,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fill: this.fill,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      reverse: this.reverse,
      charSpacing: this.charSpacing,
    };
  }

  static fromObject(
    options: Record<string, unknown>,
    callback?: (obj: CurvedText) => void,
  ): CurvedText {
    const obj = new CurvedText(options as CurvedTextOptions);
    callback?.(obj);
    return obj;
  }
}

/** Call once at app startup to enable save/load of curved text objects. */
export function registerCurvedText(): void {
  (fabric as typeof fabric & { CurvedText: typeof CurvedText }).CurvedText = CurvedText;
}
