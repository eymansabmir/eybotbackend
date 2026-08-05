import type { InboundJob, OutboundJob } from '../../../plugins/worker/jobs';
import { logger } from '../../../utils/logger';
import type { MsAssistantConfig } from '../config';
import type { BotResponse } from '../domain/bot-response';
import { botResponseToOutboundJobs } from '../infrastructure/formatter/to-outbound';
import {
  enforceGroundedReply,
  enforceNearMissReply,
  isUnavailableKbMarker,
  sanitizeUserQuestion,
  UNAVAILABLE_KB_MESSAGE,
  type MsAssistantChat,
} from '../infrastructure/llm/shared';
import { RedisConversationMemory } from '../infrastructure/memory/redis-memory';
import type { MsEmbeddings } from '../infrastructure/rag/embeddings.types';
import type { KnowledgeStore, RetrievedChunk } from '../infrastructure/rag/knowledge-store';
import {
  MS_BUTTON_IDS,
  buildAnswerWithNav,
  buildAskPromptResponse,
  buildFaqMenuResponse,
  buildHandoffMenuResponse,
  buildMenuNudgeResponse,
  buildNearMissAllowList,
  buildOfferingsResponse,
  buildServicesOverviewResponse,
  buildWelcomeResponse,
  cannedAnswerForId,
  isGreetingText,
  isMenuNavText,
  offeringQueryForId,
  resolveHandoffContactId,
  resolveHandoffPillarId,
  resolveMenuSelection,
} from './greeting';

export type MsAssistantProgressPublisher = (jobs: OutboundJob[]) => Promise<void>;

export class MsAssistantService {
  constructor(
    private readonly config: MsAssistantConfig,
    private readonly memory: RedisConversationMemory,
    private readonly embeddings: MsEmbeddings,
    private readonly store: KnowledgeStore,
    private readonly llm: MsAssistantChat,
    /** Optional early publish for "Fetching…" while RAG/LLM runs (TC-40). */
    private readonly publishProgress?: MsAssistantProgressPublisher,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  async handleInbound(job: InboundJob): Promise<OutboundJob[]> {
    const { message, orgId } = job;
    const { waId, waBusinessNumber } = message;
    const interactiveId = message.interactiveOptionId?.trim();
    const text = (message.text ?? '').trim();

    try {
      if (interactiveId) {
        return await this.handleInteractive(job, interactiveId);
      }

      if (message.type === 'button' || message.type === 'interactive' || looksLikeMenuChoice(text)) {
        return await this.handleInteractive(job, text);
      }

      if (isGreetingText(text) || isMenuNavText(text)) {
        await this.memory.setMode(waBusinessNumber, waId, 'menu');
        return this.toJobs(buildWelcomeResponse(), job);
      }

      if (!text) {
        return this.toJobs(buildMenuNudgeResponse(), job);
      }

      // Free text anytime — answers only from approved knowledge (no generic invent).
      return await this.answerFromKnowledge(job, text, { mode: 'qa' });
    } catch (err) {
      logger.error({ err, waId, orgId }, 'MsAssistantService: handleInbound failed');
      return this.toJobs(
        {
          mode: 'buttons',
          text:
            '⚠️ Something went wrong preparing that reply. Please try again from the menu.',
          buttons: [
            { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
            { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to expert' },
            { id: MS_BUTTON_IDS.ASK, title: 'Diagnostic' },
          ],
        },
        job,
      );
    }
  }

  private async handleInteractive(job: InboundJob, interactiveId: string): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const resolved = resolveMenuSelection(interactiveId);
    const key = normalizeInteractiveKey(resolved);

    if (key === MS_BUTTON_IDS.MAIN_MENU || key === 'main menu') {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildWelcomeResponse(), job);
    }

    if (key === MS_BUTTON_IDS.SERVICES || key === 'our services') {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildServicesOverviewResponse(), job);
    }

    if (
      key === MS_BUTTON_IDS.OFFERINGS ||
      key === MS_BUTTON_IDS.MORE_TOPICS ||
      key === 'browse topics' ||
      key === 'explore offerings' ||
      key === 'more topics'
    ) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildOfferingsResponse(), job);
    }

    if (
      key === MS_BUTTON_IDS.ASK ||
      key === MS_BUTTON_IDS.FAQ ||
      key === 'faqs & ask' ||
      key === 'guide & ask' ||
      key === 'run a client diagnostic' ||
      key === 'client diagnostic' ||
      key === 'diagnostic' ||
      key === 'browse faqs' ||
      key === 'common faqs' ||
      key === 'guide list'
    ) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildFaqMenuResponse(), job);
    }

    if (
      key === MS_BUTTON_IDS.TYPE_QUESTION ||
      key === 'type my question' ||
      key === 'ask anything' ||
      key === 'ask a question'
    ) {
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildAskPromptResponse(), job);
    }

    if (
      key === MS_BUTTON_IDS.HANDOFF ||
      key === 'talk to a human' ||
      key === 'talk to human' ||
      key === 'talk to an expert' ||
      key === 'talk to expert' ||
      key === 'handoff' ||
      key === 'contact' ||
      key === 'contacts' ||
      key === 'human handoff' ||
      key === 'back to experts'
    ) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildHandoffMenuResponse(), job);
    }

    // Legacy team-browse ids → new domain menu
    if (
      key === 'ms_handoff_leadership' ||
      key === 'ms_handoff_core' ||
      key === 'ms_handoff_core_more' ||
      key === 'ms_handoff_gtm' ||
      key === 'ms_handoff_more' ||
      key === 'leadership team' ||
      key === 'core team' ||
      key === 'more towers'
    ) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildHandoffMenuResponse(), job);
    }

    const topicId = resolved.trim();
    const pillarId = resolveHandoffPillarId(topicId) || resolveHandoffPillarId(key);
    const personId = resolveHandoffContactId(topicId) || resolveHandoffContactId(key);
    const canned =
      cannedAnswerForId(topicId) ||
      cannedAnswerForId(key) ||
      (pillarId ? cannedAnswerForId(pillarId) : undefined) ||
      (personId ? cannedAnswerForId(personId) : undefined) ||
      cannedFromFuzzyTitle(key);

    if (canned) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildAnswerWithNav(canned), job);
    }

    const offeringQuery =
      offeringQueryForId(topicId) ||
      offeringQueryForId(key) ||
      offeringQueryForId(key.replace(/\s+/g, '_'));

    if (offeringQuery) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.answerFromKnowledge(job, offeringQuery, { mode: 'menu' });
    }

    await this.memory.setMode(waBusinessNumber, waId, 'menu');
    return this.toJobs(buildWelcomeResponse(), job);
  }

  /**
   * Free-text / theme path: retrieve approved chunks, then LLM may ONLY paraphrase those chunks.
   * On miss → LLM near-miss from closed allow-list + retrieved chunks as supporting context.
   */
  private async answerFromKnowledge(
    job: InboundJob,
    question: string,
    opts: { mode: 'qa' | 'menu' } = { mode: 'qa' },
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const safeQuestion = sanitizeUserQuestion(question);

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'user', content: safeQuestion, at: Date.now() },
      { mode: opts.mode },
    );

    const memory = await this.memory.get(waBusinessNumber, waId);

    await this.emitProgress(job, 'Fetching information from approved knowledge…');

    const vector = await this.embeddings.embedOne(safeQuestion);
    const chunks = await this.store.search(vector, this.config.MS_ASSISTANT_TOP_K);
    const filtered = chunks.filter(
      (c) => c.text && c.score >= this.config.MS_ASSISTANT_MIN_SCORE,
    );
    const retrievalContext = chunks.filter((c) => Boolean(c.text));

    let replyText: string;

    if (filtered.length === 0) {
      replyText = await this.buildNearMissReply(safeQuestion, retrievalContext);
    } else {
      const response = await this.llm.answer({
        question: safeQuestion,
        chunks: filtered,
        memory,
      });

      replyText =
        response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
          ? response.text
          : (response.text ?? '');

      replyText = enforceGroundedReply(replyText, filtered);
      if (isUnavailableKbMarker(replyText)) {
        replyText = await this.buildNearMissReply(safeQuestion, filtered);
      }
    }

    const updated = await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: replyText, at: Date.now() },
      { mode: opts.mode },
    );

    void this.llm
      .summarizeIfNeeded(updated)
      .then(async (summary) => {
        if (!summary) return;
        // Summaries must not become a second knowledge source — keep short and factual only
        if (/quantum computing|invented|discount|approval workflow/i.test(summary)) return;
        const current = await this.memory.get(waBusinessNumber, waId);
        await this.memory.save(waBusinessNumber, waId, { ...current, summary });
      })
      .catch((err) => logger.warn({ err }, 'MsAssistantService: summary refresh failed'));

    return this.toJobs(buildAnswerWithNav(replyText), job);
  }

  private async buildNearMissReply(
    question: string,
    chunks: RetrievedChunk[],
  ): Promise<string> {
    const allowList = buildNearMissAllowList();
    try {
      const response = await this.llm.suggestNearMiss({ question, chunks, allowList });
      const text =
        response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
          ? response.text
          : (response.text ?? '');
      return enforceNearMissReply(text, allowList) ?? UNAVAILABLE_KB_MESSAGE;
    } catch (err) {
      logger.warn({ err }, 'MsAssistantService: near-miss LLM failed');
      return UNAVAILABLE_KB_MESSAGE;
    }
  }

  private toJobs(response: BotResponse | BotResponse[], job: InboundJob): OutboundJob[] {
    const list = Array.isArray(response) ? response : [response];
    const ctx = {
      waId: job.message.waId,
      waBusinessNumber: job.message.waBusinessNumber,
      orgId: job.orgId,
      sessionId: `ms-assistant:${job.message.waId}`,
    };
    return list.flatMap((item) => botResponseToOutboundJobs(item, ctx));
  }

  private async emitProgress(job: InboundJob, message: string): Promise<void> {
    if (!this.publishProgress) return;
    try {
      const jobs = this.toJobs({ mode: 'text', text: message }, job);
      await this.publishProgress(jobs);
    } catch (err) {
      logger.warn({ err }, 'MsAssistantService: progress publish failed');
    }
  }
}

function normalizeInteractiveKey(value: string): string {
  return value.trim().toLowerCase();
}

function cannedFromFuzzyTitle(key: string): string | undefined {
  const pillarId = resolveHandoffPillarId(key);
  if (pillarId) return cannedAnswerForId(pillarId);
  const handoffId = resolveHandoffContactId(key);
  if (handoffId) return cannedAnswerForId(handoffId);

  if (key.includes('qualification') || key.includes('3 qualification') || key === 'ms lens') {
    return cannedAnswerForId('ms_topic_qualify');
  }
  if (key.includes('conversation') || key.includes('how to start') || key.includes('how to converse')) {
    return cannedAnswerForId('ms_topic_technique');
  }
  if (key.includes('when not')) {
    return cannedAnswerForId('ms_topic_when_not');
  }
  if (key.includes('capacity') || key.includes('cost pressure')) {
    return cannedAnswerForId('ms_topic_capacity');
  }
  if (key.includes('quality') || key.includes('vendor')) {
    return cannedAnswerForId('ms_topic_quality');
  }
  if (key.includes('tech, cloud') || key.includes('cloud cost') || key === 'tech, cloud & cyber') {
    return cannedAnswerForId(key.includes('cloud cost') ? 'ms_faq_cloud_cost' : 'ms_topic_tech');
  }
  if (key.includes('finance, hr') || key.includes('hr & scale') || key.includes('gcc')) {
    return cannedAnswerForId('ms_topic_scale');
  }
  if (key.includes('skills')) return cannedAnswerForId('ms_faq_skills');
  return undefined;
}

function looksLikeMenuChoice(text: string): boolean {
  const key = normalizeInteractiveKey(text);
  if (!key) return false;
  if (key.startsWith('ms_')) return true;
  return (
    key === 'ms lens' ||
    key === 'qualification lens' ||
    key === 'our services' ||
    key === 'triggers' ||
    key === 'browse topics' ||
    key === 'more triggers' ||
    key === 'more topics' ||
    key === 'guide & ask' ||
    key === 'faqs & ask' ||
    key === 'run a client diagnostic' ||
    key === 'client diagnostic' ||
    key === 'diagnostic' ||
    key === 'ask a question' ||
    key === 'ask anything' ||
    key === 'talk to a human' ||
    key === 'talk to human' ||
    key === 'talk to an expert' ||
    key === 'talk to expert' ||
    key === 'handoff' ||
    key === 'contact' ||
    key === 'contacts' ||
    key === 'human handoff' ||
    key === 'main menu' ||
    key === 'guide list' ||
    key === 'type my question' ||
    key === 'capacity & cost' ||
    key === 'quality & vendors' ||
    key === 'tech, cloud & cyber' ||
    key === 'finance, hr & scale' ||
    key === 'conversation steps' ||
    key === 'how to converse' ||
    key === 'when not to force ms' ||
    key === 'cost pressure trigger' ||
    key === 'skills shortage' ||
    key === 'cloud cost rising'
  );
}
