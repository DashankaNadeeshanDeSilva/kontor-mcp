/**
 * Minimal deterministic flow layout on pdf-lib (Task 2.7): wrapped text, key/value rows, two columns,
 * tables with page breaks and repeated headers, page footers. Text only (embedded fonts, DeviceRGB
 * greys) so the output stays PDF/A-3b-safe without a browser or a native renderer.
 */
import { type PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

export interface TextStyle {
  size?: number;
  bold?: boolean;
  muted?: boolean;
  align?: "left" | "right";
}

export interface Column {
  title: string;
  /** Width in points. */
  width: number;
  align?: "left" | "right";
}

export type Cell = { text: string; muted?: boolean; bold?: boolean };
export type Row = Array<string | Cell[]>;
export type Block =
  | { kind: "label"; s: string }
  | { kind: "text"; s: string; st?: TextStyle }
  | { kind: "kv"; pairs: Array<[string, string | undefined]> }
  | { kind: "gap"; h: number };

export const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.37, 0.39, 0.41);
const LINE = rgb(0.9, 0.91, 0.92);

export class PageFlow {
  readonly margin = 48;
  readonly width: number;
  readonly bodyWidth: number;
  private page: PDFPage;
  private y = 0;
  private readonly pages: PDFPage[] = [];
  private readonly glyphs: Set<number>;

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: Fonts,
    private readonly footer: (pageNo: number, total: number) => string,
  ) {
    this.width = A4[0];
    this.bodyWidth = A4[0] - 2 * this.margin;
    this.glyphs = new Set(fonts.regular.getCharacterSet());
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - this.margin;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Replace characters the embedded font cannot show (PDF/A forbids missing glyphs → notdef). */
  sanitize(s: string): string {
    let out = "";
    for (const ch of s.replace(/\r\n?/g, "\n").replace(/\t/g, "  ")) {
      const cp = ch.codePointAt(0) ?? 0;
      if (ch === "\n") out += ch;
      else if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) out += " ";
      else if (this.glyphs.has(cp)) out += ch;
      else out += this.glyphs.has(0x25a1) ? "□" : "?";
    }
    return out;
  }

  private font(bold?: boolean): PDFFont {
    return bold ? this.fonts.bold : this.fonts.regular;
  }

  /** Word-wrap sanitized text into lines that fit `width` at `size`. */
  wrap(text: string, width: number, size: number, bold?: boolean): string[] {
    const font = this.font(bold);
    const out: string[] = [];
    for (const para of this.sanitize(text).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        out.push("");
        continue;
      }
      let line = "";
      for (const w of words) {
        const candidate = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
        else {
          if (line) out.push(line);
          // hard-break a single over-long token
          let chunk = "";
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > width && chunk) {
              out.push(chunk);
              chunk = "";
            }
            chunk += ch;
          }
          line = chunk;
        }
      }
      out.push(line);
    }
    return out;
  }

  private newPage(): void {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - this.margin;
  }

  /** Make room for `h` points, starting a new page if needed. */
  ensure(h: number): void {
    if (this.y - h < this.margin + 28) this.newPage();
  }

  gap(h: number): void {
    this.y -= h;
  }

  rule(): void {
    this.ensure(4);
    this.page.drawLine({
      start: { x: this.margin, y: this.y },
      end: { x: this.margin + this.bodyWidth, y: this.y },
      thickness: 0.6,
      color: LINE,
    });
    this.y -= 4;
  }

  private drawLine(
    s: string,
    x: number,
    y: number,
    width: number,
    size: number,
    st: TextStyle,
  ): void {
    const font = this.font(st.bold);
    const dx = st.align === "right" ? width - font.widthOfTextAtSize(s, size) : 0;
    this.page.drawText(s, { x: x + dx, y, size, font, color: st.muted ? MUTED : INK });
  }

  /** Draw wrapped text across the body width (or a sub-column) and advance. */
  text(s: string, st: TextStyle = {}, x = this.margin, width = this.bodyWidth): void {
    const size = st.size ?? 10;
    const lh = size * 1.35;
    for (const line of this.wrap(s, width, size, st.bold)) {
      this.ensure(lh);
      this.y -= lh;
      this.drawLine(line, x, this.y + size * 0.28, width, size, st);
    }
  }

  /** Small upper-case section label, as the HTML preview's `.card h2`. */
  sectionLabel(s: string, x = this.margin, width = this.bodyWidth): void {
    this.gap(6);
    this.text(s.toUpperCase(), { size: 8, muted: true, bold: true }, x, width);
    this.gap(2);
  }

  /**
   * Two-column block (seller/buyer, payment/delivery). Blocks are pre-measured so the pair is kept
   * together on one page when it fits; a block taller than a page simply flows.
   */
  columns(left: Block[], right: Block[]): void {
    const gapW = 24;
    const colW = (this.bodyWidth - gapW) / 2;
    const h = Math.max(this.measure(left, colW), this.measure(right, colW));
    this.ensure(h);
    const y0 = this.y;
    this.blocks(left, this.margin, colW);
    const yl = this.y;
    this.y = y0;
    this.blocks(right, this.margin + colW + gapW, colW);
    this.y = Math.min(yl, this.y);
  }

  private measure(blocks: Block[], width: number): number {
    let h = 0;
    for (const b of blocks) {
      if (b.kind === "gap") h += b.h;
      else if (b.kind === "label") h += 8 + 8 * 1.35;
      else if (b.kind === "text") {
        const size = b.st?.size ?? 10;
        h += this.wrap(b.s, width, size, b.st?.bold).length * size * 1.35;
      } else h += this.kvHeight(b.pairs, width);
    }
    return h;
  }

  blocks(blocks: Block[], x: number, width: number): void {
    for (const b of blocks) {
      if (b.kind === "gap") this.gap(b.h);
      else if (b.kind === "label") this.sectionLabel(b.s, x, width);
      else if (b.kind === "text") this.text(b.s, b.st ?? {}, x, width);
      else this.keyValues(b.pairs, x, width);
    }
  }

  private kvHeight(pairs: Array<[string, string | undefined]>, width: number): number {
    const size = 9.5;
    const rows = pairs.filter((p): p is [string, string] => Boolean(p[1]));
    if (!rows.length) return 0;
    const labelW = this.labelWidth(rows, width, size);
    return rows.reduce(
      (a, [, v]) => a + this.wrap(v, width - labelW, size).length * size * 1.35,
      0,
    );
  }

  private labelWidth(rows: Array<[string, string]>, width: number, size: number): number {
    return Math.min(
      width * 0.45,
      Math.max(...rows.map(([k]) => this.fonts.regular.widthOfTextAtSize(this.sanitize(k), size))) +
        10,
    );
  }

  /** Key/value rows (label muted, value wrapped), like the preview's <dl>. */
  keyValues(
    pairs: Array<[string, string | undefined]>,
    x = this.margin,
    width = this.bodyWidth,
  ): void {
    const rows = pairs.filter((p): p is [string, string] => Boolean(p[1]));
    if (!rows.length) return;
    const size = 9.5;
    const labelW = this.labelWidth(rows, width, size);
    for (const [k, v] of rows) {
      const lines = this.wrap(v, width - labelW, size);
      const lh = size * 1.35;
      this.ensure(lh * lines.length);
      const top = this.y;
      this.y -= lh;
      this.drawLine(this.sanitize(k), x, this.y + size * 0.28, labelW, size, { muted: true });
      this.y = top;
      for (const line of lines) {
        this.y -= lh;
        this.drawLine(line, x + labelW, this.y + size * 0.28, width - labelW, size, {});
      }
    }
  }

  /** Table with header repeated after page breaks; rows never split across pages. */
  table(
    columns: Column[],
    rows: Row[],
    opts: { header?: boolean; size?: number; grandLast?: boolean } = {},
  ): void {
    const size = opts.size ?? 9.5;
    const lh = size * 1.35;
    const pad = 4;
    const total = columns.reduce((a, c) => a + c.width, 0);
    const x0 = this.margin + (this.bodyWidth - total);
    const xs = columns.map((_, i) => x0 + columns.slice(0, i).reduce((a, c) => a + c.width, 0));
    const header = () => {
      if (opts.header === false) return;
      this.ensure(lh + pad * 2 + 2);
      this.y -= pad;
      columns.forEach((c, i) => {
        this.y -= lh;
        this.drawLine(
          this.sanitize(c.title.toUpperCase()),
          (xs[i] ?? 0) + 3,
          this.y + size * 0.28,
          c.width - 6,
          8,
          {
            muted: true,
            bold: true,
            ...(c.align ? { align: c.align } : {}),
          },
        );
        this.y += lh;
      });
      this.y -= lh + pad;
      this.rule();
    };
    header();
    rows.forEach((row, ri) => {
      const cells = row.map((cell, i) => {
        const col = columns[i] ?? { title: "", width: 0 };
        const parts: Cell[] = typeof cell === "string" ? [{ text: cell }] : cell;
        const lines: Array<{ s: string; st: TextStyle }> = [];
        for (const p of parts)
          for (const s of this.wrap(p.text, col.width - 6, size, p.bold))
            lines.push({
              s,
              st: {
                ...(p.muted ? { muted: true } : {}),
                ...(p.bold ? { bold: true } : {}),
                ...(col.align ? { align: col.align } : {}),
              },
            });
        return lines;
      });
      const n = Math.max(1, ...cells.map((c) => c.length));
      const h = n * lh + pad * 2;
      if (this.y - h < this.margin + 28) {
        this.newPage();
        header();
      }
      const grand = opts.grandLast && ri === rows.length - 1;
      if (grand) {
        this.page.drawLine({
          start: { x: x0, y: this.y },
          end: { x: x0 + total, y: this.y },
          thickness: 1.2,
          color: INK,
        });
      }
      const top = this.y - pad;
      cells.forEach((lines, i) => {
        lines.forEach((l, li) => {
          const y = top - lh * (li + 1) + size * 0.28;
          this.drawLine(
            l.s,
            (xs[i] ?? 0) + 3,
            y,
            (columns[i]?.width ?? 0) - 6,
            size,
            grand ? { ...l.st, bold: true } : l.st,
          );
        });
      });
      this.y -= h;
      if (!grand && opts.header !== false) this.rule();
    });
  }

  /** Draw the footer on every page; call once after all content. */
  finish(): void {
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      const s = this.sanitize(this.footer(i + 1, n));
      const size = 7.5;
      const lines = this.wrap(s, this.bodyWidth, size);
      lines.forEach((line, li) => {
        p.drawText(line, {
          x: this.margin,
          y: this.margin - 14 - li * size * 1.3,
          size,
          font: this.fonts.regular,
          color: MUTED,
        });
      });
    });
  }
}
