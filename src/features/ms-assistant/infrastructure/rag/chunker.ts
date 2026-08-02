export interface KnowledgeChunk {
  id: string;
  text: string;
  source: string;
  title: string;
}

const TARGET_CHARS = 2800; // ~700–800 tokens rough
const OVERLAP_CHARS = 400;

/**
 * Markdown-aware chunking: split on headings, then pack into ~TARGET_CHARS windows.
 */
export function chunkMarkdown(
  content: string,
  source: string,
  title: string,
): KnowledgeChunk[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const sections = splitByHeadings(normalized, title);
  const chunks: KnowledgeChunk[] = [];
  let counter = 0;

  for (const section of sections) {
    if (section.body.length <= TARGET_CHARS) {
      const text = `${section.heading}\n\n${section.body}`.trim();
      chunks.push({
        id: `${slug(source)}-${counter++}`,
        text,
        source,
        title: section.heading || title,
      });
      continue;
    }

    let start = 0;
    while (start < section.body.length) {
      const end = Math.min(start + TARGET_CHARS, section.body.length);
      const slice = section.body.slice(start, end).trim();
      if (slice) {
        chunks.push({
          id: `${slug(source)}-${counter++}`,
          text: `${section.heading}\n\n${slice}`.trim(),
          source,
          title: section.heading || title,
        });
      }
      if (end >= section.body.length) break;
      start = Math.max(0, end - OVERLAP_CHARS);
    }
  }

  return chunks;
}

function splitByHeadings(
  content: string,
  fallbackTitle: string,
): Array<{ heading: string; body: string }> {
  const lines = content.split('\n');
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = fallbackTitle;
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body || sections.length === 0) {
      sections.push({ heading, body: body || content.slice(0, TARGET_CHARS) });
    }
    buf = [];
  };

  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      if (buf.length) flush();
      heading = h[1]!.trim();
      continue;
    }
    buf.push(line);
  }
  if (buf.length) flush();

  return sections.filter((s) => s.body.trim().length > 0);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
