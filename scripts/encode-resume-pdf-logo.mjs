/**
 * Embeds assets/resume-pdf-logo.png into resume-pdf-branding.ts for Puppeteer PDFs.
 *
 * Usage:
 *   node scripts/encode-resume-pdf-logo.mjs
 *   node scripts/encode-resume-pdf-logo.mjs path/to/custom-logo.png
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const pngPath =
  process.argv[2] ??
  path.join(
    root,
    'src/features/ms-assistant/application/assets/resume-pdf-logo.png',
  );
const brandingPath = path.join(
  root,
  'src/features/ms-assistant/application/resume-pdf-branding.ts',
);

if (!fs.existsSync(pngPath)) {
  console.error(`Logo not found: ${pngPath}`);
  console.error('Save your PNG as src/features/ms-assistant/application/assets/resume-pdf-logo.png');
  process.exit(1);
}

const mime = pngPath.toLowerCase().endsWith('.jpg') || pngPath.toLowerCase().endsWith('.jpeg')
  ? 'image/jpeg'
  : 'image/png';
const dataUri = `data:${mime};base64,${fs.readFileSync(pngPath).toString('base64')}`;

let src = fs.readFileSync(brandingPath, 'utf8');
const marker = 'export const RESUME_PDF_LOGO_DATA_URI =';
const start = src.indexOf(marker);
if (start === -1) {
  console.error('Could not find RESUME_PDF_LOGO_DATA_URI in resume-pdf-branding.ts');
  process.exit(1);
}
const valueStart = src.indexOf("'", start);
const valueEnd = src.indexOf("';", valueStart + 1);
if (valueStart === -1 || valueEnd === -1) {
  console.error('Could not parse existing logo data URI');
  process.exit(1);
}

src = src.slice(0, valueStart + 1) + dataUri + src.slice(valueEnd);
fs.writeFileSync(brandingPath, src, 'utf8');
console.log(`Updated RESUME_PDF_LOGO_DATA_URI from ${path.relative(root, pngPath)}`);
