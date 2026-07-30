import type { IPluginRegistry } from '../../plugin.interface';
import { WA_FLOW_SURVEY_SERVICE } from '../../../features/repositories.interface';
import type { WaFlowSurveyService } from '../../../features/wa-flow-survey';
import { InteraktNormalizer } from '../../whatsapp/interakt/interakt.normalizer';
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
}
