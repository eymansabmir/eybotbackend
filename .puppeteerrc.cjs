const { join } = require('path');

/**
 * Pin Puppeteer's browser cache to a project-local directory so the server
 * finds Chrome regardless of which shell/user/env launches it (the default
 * per-user cache led to version mismatches across environments).
 *
 * After changing this, run: `npx puppeteer browsers install chrome`
 */
module.exports = {
  cacheDirectory: join(__dirname, '.puppeteer-cache'),
};
