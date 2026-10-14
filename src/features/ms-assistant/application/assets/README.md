# Resume PDF logo

Place the official header logo here as **`resume-pdf-logo.png`** (PNG, square or landscape, transparent background recommended).

Then regenerate the embedded data URI:

```bash
node scripts/encode-resume-pdf-logo.mjs
```

Restart the API if it is already running so the next generated PDF uses the new logo.
