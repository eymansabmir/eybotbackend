/**
 * WhatsApp plain-text formatting guardrails.
 * Supports: *bold* _italic_ ~strike~ ```monospace``` `code` lists quotes.
 * Strips / rewrites common Markdown that WhatsApp does not render.
 */

const MAX_BODY = 3500;

/** Normalize model / markdown output into WhatsApp-safe text. */
export function formatWhatsAppText(input: string): string {
  let text = input.replace(/\r\n/g, '\n').trim();

  // Common Markdown → WhatsApp
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*'); // **bold** → *bold*
  text = text.replace(/__(.+?)__/g, '_$1_'); // __italic__ → _italic_
  text = text.replace(/~~(.+?)~~/g, '~$1~'); // ~~strike~~ → ~strike~
  text = text.replace(/^#{1,6}\s+/gm, ''); // headings → plain
  text = text.replace(/^\s*[-•]\s+/gm, '* '); // bullets → * 
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'); // links → label (url)

  // Remove HTML tags if any slipped through
  text = text.replace(/<\/?[^>]+>/g, '');

  // Collapse excess blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  // Ensure space after emoji clusters before letters (readability)
  text = text.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])([A-Za-z*])/gu, '$1 $2');

  return text.slice(0, MAX_BODY).trim();
}

/**
 * Light professional emoji set for EY-style WhatsApp replies.
 * Prefer 0–2 per message; never spam.
 */
export const WA_EMOJI = {
  welcome: '👋',
  lens: '🔎',
  checklist: '✅',
  tip: '💡',
  warning: '⚠️',
  chart: '📊',
  cloud: '☁️',
  shield: '🛡️',
  people: '👥',
  rocket: '🚀',
  next: '➡️',
  pin: '📌',
} as const;
