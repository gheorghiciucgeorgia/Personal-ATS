import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import './pdfWorker';

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
};

function normalizeResumeText(s: string): string {
  let t = s.replace(/\r/g, '');
  // collapse spaced hyphens: "Georgia - Elena" -> "Georgia-Elena"
  t = t.replace(/([A-Za-z])\s*-\s*([A-Za-z])/g, '$1-$2');
  // collapse multiple spaces
  t = t.replace(/[ \t]{2,}/g, ' ');
  // normalize bullets
  t = t.replace(/\n[ \t]*•[ \t]*/g, '\n- ');
  // reduce extra blank lines
  t = t.replace(/\n{3,}/g, '\n\n');
  // uppercase common section headings
  t = t.replace(/^(summary|skills|work experience|experience|education|certifications|projects)\b/gim, m => m.toUpperCase());
  // trim lines
  t = t.split('\n').map(l => l.trim()).join('\n');
  return t.trim();
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    const items = content.items as unknown as TextItem[];

    const tokens = items.map(it => {
      const [, , , , x, y] = it.transform;
      return { x, y, w: it.width, text: it.str };
    });

    // sort top->bottom (y desc), left->right (x asc)
    tokens.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));

    // group by line (tolerance on y)
    const lineTol = 3;
    const gapTol = 2;
    const lines: { y: number; parts: { x: number; w: number; text: string }[] }[] = [];
    for (const t of tokens) {
      const last = lines[lines.length - 1];
      if (!last || Math.abs(last.y - t.y) > lineTol) {
        lines.push({ y: t.y, parts: [{ x: t.x, w: t.w, text: t.text }] });
      } else {
        last.parts.push({ x: t.x, w: t.w, text: t.text });
      }
    }

    const pageText = lines
      .map(line => {
        line.parts.sort((a, b) => a.x - b.x);
        let s = '';
        for (let j = 0; j < line.parts.length; j++) {
          const cur = line.parts[j];
          if (j > 0) {
            const prev = line.parts[j - 1];
            const gap = cur.x - (prev.x + prev.w);
            if (gap > gapTol) s += ' ';
          }
          s += cur.text;
        }
        return s;
      })
      .join('\n');

    pages.push(pageText);
  }

  return normalizeResumeText(pages.join('\n'));
}
