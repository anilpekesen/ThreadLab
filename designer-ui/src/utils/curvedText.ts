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
   * Computes a tight bounding box based on the visible arc area.
   * The rendering is offset so the center character sits at (0, 0)
   * in the local frame — aligning the selection handles with the text.
   */
  _refreshBounds() {
    const chars = [...this.text];
    const n = Math.max(chars.length, 1);
    // Average char width estimate: ~0.55 × fontSize for most fonts
    const estimatedTotalWidth = n * this.fontSize * 0.55;
    const r = Math.max(this.radius, 1);
    const halfAngle = Math.min(estimatedTotalWidth / r / 2, Math.PI * 0.95);

    // Horizontal span of the arc (half-chord + one fontSize margin)
    const halfW = Math.min(Math.sin(halfAngle), 1) * r + this.fontSize * 0.8;
    this.width = Math.max(halfW * 2, this.fontSize * 2);

    // Vertical drop of the side characters below (top arc) / above (bottom arc)
    // the center character, plus room for the character glyph itself
    const drop = r * (1 - Math.cos(halfAngle));
    this.height = Math.max(drop + this.fontSize * 1.6, this.fontSize * 1.6);
  }

  private _font(): string {
    return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px '${this.fontFamily}', sans-serif`;
  }

  _render(ctx: CanvasRenderingContext2D) {
    ctx.font = this._font();
    ctx.fillStyle = this.fill as string;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const chars = [...this.text];
    if (!chars.length) return;

    const charWidths = chars.map((c) => ctx.measureText(c).width);
    const extra = this.charSpacing;
    const totalWidth =
      charWidths.reduce((s, w) => s + w, 0) + extra * Math.max(chars.length - 1, 0);
    const r = Math.max(this.radius, 1);
    const totalAngle = totalWidth / r;

    // Shift the entire arc so the CENTER character lands at (0, 0) in the
    // local frame. This makes the tight bounding box line up with the text.
    //   top arc:    translate +r downward  (text was at y = -r)
    //   bottom arc: translate -r upward    (text was at y = +r)
    const yOffset = this.reverse ? -r : r;

    const dir = this.reverse ? -1 : 1;
    let θ = this.reverse
      ? Math.PI / 2 + totalAngle / 2
      : -Math.PI / 2 - totalAngle / 2;

    ctx.save();
    ctx.translate(0, yOffset);

    for (let i = 0; i < chars.length; i++) {
      const halfA = charWidths[i] / 2 / r;
      θ += dir * halfA;

      ctx.save();
      ctx.translate(Math.cos(θ) * r, Math.sin(θ) * r);
      ctx.rotate(θ + (this.reverse ? -Math.PI / 2 : Math.PI / 2));
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();

      θ += dir * (halfA + extra / r);
    }

    ctx.restore();
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
