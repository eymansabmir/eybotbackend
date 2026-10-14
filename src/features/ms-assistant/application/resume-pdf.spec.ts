import { describe, expect, it } from 'vitest';
import { buildResumeHtml } from './resume-pdf';
describe('resume PDF template', () => {
  it('uses banner logo only (no duplicate heading text) and no JEEVIKA footer', () => {
    const html = buildResumeHtml({
      fullName: 'Test Candidate',
      skills: [],
      workHistory: [],
      languages: [],
      certifications: [],
    });
    expect(html).toContain('class="gov-banner"');
    expect(html).toContain('#24469C');
    expect(html).toMatch(/<img src="data:image\/png;base64,/);
    expect(html).not.toContain('class="org"');
    expect(html).not.toMatch(/JEEVIKA/i);
    expect(html).not.toMatch(/Bihar Rural Livelihoods/i);
    expect(html).not.toContain('class="footer"');
  });
});
