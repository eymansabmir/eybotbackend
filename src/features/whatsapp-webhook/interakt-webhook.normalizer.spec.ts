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

  it('parses InteractiveButtonReply JSON into button id + title', () => {
    const result = normalizer.normalize(
      orgId,
      {
        type: 'message_received',
        data: {
          customer: { channel_phone_number: '918448728057' },
          message: {
            id: 'msg-btn-reply',
            message_content_type: 'InteractiveButtonReply',
            message:
              '{"type": "button_reply", "button_reply": {"id": "ms_offerings", "title": "Browse Topics"}}',
          },
        },
      },
      business,
    );

    expect(result).toMatchObject({
      type: 'interactive',
      text: 'Browse Topics',
      interactiveOptionId: 'ms_offerings',
      waId: '918448728057',
    });
  });

  it('parses InteractiveListReply JSON into row id + title', () => {
    const result = normalizer.normalize(
      orgId,
      {
        type: 'message_received',
        data: {
          customer: { channel_phone_number: '918448728057' },
          message: {
            id: 'msg-list-reply',
            message_content_type: 'InteractiveListReply',
            message:
              '{"type": "list_reply", "list_reply": {"id": "ms_offer_cloud", "title": "Cloud managed"}}',
          },
        },
      },
      business,
    );

    expect(result).toMatchObject({
      type: 'interactive',
      text: 'Cloud managed',
      interactiveOptionId: 'ms_offer_cloud',
      waId: '918448728057',
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

  it('extracts message_api_flow_response nfm_reply answers', () => {
    const responseJson = {
      flow_token: 'unused',
      'Choose one:': 'Open to our offering',
      'Choose one:_(2)': 'Yes',
      'Choose all that apply:': ['Cost Pressure', 'AI Adoption'],
      'Choose all that apply:_(2)': ['Advisory', 'Operations'],
    };
    const extracted = normalizer.extractFlowResponse({
      type: 'message_api_flow_response',
      timestamp: '2026-07-29T19:27:33.963215',
      data: {
        customer: { channel_phone_number: '918448728057' },
        message: {
          id: '06a6a542-59b2-7de0-8000-e98d5d958bb1',
          message_content_type: 'InteractiveFlowReply',
          received_at_utc: '2026-07-29T19:27:33.285809',
          message: JSON.stringify({
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify(responseJson),
              body: 'Sent',
              name: 'flow',
            },
          }),
          message_context: { id: 'ae5009cb-bd36-41ea-ab77-b6df91cf77dc' },
        },
        source_template_message: {
          template_name: 'partners_connect_flow_test',
          callback_data: '90103e12-6279-43e4-bfb6-324f61e72157',
        },
        flow_id: 1595727721924365,
      },
    });

    expect(extracted).toMatchObject({
      providerMessageId: '06a6a542-59b2-7de0-8000-e98d5d958bb1',
      waId: '918448728057',
      interaktFlowId: '1595727721924365',
      templateName: 'partners_connect_flow_test',
      callbackData: '90103e12-6279-43e4-bfb6-324f61e72157',
      flowToken: 'unused',
    });
    expect(extracted?.responseJson['Choose one:']).toBe('Open to our offering');

    const answers = InteraktNormalizer.expandAnswers(extracted!.responseJson);
    expect(answers.filter((a) => a.questionKey === 'Choose all that apply:')).toHaveLength(2);
    expect(answers.some((a) => a.valueText === 'Cost Pressure')).toBe(true);
    expect(answers.every((a) => a.questionKey !== 'flow_token')).toBe(true);
  });

  it('ignores InteractiveFlowReply on message_received without flow_id/template', () => {
    // Early Interakt event — wait for message_api_flow_response instead of orphaning.
    const responseJson = {
      choose_one_yypRmY: 'option_1785127011941_e83glid1g',
      Choose_all_that_apply_0: ['0_Buy_it_right_away'],
      flow_token: 'unused',
    };
    const extracted = normalizer.extractFlowResponse({
      type: 'message_received',
      data: {
        customer: { channel_phone_number: '918448728057' },
        message: {
          id: 'msg-flow-no-id',
          message_content_type: 'InteractiveFlowReply',
          message: JSON.stringify({
            type: 'nfm_reply',
            nfm_reply: { response_json: JSON.stringify(responseJson), body: 'Sent', name: 'flow' },
          }),
          message_context: { id: 'ctx-1' },
        },
      },
    });

    expect(extracted).toBeNull();
  });

  it('humanizes indexed Meta option values', () => {
    const answers = InteraktNormalizer.expandAnswers({
      Choose_all_that_apply_0: ['0_Buy_it_right_away', '1_Check_reviews_before_buying'],
      flow_token: 'unused',
    });
    expect(answers.some((a) => a.valueText === 'Buy it right away')).toBe(true);
  });

  it('does not normalize flow responses as inbound chat', () => {
    expect(
      normalizer.normalize('org-1', { type: 'message_api_flow_response' }, 'biz'),
    ).toBeNull();
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
