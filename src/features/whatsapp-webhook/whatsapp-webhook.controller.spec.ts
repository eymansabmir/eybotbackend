import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp/whatsapp.interface';
import type { IWorkerPlugin } from '../../plugins/worker/worker.interface';
import type { ICredentialRepository } from '../credentials/credentials.repository.interface';

const INBOUND_EXCHANGE = 'wa.inbound';

Reflect.set(globalThis, 'logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

function createResponseMock(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('WhatsAppWebhookController.handle', () => {
  it('uses route orgId when present and enqueues inbound message', async () => {
    const normalized = {
      messageId: 'wamid.route',
      waId: '15550001111',
      waBusinessNumber: '1234567890',
      text: 'hello',
      type: 'text',
      timestamp: Date.now(),
      orgId: 'org-from-route',
    };

    const whatsappPlugin = {
      normalizer: { normalize: vi.fn().mockReturnValue(normalized) },
      deduplicator: { isDuplicate: vi.fn().mockResolvedValue(false) },
    } as unknown as IWhatsAppPlugin;

    const workerPlugin = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IWorkerPlugin;

    const credentialRepo = {
      findActiveWhatsAppByBusinessNumber: vi.fn(),
      findActiveWhatsAppByBusinessNumberForOrg: vi.fn().mockResolvedValue({ id: 'cred-route-1', orgId: 'org-from-route' }),
    } as unknown as ICredentialRepository;

    const controller = new WhatsAppWebhookController(whatsappPlugin, workerPlugin, credentialRepo);

    const req = {
      params: { orgId: 'org-from-route' },
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '1234567890' },
                  contacts: [{ wa_id: '15550001111' }],
                  messages: [{ id: 'wamid.route', type: 'text', text: { body: 'hello' } }],
                },
              },
            ],
          },
        ],
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.handle(req, res, vi.fn());

    expect(credentialRepo.findActiveWhatsAppByBusinessNumber).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(workerPlugin.publish).toHaveBeenCalledWith(INBOUND_EXCHANGE, {
      orgId: 'org-from-route',
      credentialId: 'cred-route-1',
      message: normalized,
    });
  });

  it('resolves org by business number when route orgId is missing', async () => {
    const normalized = {
      messageId: 'wamid.lookup',
      waId: '15550002222',
      waBusinessNumber: '9876543210',
      text: 'start',
      type: 'text',
      timestamp: Date.now(),
      orgId: 'org-from-credential',
    };

    const whatsappPlugin = {
      normalizer: { normalize: vi.fn().mockReturnValue(normalized) },
      deduplicator: { isDuplicate: vi.fn().mockResolvedValue(false) },
    } as unknown as IWhatsAppPlugin;

    const workerPlugin = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IWorkerPlugin;

    const credentialRepo = {
      findActiveWhatsAppByBusinessNumber: vi.fn().mockResolvedValue({ orgId: 'org-from-credential' }),
    } as unknown as ICredentialRepository;

    const controller = new WhatsAppWebhookController(whatsappPlugin, workerPlugin, credentialRepo);

    const req = {
      params: {},
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '9876543210' },
                  contacts: [{ wa_id: '15550002222' }],
                  messages: [{ id: 'wamid.lookup', type: 'text', text: { body: 'start' } }],
                },
              },
            ],
          },
        ],
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.handle(req, res, vi.fn());

    expect(credentialRepo.findActiveWhatsAppByBusinessNumber).toHaveBeenCalledWith('9876543210');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(workerPlugin.publish).toHaveBeenCalledWith(INBOUND_EXCHANGE, {
      orgId: 'org-from-credential',
      message: normalized,
    });
  });

  it('acknowledges and skips publish when no org can be resolved', async () => {
    const whatsappPlugin = {
      normalizer: { normalize: vi.fn() },
      deduplicator: { isDuplicate: vi.fn() },
    } as unknown as IWhatsAppPlugin;

    const workerPlugin = {
      publish: vi.fn(),
    } as unknown as IWorkerPlugin;

    const credentialRepo = {
      findActiveWhatsAppByBusinessNumber: vi.fn().mockResolvedValue(null),
    } as unknown as ICredentialRepository;

    const controller = new WhatsAppWebhookController(whatsappPlugin, workerPlugin, credentialRepo);

    const req = {
      params: {},
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '0000000000' },
                },
              },
            ],
          },
        ],
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.handle(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'ignored' });
    expect(workerPlugin.publish).not.toHaveBeenCalled();
  });

  it('does not treat reserved route value webhook as an orgId', async () => {
    const normalized = {
      messageId: 'wamid.reserved',
      waId: '15550003333',
      waBusinessNumber: '4444444444',
      text: 'hi',
      type: 'text',
      timestamp: Date.now(),
      orgId: 'org-from-credential',
    };

    const whatsappPlugin = {
      normalizer: { normalize: vi.fn().mockReturnValue(normalized) },
      deduplicator: { isDuplicate: vi.fn().mockResolvedValue(false) },
    } as unknown as IWhatsAppPlugin;

    const workerPlugin = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as IWorkerPlugin;

    const credentialRepo = {
      findActiveWhatsAppByBusinessNumberForOrg: vi.fn().mockResolvedValue(null),
      findActiveWhatsAppByBusinessNumber: vi.fn().mockResolvedValue({ id: 'cred-1', orgId: 'org-from-credential' }),
    } as unknown as ICredentialRepository;

    const controller = new WhatsAppWebhookController(whatsappPlugin, workerPlugin, credentialRepo);

    const req = {
      params: { orgId: 'webhook' },
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: '4444444444' },
                  contacts: [{ wa_id: '15550003333' }],
                  messages: [{ id: 'wamid.reserved', type: 'text', text: { body: 'hi' } }],
                },
              },
            ],
          },
        ],
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.handle(req, res, vi.fn());

    expect(credentialRepo.findActiveWhatsAppByBusinessNumber).toHaveBeenCalledWith('4444444444');
    expect(workerPlugin.publish).toHaveBeenCalledWith(INBOUND_EXCHANGE, {
      orgId: 'org-from-credential',
      credentialId: 'cred-1',
      message: normalized,
    });
  });
});
