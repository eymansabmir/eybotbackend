import { describe, expect, it } from 'vitest';
import { InteraktNormalizer } from '../../plugins/whatsapp/interakt/interakt.normalizer';
import { verifyInteraktSignature } from '../../plugins/whatsapp/interakt/interakt-signature';
import crypto from 'crypto';

describe('InteraktNormalizer', () => {
  const normalizer = new InteraktNormalizer();
  const orgId = 'org-1';
  const business = 'phone-number-id-1';

  it('normalizes message_received text into NormalizedInboundMessage', () => {
    const result = normalizer.normalize(
      orgId,
      {
        type: 'message_received',
        timestamp: '2022-06-03T05:57:57.496889',
        data: {
          customer: {
            channel_phone_number: '917003705584',
            traits: { name: 'SKGG' },
          },
          message: {
            id: '60076f05-da52-4dd1-b813-36223c1eded7',
            message_content_type: 'Text',
            message: 'Thank you',
            received_at_utc: '2022-06-03T05:57:57.359000',
          },
        },
      },
      business,
    );

    expect(result).toMatchObject({
      orgId,
      messageId: '60076f05-da52-4dd1-b813-36223c1eded7',
      waId: '917003705584',
      waBusinessNumber: business,
      text: 'Thank you',
      type: 'text',
      contactName: 'SKGG',
    });
  });

  it('normalizes InteractiveListReply as interactive with option id', () => {
    const result = normalizer.normalize(
      orgId,
      {
        type: 'message_received',
        data: {
          customer: { channel_phone_number: '919999999999' },
          message: {
            id: 'msg-list',
            message_content_type: 'InteractiveListReply',
            message: '500+',
          },
        },
      },
      business,
    );

    expect(result).toMatchObject({
      type: 'interactive',
      text: '500+',
      interactiveOptionId: '500+',
      waId: '919999999999',
    });
  });

  it('normalizes media message with media_url', () => {
    const result = normalizer.normalize(
      orgId,
      {
        type: 'message_received',
        data: {
          customer: { country_code: '+91', phone_number: '9999999999' },
          message: {
            id: 'msg-img',
            message_content_type: 'Image',
            media_url: 'https://cdn.example.com/a.jpg',
            message: 'caption here',
          },
        },
      },
      business,
    );

    expect(result).toMatchObject({
      type: 'image',
      text: 'caption here',
      mediaUrl: 'https://cdn.example.com/a.jpg',
      mediaId: 'https://cdn.example.com/a.jpg',
      waId: '919999999999',
    });
  });

  it('normalizes message_api_clicked quick reply as button inbound', () => {
    const result = normalizer.normalize(
      orgId,
      {
        type: 'message_api_clicked',
        data: {
          customer: { channel_phone_number: '917003705584' },
          message: {
            id: 'tpl-msg-id',
            button_text: 'Fill Feedback Form',
            click_timestamp: '2024-06-10 08:38:08.635664',
          },
        },
      },
      business,
    );

    expect(result).toMatchObject({
      type: 'button',
      text: 'Fill Feedback Form',
      interactiveOptionId: 'Fill Feedback Form',
      contextMessageId: 'tpl-msg-id',
      waId: '917003705584',
    });
    expect(result?.messageId).toContain('tpl-msg-id:click:');
  });

  it('extracts delivered/read status updates', () => {
    expect(
      normalizer.extractStatus({
        type: 'message_api_delivered',
        data: {
          message: {
            id: 'dfc668a2-c06c-4e9a-a4fd-7b65bc1fdc84',
            delivered_at_utc: '2022-06-03T05:43:33.848000',
          },
        },
      }),
    ).toMatchObject({
      messageId: 'dfc668a2-c06c-4e9a-a4fd-7b65bc1fdc84',
      status: 'delivered',
    });

    expect(
      normalizer.extractStatus({
        type: 'message_campaign_read',
        data: {
          message: {
            id: 'abc',
            seen_at_utc: '2022-06-03T05:43:34.257000',
          },
        },
      }),
    ).toMatchObject({ messageId: 'abc', status: 'read' });
  });
});

describe('verifyInteraktSignature', () => {
  it('accepts a valid sha256= HMAC hex signature', () => {
    const secret = 'examplekey';
    const payload = '{"foo":1,"bar":2}';
    const signature =
      'sha256=' + crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(verifyInteraktSignature(secret, payload, signature)).toBe(true);
  });

  it('rejects invalid signatures', () => {
    expect(verifyInteraktSignature('examplekey', '{"foo":1}', 'sha256=deadbeef')).toBe(false);
    expect(verifyInteraktSignature('examplekey', '{"foo":1}', undefined)).toBe(false);
  });
});
