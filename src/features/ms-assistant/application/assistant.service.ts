import type { InboundJob, OutboundJob } from '../../../plugins/worker/jobs';
import { logger } from '../../../utils/logger';
import type { MsAssistantConfig } from '../config';
import type { BotResponse } from '../domain/bot-response';
import { botResponseToOutboundJobs } from '../infrastructure/formatter/to-outbound';
import type { MsAssistantChat } from '../infrastructure/llm/shared';
import { RedisConversationMemory } from '../infrastructure/memory/redis-memory';
import type { MsEmbeddings } from '../infrastructure/rag/embeddings.types';
import { QdrantKnowledgeStore } from '../infrastructure/rag/qdrant.store';
import {
  MS_BUTTON_IDS,
  buildAnswerWithNav,
  buildAskPromptResponse,
  buildFaqMenuResponse,
  buildHandoffMenuResponse,
  buildMenuNudgeResponse,
  buildOfferingsResponse,
  buildServicesOverviewResponse,
  buildWelcomeResponse,
  cannedAnswerForId,
  isGreetingText,
  isMenuNavText,
  offeringQueryForId,
  resolveMenuSelection,
} from './greeting';

export class MsAssistantService {
  constructor(
    private readonly config: MsAssistantConfig,
    private readonly memory: RedisConversationMemory,
    private readonly embeddings: MsEmbeddings,
    private readonly store: QdrantKnowledgeStore,
    private readonly llm: MsAssistantChat,
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

      // Any free text → RAG + LLM (chunks when available; generic MS guidance otherwise).
      return await this.answerWithLlm(job, text, { mode: 'qa' });
    } catch (err) {
      logger.error({ err, waId, orgId }, 'MsAssistantService: handleInbound failed');
      return this.toJobs(
        {
          mode: 'buttons',
          text:
            '⚠️ Something went wrong preparing that reply. Please try again from the menu.',
          buttons: [
            { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
            { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to human' },
            { id: MS_BUTTON_IDS.ASK, title: 'Guide & Ask' },
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
      key === 'ask a question' ||
      key === 'browse faqs' ||
      key === 'common faqs'
    ) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildFaqMenuResponse(), job);
    }

    if (key === MS_BUTTON_IDS.TYPE_QUESTION || key === 'type my question') {
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildAskPromptResponse(), job);
    }

    if (
      key === MS_BUTTON_IDS.HANDOFF ||
      key === 'talk to a human' ||
      key === 'talk to human' ||
      key === 'handoff' ||
      key === 'contact' ||
      key === 'contacts' ||
      key === 'human handoff'
    ) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildHandoffMenuResponse(), job);
    }

    // Topic / FAQ / handoff rows: prefer canned answers (fast). Fall back to RAG without LLM.
    const topicId = resolved.trim();
    const canned =
      cannedAnswerForId(topicId) ||
      cannedAnswerForId(key) ||
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
      return this.answerFromRetrieval(job, offeringQuery);
    }

    await this.memory.setMode(waBusinessNumber, waId, 'menu');
    return this.toJobs(buildWelcomeResponse(), job);
  }

  /**
   * Menu theme path: prefer fast retrieval formatting; if no hits, fall back to LLM
   * with generic guidance (never a "KB empty" error).
   */
  private async answerFromRetrieval(job: InboundJob, question: string): Promise<OutboundJob[]> {
    const vector = await this.embeddings.embedOne(question);
    const chunks = await this.store.search(vector, Math.min(3, this.config.MS_ASSISTANT_TOP_K));
    const filtered = chunks.filter(
      (c) => c.text && c.score >= this.config.MS_ASSISTANT_MIN_SCORE,
    );

    if (filtered.length === 0) {
      return this.answerWithLlm(job, question, { mode: 'menu' });
    }

    const bullets = filtered
      .slice(0, 3)
      .map((c) => `* ${c.text.replace(/\s+/g, ' ').trim().slice(0, 220)}`)
      .join('\n');

    return this.toJobs(
      buildAnswerWithNav(`📌 *Quick overview*\n\n${bullets}`),
      job,
    );
  }

  /** Free-text (and retrieval fallback) — RAG chunks when available, else LLM general guidance. */
  private async answerWithLlm(
    job: InboundJob,
    question: string,
    opts: { mode: 'qa' | 'menu' } = { mode: 'qa' },
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'user', content: question, at: Date.now() },
      { mode: opts.mode },
    );

    const memory = await this.memory.get(waBusinessNumber, waId);
    const vector = await this.embeddings.embedOne(question);
    const chunks = await this.store.search(vector, this.config.MS_ASSISTANT_TOP_K);
    const filtered = chunks.filter(
      (c) => c.text && c.score >= this.config.MS_ASSISTANT_MIN_SCORE,
    );

    const response = await this.llm.answer({
      question,
      chunks: filtered,
      memory,
    });

    const replyText =
      response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
        ? response.text
        : (response.text ?? '💡 Here is a concise view based on MS qualification practice.');

    const updated = await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: replyText, at: Date.now() },
      { mode: opts.mode },
    );

    // Fire-and-forget summary — awaiting it roughly doubles Copilot latency.
    void this.llm
      .summarizeIfNeeded(updated)
      .then(async (summary) => {
        if (!summary) return;
        const current = await this.memory.get(waBusinessNumber, waId);
        await this.memory.save(waBusinessNumber, waId, { ...current, summary });
      })
      .catch((err) => logger.warn({ err }, 'MsAssistantService: summary refresh failed'));

    return this.toJobs(buildAnswerWithNav(replyText), job);
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
}

function normalizeInteractiveKey(value: string): string {
  return value.trim().toLowerCase();
}

function cannedFromFuzzyTitle(key: string): string | undefined {
  // Handoff category titles before topic fuzzy matches (e.g. "cyber ms" ≠ tech triggers).
  if (key.includes('prc') || key.includes('pursuit')) {
    return cannedAnswerForId('ms_handoff_prc');
  }
  if (key === 'technology ms' || key.startsWith('technology ms')) {
    return cannedAnswerForId('ms_handoff_technology');
  }
  if (key === 'cyber ms' || key.startsWith('cyber ms')) {
    return cannedAnswerForId('ms_handoff_cyber');
  }
  if (key.includes('hrms') || key === 'hrms / learning') {
    return cannedAnswerForId('ms_handoff_hrms');
  }
  if (key === 'data and ai ms' || key.startsWith('data and ai')) {
    return cannedAnswerForId('ms_handoff_data_ai');
  }

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
  if (key.includes('finance') || key.includes('hr & scale') || key.includes('scale') || key.includes('gcc')) {
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
    key === 'our services' ||
    key === 'triggers' ||
    key === 'browse topics' ||
    key === 'more triggers' ||
    key === 'more topics' ||
    key === 'guide & ask' ||
    key === 'faqs & ask' ||
    key === 'ask a question' ||
    key === 'talk to a human' ||
    key === 'talk to human' ||
    key === 'handoff' ||
    key === 'contact' ||
    key === 'contacts' ||
    key === 'human handoff' ||
    key === 'prc / pursuit' ||
    key === 'technology ms' ||
    key === 'cyber ms' ||
    key === 'hrms / learning' ||
    key === 'data and ai ms' ||
    key === 'main menu' ||
    key === 'guide list' ||
    key === 'browse faqs' ||
    key === 'type my question' ||
    key === 'qualification lens' ||
    key === 'capacity & cost' ||
    key === 'quality & vendors' ||
    key === 'tech, cloud & cyber' ||
    key === 'finance, hr & scale' ||
    key === 'conversation steps' ||
    key === 'how to converse' ||
    key === 'when not to force ms' ||
    key === '3 qualification tests' ||
    key === 'how to start' ||
    key === 'when not to force' ||
    key === 'cost pressure trigger' ||
    key === 'skills shortage' ||
    key === 'cloud cost rising'
  );
}
