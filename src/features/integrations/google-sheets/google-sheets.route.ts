import { Router } from 'express';
import type { GoogleSheetsController } from './google-sheets.controller';

export function createGoogleSheetsRouter(controller: GoogleSheetsController): Router {
  const router = Router();

  router.post('/credentials/:id/test', controller.testCredential);
  router.get('/spreadsheets', controller.listSpreadsheets);
  router.get('/sheets', controller.listSheets);
  router.get('/columns', controller.getColumns);
  router.get('/access-token', controller.getAccessToken);
  
  router.get('/auth/url', controller.getAuthUrl);
  
  // Need to set COOP to unsafe-none and allow unsafe-inline scripts to allow window.opener access and closing the popup
  router.get('/auth/callback', (_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'");
    next();
  }, controller.handleAuthCallback);
  
  router.post('/auth/callback', (_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'");
    next();
  }, controller.handleAuthCallback);

  return router;
}
