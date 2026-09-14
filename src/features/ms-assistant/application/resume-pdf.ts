import puppeteer, { type Browser } from 'puppeteer';
import { z } from 'zod';
import type { MsAssistantChat } from '../infrastructure/llm/shared';
import type { ResumeState, ResumeFieldKey } from './resume-builder';
import { logger } from '../../../utils/logger';
import { JEEVIKA_LOGO_DATA_URI, BRLPS_FULL_NAME, BRLPS_SCHEME } from './jeevika-logo';

const WorkItemSchema = z.object({
  role: z.string().optional(),
  employer: z.string().optional(),
  location: z.string().optional(),
  duration: z.string().optional(),
  description: z.string().optional(),
});

export const StructuredResumeSchema = z.object({
  fullName: z.string().min(1),
  title: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
  experienceYears: z.string().optional(),
  skills: z.array(z.string()).default([]),
  workHistory: z.array(WorkItemSchema).default([]),
  education: z.string().optional(),
  languages: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  expectedSalary: z.string().optional(),
  availability: z.string().optional(),
});

export type StructuredResume = z.infer<typeof StructuredResumeSchema>;

const STRUCTURE_SYSTEM_PROMPT = `You are a professional resume writer for blue-collar / frontline workers in India (drivers, electricians, plumbers, masons, helpers, cooks, security guards, etc.). You turn short interview answers (often in Hindi/Hinglish) into a polished, employer-ready resume in ENGLISH.

Rules:
- Translate all Hindi/Hinglish content into clear, simple, professional English.
- Do NOT invent facts (no fake employers, dates, or certificates). If a field is unknown, omit it or use an empty array.
- "title": a concise professional headline derived from their trade + seniority, e.g. "Experienced Delivery Driver", "Certified Electrician", "Site Helper".
- "summary": a warm, confident *About Me* paragraph of 3-4 full sentences (~45-70 words). Highlight their trade, years of experience, key strengths/skills, reliability, and availability. Written in third person, professional but simple. This is the centrepiece — make it genuinely good even from sparse input.
- "skills": 4-10 short skill phrases (infer sensible related skills from the trade + what they said, but stay realistic).
- "workHistory": parse the "past work" answer into entries; each may have role, employer, location, duration, description.
- "experienceYears", "expectedSalary", "availability", "education", "languages", "certifications": fill only from what they gave (normalize wording/units).
- Keep phone and salary numbers exactly as given (only tidy formatting).
- Output ONLY a JSON object matching this exact shape, no markdown, no commentary:
{"fullName":string,"title":string,"phone":string,"location":string,"summary":string,"experienceYears":string,"skills":string[],"workHistory":[{"role":string,"employer":string,"location":string,"duration":string,"description":string}],"education":string,"languages":string[],"certifications":string[],"expectedSalary":string,"availability":string}`;

const ANSWER_LABELS: Record<ResumeFieldKey, string> = {
  fullName: 'Full name',
  location: 'City/location',
  phone: 'Phone',
  trade: 'Type of work / trade',
  experience: 'Years of experience',
  pastWork: 'Past work / employers',
  skills: 'Skills',
  education: 'Education',
  languages: 'Languages',
  certifications: 'Certificates / licenses',
  expectedSalary: 'Expected salary (monthly)',
  availability: 'Availability',
};

function stripJsonFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

function splitList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,\n;/]|और|तथा/gi)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);
}

/** Deterministic fallback when the LLM is unavailable or returns junk. */
export function fallbackStructuredResume(state: ResumeState): StructuredResume {
  const a = state.answers;
  const trade = a.trade?.trim();
  const exp = a.experience?.trim();
  const summaryBits: string[] = [];
  if (trade) summaryBits.push(`${trade}${exp ? ` with ${exp} of experience` : ''}.`);
  if (a.skills?.trim()) summaryBits.push(`Skilled in ${a.skills.trim()}.`);
  if (a.availability?.trim()) summaryBits.push(`Available to start ${a.availability.trim()}.`);

  return StructuredResumeSchema.parse({
    fullName: a.fullName?.trim() || 'Candidate',
    title: trade || undefined,
    phone: a.phone?.trim() || undefined,
    location: a.location?.trim() || undefined,
    summary: summaryBits.join(' ') || undefined,
    experienceYears: exp || undefined,
    skills: splitList(a.skills),
    workHistory: a.pastWork?.trim() ? [{ description: a.pastWork.trim() }] : [],
    education: a.education?.trim() || undefined,
    languages: splitList(a.languages),
    certifications: splitList(a.certifications),
    expectedSalary: a.expectedSalary?.trim() || undefined,
    availability: a.availability?.trim() || undefined,
  });
}

/** Use the LLM to translate + structure the interview into an English resume. */
export async function structureResume(
  llm: MsAssistantChat,
  state: ResumeState,
): Promise<StructuredResume> {
  const fallback = fallbackStructuredResume(state);
  if (!llm.complete) return fallback;

  const qa = (Object.keys(ANSWER_LABELS) as ResumeFieldKey[])
    .filter((k) => state.answers[k]?.trim())
    .map((k) => `${ANSWER_LABELS[k]}: ${state.answers[k]}`)
    .join('\n');

  try {
    const raw = await llm.complete({
      system: STRUCTURE_SYSTEM_PROMPT,
      user: `Worker's answers:\n${qa}\n\nReturn the JSON resume now.`,
      temperature: 0.3,
      preferJsonObject: true,
    });
    const parsed = StructuredResumeSchema.safeParse(JSON.parse(stripJsonFences(raw)));
    if (parsed.success && parsed.data.fullName.trim()) {
      // Guarantee a summary even if the model skipped it.
      if (!parsed.data.summary?.trim()) parsed.data.summary = fallback.summary;
      return parsed.data;
    }
    logger.warn(
      { issues: parsed.success ? null : parsed.error.issues },
      'structureResume: invalid LLM JSON, using fallback',
    );
  } catch (err) {
    logger.warn({ err }, 'structureResume: LLM structuring failed, using fallback');
  }
  return fallback;
}

/* ── HTML template ──────────────────────────────────────────────────────── */

function esc(value?: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'R';
}

export function buildResumeHtml(resume: StructuredResume): string {
  const chip = (t: string) => `<span class="chip">${esc(t)}</span>`;

  const contactItems = [
    resume.phone ? `<div class="contact-item"><span class="ci">📞</span>${esc(resume.phone)}</div>` : '',
    resume.location ? `<div class="contact-item"><span class="ci">📍</span>${esc(resume.location)}</div>` : '',
    resume.availability
      ? `<div class="contact-item"><span class="ci">🗓️</span>${esc(resume.availability)}</div>`
      : '',
    resume.expectedSalary
      ? `<div class="contact-item"><span class="ci">💰</span>${esc(resume.expectedSalary)}/mo</div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const sidebarSection = (title: string, inner: string) =>
    inner ? `<div class="side-section"><h3>${title}</h3>${inner}</div>` : '';

  const skillsBlock = resume.skills.length
    ? `<div class="chips">${resume.skills.map(chip).join('')}</div>`
    : '';
  const languagesBlock = resume.languages.length
    ? `<div class="chips">${resume.languages.map(chip).join('')}</div>`
    : '';
  const certsBlock = resume.certifications.length
    ? `<ul class="side-list">${resume.certifications.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '';

  const workBlock = resume.workHistory.length
    ? resume.workHistory
        .map((w) => {
          const head = [w.role, w.employer].filter(Boolean).map(esc).join(' · ');
          const meta = [w.location, w.duration].filter(Boolean).map(esc).join(' | ');
          return `<div class="job">
            ${head ? `<div class="job-head">${head}</div>` : ''}
            ${meta ? `<div class="job-meta">${meta}</div>` : ''}
            ${w.description ? `<div class="job-desc">${esc(w.description)}</div>` : ''}
          </div>`;
        })
        .join('')
    : '';

  const overviewChips = [
    resume.experienceYears ? `Experience: ${resume.experienceYears}` : '',
  ]
    .filter(Boolean)
    .map(chip)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #22303c; }
  .page { width: 210mm; min-height: 297mm; background: #ffffff; }
  .gov-banner {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 34px; background: #ffffff; border-bottom: 3px solid #0b3d5c;
  }
  .gov-banner img { width: 54px; height: 54px; object-fit: contain; flex: 0 0 auto; }
  .gov-banner .org { line-height: 1.3; }
  .gov-banner .org .sub {
    font-size: 9.5px; letter-spacing: 1.4px; text-transform: uppercase; color: #7b8a99;
  }
  .gov-banner .org .name { font-size: 13.5px; font-weight: 700; color: #0b3d5c; }
  .gov-banner .org .scheme { font-size: 10.5px; font-weight: 600; color: #14618a; }
  .header {
    background: linear-gradient(135deg, #0b3d5c 0%, #14618a 100%);
    color: #fff; padding: 26px 34px; display: flex; align-items: center; gap: 22px;
  }
  .avatar {
    width: 78px; height: 78px; border-radius: 50%; background: rgba(255,255,255,0.16);
    border: 2px solid rgba(255,255,255,0.55); display: flex; align-items: center;
    justify-content: center; font-size: 30px; font-weight: 700; letter-spacing: 1px; flex: 0 0 auto;
  }
  .header h1 { font-size: 30px; font-weight: 700; letter-spacing: 0.4px; line-height: 1.1; }
  .header .role { font-size: 14.5px; font-weight: 500; color: #cfe6f3; margin-top: 4px; }
  .body { display: flex; }
  .sidebar { width: 34%; background: #f3f6f9; padding: 24px 22px; }
  .main { width: 66%; padding: 24px 28px; }
  .side-section { margin-bottom: 20px; }
  .side-section h3, .main h2 {
    font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
    color: #0b5394; margin-bottom: 10px;
  }
  .main h2 { border-bottom: 2px solid #e2e8ee; padding-bottom: 5px; margin-bottom: 12px; }
  .main section { margin-bottom: 20px; }
  .contact-item { display: flex; align-items: center; gap: 8px; font-size: 12.5px; margin-bottom: 7px; color: #33475b; }
  .contact-item .ci { width: 16px; text-align: center; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    background: #e3eef6; color: #0b3d5c; border-radius: 20px; padding: 4px 11px;
    font-size: 11.5px; font-weight: 500;
  }
  .side-list { list-style: none; }
  .side-list li { font-size: 12.5px; margin-bottom: 6px; padding-left: 14px; position: relative; color: #33475b; }
  .side-list li::before { content: '•'; position: absolute; left: 0; color: #14618a; }
  .about { font-size: 13px; line-height: 1.6; color: #33475b; }
  .job { margin-bottom: 14px; }
  .job-head { font-size: 13.5px; font-weight: 700; color: #22303c; }
  .job-meta { font-size: 11.5px; color: #7b8a99; margin: 2px 0 4px; }
  .job-desc { font-size: 12.5px; line-height: 1.55; color: #33475b; }
  .edu { font-size: 13px; line-height: 1.55; color: #33475b; }
  .footer { text-align: center; font-size: 9.5px; color: #9aa7b2; padding: 10px 0 16px; }
</style>
</head>
<body>
  <div class="page">
    <div class="gov-banner">
      <img src="${JEEVIKA_LOGO_DATA_URI}" alt="JEEVIKA" />
      <div class="org">
        <div class="sub">Government of Bihar</div>
        <div class="name">${esc(BRLPS_FULL_NAME)}</div>
        <div class="scheme">Powered by ${esc(BRLPS_SCHEME)} — Rural Livelihoods Mission</div>
      </div>
    </div>
    <div class="header">
      <div class="avatar">${esc(initials(resume.fullName))}</div>
      <div>
        <h1>${esc(resume.fullName)}</h1>
        ${resume.title ? `<div class="role">${esc(resume.title)}</div>` : ''}
      </div>
    </div>
    <div class="body">
      <aside class="sidebar">
        ${sidebarSection('Contact', contactItems)}
        ${sidebarSection('Skills', skillsBlock)}
        ${sidebarSection('Languages', languagesBlock)}
        ${sidebarSection('Certificates', certsBlock)}
      </aside>
      <div class="main">
        ${resume.summary ? `<section><h2>About Me</h2><div class="about">${esc(resume.summary)}</div></section>` : ''}
        ${overviewChips ? `<section><h2>Overview</h2><div class="chips">${overviewChips}</div></section>` : ''}
        ${workBlock ? `<section><h2>Work Experience</h2>${workBlock}</section>` : ''}
        ${resume.education ? `<section><h2>Education</h2><div class="edu">${esc(resume.education)}</div></section>` : ''}
      </div>
    </div>
    <div class="footer">Prepared under the ${esc(BRLPS_SCHEME)} scheme • ${esc(BRLPS_FULL_NAME)}</div>
  </div>
</body>
</html>`;
}

/* ── Puppeteer rendering ────────────────────────────────────────────────── */

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      // fall through and relaunch
    }
  }
  browserPromise = puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return browserPromise;
}

/**
 * Pre-launch the headless browser so the first real resume doesn't pay the
 * (~several second) cold-launch cost. Safe to call multiple times; failures are
 * swallowed since generation will retry the launch on demand.
 */
export async function warmResumeBrowser(): Promise<void> {
  const t0 = Date.now();
  try {
    const browser = await getBrowser();
    logger.info(
      { ms: Date.now() - t0, version: await browser.version() },
      'resume: browser warmed up',
    );
  } catch (err) {
    logger.warn({ err }, 'resume: browser warm-up failed (will retry on demand)');
  }
}

export async function buildResumePdf(resume: StructuredResume): Promise<Buffer> {
  const html = buildResumeHtml(resume);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Safe file name like "Ramesh_Kumar_Resume.pdf". */
export function resumeFileName(resume: StructuredResume): string {
  const base =
    resume.fullName
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40) || 'Resume';
  return `${base}_Resume.pdf`;
}
