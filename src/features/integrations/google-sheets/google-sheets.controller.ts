import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IGoogleSheetsIntegrationService } from '../../../plugins/google-sheets/google-sheets.interface';

const pickFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const PathSchema = z.object({
  id: z.string().min(1),
});

const OrgIdBodySchema = z.object({
  orgId: z.string().min(1),
});

const ListSpreadsheetsQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
  credentialId: z.preprocess(pickFirst, z.string().min(1)),
});

const ListSheetsQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
  credentialId: z.preprocess(pickFirst, z.string().min(1)),
  spreadsheetId: z.preprocess(pickFirst, z.string().min(1)),
});

const GetColumnsQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
  credentialId: z.preprocess(pickFirst, z.string().min(1)),
  spreadsheetId: z.preprocess(pickFirst, z.string().min(1)),
  sheetId: z.preprocess(pickFirst, z.string().min(1)),
});

export class GoogleSheetsController {
  constructor(private readonly service: IGoogleSheetsIntegrationService) {}

  testCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const { orgId } = OrgIdBodySchema.parse(req.body);
      const result = await this.service.testCredential(orgId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  listSpreadsheets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, credentialId } = ListSpreadsheetsQuerySchema.parse(req.query);
      const spreadsheets = await this.service.listSpreadsheets(orgId, credentialId);
      res.json(spreadsheets);
    } catch (err) {
      next(err);
    }
  };

  listSheets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, credentialId, spreadsheetId } = ListSheetsQuerySchema.parse(req.query);
      const sheets = await this.service.listSheets(orgId, credentialId, spreadsheetId);
      res.json(sheets);
    } catch (err) {
      next(err);
    }
  };

  getColumns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, credentialId, spreadsheetId, sheetId } = GetColumnsQuerySchema.parse(req.query);
      const columns = await this.service.getColumns(orgId, credentialId, spreadsheetId, sheetId);
      res.json(columns);
    } catch (err) {
      next(err);
    }
  };

  getAuthUrl = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const orgId = z.preprocess(pickFirst, z.string().min(1)).parse(req.query.orgId);
      const url = this.service.getAuthUrl(orgId);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  };

  handleAuthCallback = async (req: Request, res: Response): Promise<void> => {
    try {
      const code = z.string().parse(req.query.code || req.body.code);
      const state = z.string().parse(req.query.state || req.body.state);
      // state is the orgId
      await this.service.handleAuthCallback(state, code);
      // Return HTML to close popup
      res.send(`
        <html>
          <head>
            <style>
              body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
              .card { background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
              .icon { color: #10b981; font-size: 3rem; margin-bottom: 1rem; }
              h2 { margin: 0 0 0.5rem 0; font-size: 1.25rem; }
              p { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
              button { background: #3b82f6; color: white; border: none; padding: 0.625rem 1.25rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">✓</div>
              <h2>Authentication Successful</h2>
              <p>Your Google account has been connected. You can close this window now.</p>
              <button onclick="window.close()">Close Window</button>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage("google-sheets-oauth-success", "*");
                setTimeout(() => window.close(), 100);
              }
            </script>
          </body>
        </html>
      `);
    } catch (err) {
      res.status(400).send(`
        <html>
          <body>
            <h2>Authentication Failed</h2>
            <script>
              window.opener.postMessage("google-sheets-oauth-failure", "*");
            </script>
          </body>
        </html>
      `);
    }
  };

  getAccessToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, credentialId } = ListSpreadsheetsQuerySchema.parse(req.query);
      const accessToken = await this.service.getAccessToken(orgId, credentialId);
      res.json({ accessToken });
    } catch (err) {
      next(err);
    }
  };
}
