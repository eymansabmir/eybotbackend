import { NodeType } from '../../../../schemas/node-types.enum';
import type { OutboundJob } from '../../../../plugins/worker/jobs';
import type { BotResponse } from '../../domain/bot-response';

export function botResponseToOutboundJobs(
  response: BotResponse,
  ctx: { waId: string; waBusinessNumber: string; orgId: string; sessionId?: string },
): OutboundJob[] {
  const base = {
    waId: ctx.waId,
    waBusinessNumber: ctx.waBusinessNumber,
    orgId: ctx.orgId,
    sessionId: ctx.sessionId,
  };

  switch (response.mode) {
    case 'text':
      return [
        {
          ...base,
          messageType: NodeType.SEND_TEXT,
          payload: { message: response.text },
        },
      ];

    case 'buttons':
      return [
        {
          ...base,
          messageType: NodeType.SEND_BUTTONS,
          payload: {
            body: response.text,
            buttons: response.buttons.map((b) => ({ id: b.id, title: b.title })),
          },
        },
      ];

    case 'list':
      return [
        {
          ...base,
          messageType: NodeType.SEND_LIST,
          payload: {
            body: response.text,
            buttonTitle: response.buttonTitle,
            sections: response.sections,
          },
        },
      ];

    case 'image': {
      const jobs: OutboundJob[] = [
        {
          ...base,
          messageType: NodeType.SEND_IMAGE,
          payload: {
            url: response.media.url,
            caption: response.media.caption ?? response.text,
          },
        },
      ];
      if (response.text && !response.media.caption) {
        jobs.push({
          ...base,
          messageType: NodeType.SEND_TEXT,
          payload: { message: response.text },
        });
      }
      return jobs;
    }

    case 'document':
      return [
        {
          ...base,
          messageType: NodeType.SEND_DOCUMENT,
          payload: {
            url: response.media.url,
            caption: response.media.caption ?? response.text,
            filename: response.media.filename,
          },
        },
      ];

    default:
      return [
        {
          ...base,
          messageType: NodeType.SEND_TEXT,
          payload: { message: 'Sorry — I could not format that response.' },
        },
      ];
  }
}
