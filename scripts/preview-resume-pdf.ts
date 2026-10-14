/**
 * Local resume PDF preview (no server). Output: ./resume-preview.pdf
 * Run: npx tsx scripts/preview-resume-pdf.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildResumePdf, resumeFileName, type StructuredResume } from '../src/features/ms-assistant/application/resume-pdf';

const sample: StructuredResume = {
  fullName: 'Ramesh Kumar Patil',
  title: 'Experienced Delivery Driver',
  phone: '+91 98765 43210',
  location: 'Pune, Maharashtra',
  summary:
    'Reliable delivery driver with over six years of experience in last-mile logistics across Pune and nearby districts. Known for safe driving, on-time deliveries, and clear communication with customers and dispatch teams. Comfortable with two-wheeler and light commercial vehicle routes.',
  experienceYears: '6 years',
  skills: ['Two-wheeler delivery', 'Route planning', 'Customer handling', 'Basic vehicle maintenance', 'GPS navigation'],
  workHistory: [
    {
      role: 'Delivery Executive',
      employer: 'QuickShip Logistics',
      location: 'Pune',
      duration: '2020 – Present',
      description: 'Daily parcel delivery, cash-on-delivery handling, and end-of-day reporting.',
    },
    {
      role: 'Driver Helper',
      employer: 'Maharashtra Transport Co-op',
      location: 'Pune',
      duration: '2018 – 2020',
      description: 'Assisted loading/unloading and local city deliveries.',
    },
  ],
  education: '10th Pass — Maharashtra State Board',
  languages: ['Marathi', 'Hindi', 'English (basic)'],
  certifications: ['Valid driving licence (LMV)', 'Aadhaar verified'],
  expectedSalary: '₹18,000 – ₹22,000 per month',
  availability: 'Immediate',
};

async function main(): Promise<void> {
  const pdf = await buildResumePdf(sample);
  const out = resolve(process.cwd(), resumeFileName(sample).replace(/\.pdf$/i, '-preview.pdf'));
  writeFileSync(out, pdf);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${out} (${pdf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
