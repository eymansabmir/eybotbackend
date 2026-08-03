import { describe, expect, it } from 'vitest';
import { formatWhatsAppText } from './whatsapp-format';

describe('formatWhatsAppText', () => {
  it('converts markdown bold/italic/strike to WhatsApp markers', () => {
    expect(formatWhatsAppText('**bold** and __italic__ and ~~old~~')).toBe(
      '*bold* and _italic_ and ~old~',
    );
  });

  it('normalizes bullets and strips headings', () => {
    const out = formatWhatsAppText('## Title\n- one\n• two');
    expect(out).toContain('* one');
    expect(out).toContain('* two');
    expect(out).not.toContain('##');
  });
});
