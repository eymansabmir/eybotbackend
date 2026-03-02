import { Worker, Job } from 'bullmq';
import { OUTBOUND_QUEUE_NAME } from '../../lib/queue';
import { getBullConnection } from '../../lib/redis';
import type { OutboundJobData } from '../../lib/queue';
import { WhatsAppAPIService, WhatsAppConfig } from '../whatsapp-api.service';
import { NodeType } from '../../schemas/node-types.enum';

export function createOutboundWorker(config: WhatsAppConfig): Worker<OutboundJobData> {
  const connection = getBullConnection();
  const apiService = new WhatsAppAPIService(config);

  const worker = new Worker<OutboundJobData>(
    OUTBOUND_QUEUE_NAME,
    async (job: Job<OutboundJobData>) => {
      const { waId, messageType, payload } = job.data;

      console.log(`[OutboundWorker] Sending ${messageType} to ${waId}`);

      try {
        switch (messageType) {
          case NodeType.SEND_TEXT:
          case NodeType.ASK_QUESTION:
            await apiService.sendText(waId, payload.message);
            break;

          case NodeType.SEND_IMAGE:
            await apiService.sendImage(waId, payload.url, payload.caption);
            break;

          case NodeType.SEND_VIDEO:
            await apiService.sendVideo(waId, payload.url, payload.caption);
            break;

          case NodeType.SEND_AUDIO:
            await apiService.sendAudio(waId, payload.url);
            break;

          case NodeType.SEND_DOCUMENT:
            await apiService.sendDocument(waId, payload.url, payload.caption);
            break;

          case NodeType.SEND_LOCATION:
            await apiService.sendLocation(
              waId,
              payload.latitude,
              payload.longitude,
              payload.name,
              payload.address
            );
            break;

          case NodeType.SEND_BUTTONS:
            await apiService.sendButtons(waId, payload.body, payload.buttons, payload.footer);
            break;

          case NodeType.SEND_LIST:
            await apiService.sendList(
              waId,
              payload.body,
              payload.buttonTitle,
              payload.sections,
              payload.footer
            );
            break;

          case NodeType.SEND_TEMPLATE:
            await apiService.sendTemplate(
              waId,
              payload.templateName,
              payload.languageCode,
              payload.components
            );
            break;

          default:
            console.warn(`[OutboundWorker] Unknown message type: ${messageType}`);
        }

        console.log(`[OutboundWorker] Sent ${messageType} to ${waId}`);
      } catch (error) {
        console.error(`[OutboundWorker] Failed to send ${messageType} to ${waId}:`, error);
        throw error; // Trigger retry
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[OutboundWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[OutboundWorker] Job ${job?.id} failed:`, error);
  });

  return worker;
}
