import type { IPluginRegistry } from '../../plugin.interface';
import { WA_FLOW_SURVEY_SERVICE } from '../../../features/repositories.interface';
import type { WaFlowSurveyService } from '../../../features/wa-flow-survey';
import {
  formatFlowScoreMessage,
  scoreFlowAnswers,
} from '../../../features/wa-flow-survey/application/flow-score';
import { InteraktNormalizer } from '../../whatsapp/interakt/interakt.normalizer';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from '../../whatsapp';
import { NodeType } from '../../../schemas/node-types.enum';
import type { FlowResponseJob } from '../jobs';

export async function handleFlowResponseJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as FlowResponseJob;
  logger.info(
    {
      providerMessageId: job.providerMessageId,
      orgId: job.orgId,
      interaktFlowId: job.interaktFlowId,
      waId: job.waId,
    },
    'FlowResponseConsumer: processing flow submission',
  );

  const service = registry.get<WaFlowSurveyService>(WA_FLOW_SURVEY_SERVICE);
  const answers = InteraktNormalizer.expandAnswers(job.responseJson ?? {});

  const result = await service.storeFromJob({
    orgId: job.orgId,
    credentialId: job.credentialId,
    waId: job.waId,
    waBusinessNumber: job.waBusinessNumber,
    providerMessageId: job.providerMessageId,
    contextMessageId: job.contextMessageId,
    interaktFlowId: job.interaktFlowId,
    templateName: job.templateName,
    callbackData: job.callbackData,
    flowToken: job.flowToken,
    responseJson: job.responseJson,
    rawPayload: job.rawPayload,
    submittedAt: new Date(job.submittedAt),
    answers,
  });

  logger.info(
    {
      providerMessageId: job.providerMessageId,
      surveyId: result.surveyId,
      submissionId: result.submissionId,
      created: result.created,
      answerCount: answers.length,
    },
    'FlowResponseConsumer: flow submission stored',
  );

  // New / upgraded submissions only — avoid re-sending on webhook retries.
  if (!result.created) {
    return;
  }

  const score = scoreFlowAnswers(answers);
  const message = formatFlowScoreMessage(score);

  try {
    const { sender } = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
    await sender.sendMessages(
      job.waId,
      [{ type: NodeType.SEND_TEXT, payload: { message } }],
      job.callbackData,
    );
    logger.info(
      {
        waId: job.waId,
        providerMessageId: job.providerMessageId,
        optionCount: score.optionCount,
        scoredOptionCount: score.scoredOptionCount,
        unmatched: score.unmatched,
        score: score.score,
        percentage: score.percentage,
      },
      'FlowResponseConsumer: score reply sent',
    );
  } catch (err) {
    // Submission is already persisted — don't fail the queue job on send errors.
    logger.error(
      { waId: job.waId, providerMessageId: job.providerMessageId, err },
      'FlowResponseConsumer: failed to send score reply',
    );
  }
}
