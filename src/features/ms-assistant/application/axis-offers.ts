import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText } from '../infrastructure/formatter/whatsapp-format';
import { AXIS_BUTTON_IDS } from './greeting-axis-loan';
import { estimateEmi, formatInr, getDemoOffer, type NegotiationLevel } from './axis-negotiation';

export function buildTenureComparisonResponse(
  loanAmount: number,
  negotiationLevel: NegotiationLevel = 0,
  targetEmi?: number,
): BotResponse {
  const offer = getDemoOffer(negotiationLevel);
  const tenures = [36, 48, 60] as const;
  const blocks = tenures.map((months) => {
    const emi = estimateEmi(loanAmount, offer.ratePct, months);
    const fits = targetEmi ? emi <= targetEmi * 1.05 : false;
    const tag = months === 60 ? 'Lower EMI 💰' : months === 36 ? 'Lower interest 📉' : 'Balanced';
    return [
      `*${months} months* — ${tag}`,
      `EMI: *~${formatInr(emi)}/month*`,
      fits ? `_Within your ~${formatInr(targetEmi!)}/mo comfort_` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const lines = [
    `*Tenure comparison* 📊`,
    '',
    `Loan: *${formatInr(loanAmount)}* @ *${offer.ratePct}% p.a.*`,
    '',
    ...blocks.flatMap((b) => [b, '']),
    `Longer tenure = lower EMI but more total interest.`,
    '',
    `Which matters more to you?`,
  ];

  return {
    mode: 'buttons',
    text: formatWhatsAppText(lines.join('\n')),
    buttons: [
      { id: AXIS_BUTTON_IDS.PRIORITY_EMI, title: 'Lower EMI' },
      { id: AXIS_BUTTON_IDS.PRIORITY_RATE, title: 'Lower rate' },
      { id: AXIS_BUTTON_IDS.APPLY_LOAN, title: 'Apply now' },
    ],
  };
}
