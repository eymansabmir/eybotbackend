import type { InboundJob, OutboundJob } from '../../../plugins/worker/jobs';
import { logger } from '../../../utils/logger';
import type { MsAssistantConfig } from '../config';
import { getAssistantPrompts, isHondaMechanicProfile, isHeroProfile, isMorthProfile } from '../bot-profiles';
import type { BotResponse } from '../domain/bot-response';
import { botResponseToOutboundJobs } from '../infrastructure/formatter/to-outbound';
import {
  enforceGroundedReply,
  enforceNearMissReply,
  isUnavailableKbMarker,
  sanitizeUserQuestion,
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
import {
  HONDA_BUTTON_IDS,
  buildHondaAnswerWithNav,
  buildHondaAskPromptResponse,
  buildHondaMenuNudgeResponse,
  buildHondaNearMissAllowList,
  buildHondaNearMissReply,
  buildHondaWelcomeResponse,
  hondaCannedMenuResponse,
  looksLikeHondaMenuChoice,
  resolveHondaMenuSelection,
} from './greeting-honda';
import {
  MORTH_BUTTON_IDS,
  buildMorthMenuNudgeResponse,
  buildMorthNearMissAllowList,
  buildMorthNearMissReply,
  buildMorthNearMissResponse,
  buildMorthWelcomeResponse,
  enforceMorthBotResponse,
  buildMorthLlmExtraInstructions,
  lastMorthUserQuestion,
  looksLikeMorthMenuChoice,
  morthActionQuery,
  morthCannedMenuResponse,
  resolveMorthMenuSelection,
} from './greeting-morth';
import {
  buildHeroLeadPrompt,
  detectHeroLeadIntentFromText,
  formatHeroLeadForLog,
  inferLeadStepFromAssistantTurn,
  isHeroLeadCollecting,
  isHeroRecommendationQuestion,
  isQuestionLikeMessage,
  looksLikeLeadFieldReply,
  normalizeHeroLeadState,
  prepareHeroLeadFromContext,
  rehydrateLeadState,
  smartAdvanceHeroLead,
  type HeroLeadState,
} from './hero-lead';
import {
  formatWhatsAppText,
} from '../infrastructure/formatter/whatsapp-format';
import {
  HERO_BUTTON_IDS,
  buildHeroAskPromptResponse,
  buildHeroLlmExtraInstructions,
  buildHeroMenuNudgeResponse,
  buildHeroNearMissAllowList,
  buildHeroNearMissReply,
  buildHeroNearMissResponse,
  buildHeroWelcomeResponse,
  enforceHeroBotResponse,
  heroActionQuery,
  heroCannedMenuResponse,
  heroLeadIntentFromButton,
  isHeroLeadButton,
  lastHeroUserQuestion,
  looksLikeHeroMenuChoice,
  resolveHeroMenuSelection,
} from './greeting-hero';

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

  private get isHonda(): boolean {
    return isHondaMechanicProfile(this.config.MS_ASSISTANT_BOT_PROFILE);
  }

  private get isMorth(): boolean {
    return isMorthProfile(this.config.MS_ASSISTANT_BOT_PROFILE);
  }

  private get isHero(): boolean {
    return isHeroProfile(this.config.MS_ASSISTANT_BOT_PROFILE);
  }

  async handleInbound(job: InboundJob): Promise<OutboundJob[]> {
    if (this.isHonda) {
      return this.handleHondaInbound(job);
    }
    if (this.isMorth) {
      return this.handleMorthInbound(job);
    }
    if (this.isHero) {
      return this.handleHeroInbound(job);
    }
    return this.handleManagedServicesInbound(job);
  }

  private async handleManagedServicesInbound(job: InboundJob): Promise<OutboundJob[]> {
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

  private async handleHondaInbound(job: InboundJob): Promise<OutboundJob[]> {
    const { message, orgId } = job;
    const { waId, waBusinessNumber } = message;
    const interactiveId = message.interactiveOptionId?.trim();
    const text = (message.text ?? '').trim();

    try {
      if (interactiveId) {
        return await this.handleHondaInteractive(job, interactiveId);
      }

      if (message.type === 'button' || message.type === 'interactive' || looksLikeHondaMenuChoice(text)) {
        return await this.handleHondaInteractive(job, text);
      }

      if (isGreetingText(text) || isMenuNavText(text)) {
        await this.memory.setMode(waBusinessNumber, waId, 'menu');
        return this.toJobs(buildHondaWelcomeResponse(), job);
      }

      if (!text) {
        return this.toJobs(buildHondaMenuNudgeResponse(), job);
      }

      if (/self\s*start|not starting|won'?t start|no start|starter relay|horn.*headlamp/i.test(text)) {
        await this.memory.setMode(waBusinessNumber, waId, 'menu');
        const canned = hondaCannedMenuResponse(HONDA_BUTTON_IDS.SELF_START);
        if (canned) return this.toJobs(canned, job);
      }

      return await this.answerFromKnowledge(job, text, { mode: 'qa' });
    } catch (err) {
      logger.error({ err, waId, orgId }, 'MsAssistantService: handleHondaInbound failed');
      return this.toJobs(
        {
          mode: 'buttons',
          text: '⚠️ Something went wrong preparing that reply. Please try again from the menu.',
          buttons: [
            { id: HONDA_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
            { id: HONDA_BUTTON_IDS.TROUBLESHOOT, title: 'Troubleshooting' },
            { id: HONDA_BUTTON_IDS.TYPE_QUESTION, title: 'Ask anything' },
          ],
        },
        job,
      );
    }
  }

  private async handleHondaInteractive(job: InboundJob, interactiveId: string): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const resolved = resolveHondaMenuSelection(interactiveId);
    const key = normalizeInteractiveKey(resolved);

    if (key === HONDA_BUTTON_IDS.MAIN_MENU || key === 'main menu') {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildHondaWelcomeResponse(), job);
    }

    if (key === HONDA_BUTTON_IDS.TYPE_QUESTION || key === 'ask anything') {
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildHondaAskPromptResponse(), job);
    }

    const canned = hondaCannedMenuResponse(resolved) ?? hondaCannedMenuResponse(key);
    if (canned) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(canned, job);
    }

    await this.memory.setMode(waBusinessNumber, waId, 'menu');
    return this.toJobs(buildHondaWelcomeResponse(), job);
  }

  private async handleMorthInbound(job: InboundJob): Promise<OutboundJob[]> {
    const { message, orgId } = job;
    const { waId, waBusinessNumber } = message;
    const interactiveId = message.interactiveOptionId?.trim();
    const text = (message.text ?? '').trim();

    try {
      if (interactiveId || message.type === 'button' || message.type === 'interactive') {
        return await this.handleMorthInteractive(job, interactiveId || text);
      }

      if (looksLikeMorthMenuChoice(text)) {
        return await this.handleMorthInteractive(job, text);
      }

      if (isGreetingText(text) || isMenuNavText(text)) {
        await this.memory.setMode(waBusinessNumber, waId, 'qa');
        return this.toJobs(buildMorthWelcomeResponse(), job);
      }

      if (!text) {
        return this.toJobs(buildMorthMenuNudgeResponse(), job);
      }

      return await this.answerFromKnowledge(job, text, { mode: 'qa' });
    } catch (err) {
      logger.error({ err, waId, orgId }, 'MsAssistantService: handleMorthInbound failed');
      return this.toJobs(
        {
          mode: 'text',
          text: '⚠️ Something went wrong. Please try asking your question again.',
        },
        job,
      );
    }
  }

  private async handleMorthInteractive(job: InboundJob, interactiveId: string): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const resolved = resolveMorthMenuSelection(interactiveId);
    const key = normalizeInteractiveKey(resolved);

    if (key === MORTH_BUTTON_IDS.MAIN_MENU || key === 'main menu') {
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildMorthWelcomeResponse(), job);
    }

    const memory = await this.memory.get(waBusinessNumber, waId);
    const contextQ = lastMorthUserQuestion(memory.turns);

    const actionQuery = morthActionQuery(key, contextQ);
    if (actionQuery) {
      return this.answerFromKnowledge(job, actionQuery, { mode: 'qa', excludeButtonId: key });
    }

    const canned = morthCannedMenuResponse(resolved) ?? morthCannedMenuResponse(key);
    if (canned) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(canned, job);
    }

    if (contextQ) {
      return this.answerFromKnowledge(job, contextQ, { mode: 'qa' });
    }

    await this.memory.setMode(waBusinessNumber, waId, 'qa');
    return this.toJobs(buildMorthWelcomeResponse(), job);
  }

  private async handleHeroInbound(job: InboundJob): Promise<OutboundJob[]> {
    const { message, orgId } = job;
    const { waId, waBusinessNumber } = message;
    const interactiveId = message.interactiveOptionId?.trim();
    const text = (message.text ?? '').trim();

    try {
      const memory = await this.memory.get(waBusinessNumber, waId);
      let leadState = normalizeHeroLeadState(
        rehydrateLeadState(memory.heroLead, memory.turns) ?? memory.heroLead,
      );

      const recoveringStep = inferLeadStepFromAssistantTurn(memory.turns);
      const isProductQuestion =
        Boolean(text) &&
        !interactiveId &&
        (isHeroRecommendationQuestion(text) || isQuestionLikeMessage(text));

      if (isProductQuestion && (isHeroLeadCollecting(leadState) || recoveringStep)) {
        await this.memory.patchHeroLead(waBusinessNumber, waId, { step: 'idle' });
        leadState = { step: 'idle' };
      }

      const isLeadReply =
        Boolean(text) &&
        !interactiveId &&
        !looksLikeHeroMenuChoice(text) &&
        !isProductQuestion &&
        (isHeroLeadCollecting(leadState) ||
          (recoveringStep && looksLikeLeadFieldReply(text, recoveringStep)));

      if (isLeadReply && text && !isGreetingText(text) && !isMenuNavText(text)) {
        if (!isHeroLeadCollecting(leadState) && recoveringStep) {
          leadState = prepareHeroLeadFromContext(
            detectHeroLeadIntentFromText(text) ?? 'quote',
            {
              modelInterest: extractHeroModelFromQuestion(lastHeroUserQuestion(memory.turns)),
              contactName: job.message.contactName,
            },
          );
          leadState.step = recoveringStep;
          await this.memory.patchHeroLead(waBusinessNumber, waId, leadState);
        }
        return this.handleHeroLeadInput(job, text, leadState!);
      }

      if (interactiveId || message.type === 'button' || message.type === 'interactive') {
        return await this.handleHeroInteractive(job, interactiveId || text);
      }

      if (looksLikeHeroMenuChoice(text)) {
        return await this.handleHeroInteractive(job, text);
      }

      if (isGreetingText(text) || isMenuNavText(text)) {
        await this.memory.patchHeroLead(waBusinessNumber, waId, { step: 'idle' });
        await this.memory.setMode(waBusinessNumber, waId, 'menu');
        return this.toJobs(buildHeroWelcomeResponse(), job);
      }

      if (!text) {
        return this.toJobs(buildHeroMenuNudgeResponse(), job);
      }

      return await this.answerFromKnowledge(job, text, { mode: 'qa' });
    } catch (err) {
      logger.error({ err, waId, orgId }, 'MsAssistantService: handleHeroInbound failed');
      return this.toJobs(
        {
          mode: 'text',
          text: '⚠️ Something went wrong. Please try asking your question again.',
        },
        job,
      );
    }
  }

  private async handleHeroLeadInput(
    job: InboundJob,
    text: string,
    currentLead: HeroLeadState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const result = smartAdvanceHeroLead(currentLead, text);

    if (result.kind === 'invalid') {
      return this.toJobs({ mode: 'text', text: formatWhatsAppText(result.message) }, job);
    }

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'user', content: text, at: Date.now() },
      { mode: 'qa' },
    );

    await this.memory.patchHeroLead(waBusinessNumber, waId, result.lead);

    if (result.kind === 'complete') {
      logger.info(
        { waId, orgId: job.orgId, lead: formatHeroLeadForLog(result.lead) },
        'HeroSales: lead captured',
      );
    }

    const replyText =
      result.response.mode === 'text' || result.response.mode === 'buttons'
        ? result.response.text
        : '';

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: replyText, at: Date.now() },
      { mode: 'qa' },
    );

    return this.toJobs(result.response, job);
  }

  private async handleHeroInteractive(job: InboundJob, interactiveId: string): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const resolved = resolveHeroMenuSelection(interactiveId);
    const key = normalizeInteractiveKey(resolved);

    if (key === HERO_BUTTON_IDS.MAIN_MENU || key === 'main menu') {
      await this.memory.patchHeroLead(waBusinessNumber, waId, { step: 'idle' });
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(buildHeroWelcomeResponse(), job);
    }

    if (key === HERO_BUTTON_IDS.TYPE_QUESTION || key === 'ask anything') {
      await this.memory.patchHeroLead(waBusinessNumber, waId, { step: 'idle' });
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildHeroAskPromptResponse(), job);
    }

    if (isHeroLeadButton(key)) {
      const memory = await this.memory.get(waBusinessNumber, waId);
      const contextQ = lastHeroUserQuestion(memory.turns);
      const modelFromContext = extractHeroModelFromQuestion(contextQ);
      const lead = prepareHeroLeadFromContext(heroLeadIntentFromButton(key), {
        modelInterest: modelFromContext,
        contactName: job.message.contactName,
      });
      await this.memory.patchHeroLead(waBusinessNumber, waId, lead);
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildHeroLeadPrompt(lead), job);
    }

    const memory = await this.memory.get(waBusinessNumber, waId);
    const contextQ = lastHeroUserQuestion(memory.turns);

    const actionQuery = heroActionQuery(key, contextQ);
    if (actionQuery) {
      return this.answerFromKnowledge(job, actionQuery, { mode: 'qa', excludeButtonId: key });
    }

    const canned = heroCannedMenuResponse(resolved) ?? heroCannedMenuResponse(key);
    if (canned) {
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.toJobs(canned, job);
    }

    if (contextQ) {
      return this.answerFromKnowledge(job, contextQ, { mode: 'qa' });
    }

    await this.memory.setMode(waBusinessNumber, waId, 'menu');
    return this.toJobs(buildHeroWelcomeResponse(), job);
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
    opts: { mode: 'qa' | 'menu'; excludeButtonId?: string } = { mode: 'qa' },
  ): Promise<OutboundJob[]> {
    if (this.isMorth) {
      return this.answerFromKnowledgeMorth(job, question, opts);
    }
    if (this.isHero) {
      return this.answerFromKnowledgeHero(job, question, opts);
    }

    const { waId, waBusinessNumber } = job.message;
    const safeQuestion = sanitizeUserQuestion(question);

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'user', content: safeQuestion, at: Date.now() },
      { mode: opts.mode },
    );

    const memory = await this.memory.get(waBusinessNumber, waId);

    await this.emitProgress(
      job,
      this.isMorth
        ? 'Looking up Parivahan guidance…'
        : this.isHonda
          ? 'Looking up workshop data…'
          : 'Fetching information from approved knowledge…',
    );

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

    return this.toJobs(this.buildAnswerWithNav(replyText), job);
  }

  private async answerFromKnowledgeMorth(
    job: InboundJob,
    question: string,
    opts: { mode: 'qa' | 'menu'; excludeButtonId?: string } = { mode: 'qa' },
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const safeQuestion = sanitizeUserQuestion(question);
    const { excludeButtonId } = opts;

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'user', content: safeQuestion, at: Date.now() },
      { mode: opts.mode },
    );

    const memory = await this.memory.get(waBusinessNumber, waId);

    await this.emitProgress(job, 'Looking up Parivahan guidance…');

    const vector = await this.embeddings.embedOne(safeQuestion);
    const chunks = await this.store.search(vector, this.config.MS_ASSISTANT_TOP_K);
    const filtered = chunks.filter(
      (c) => c.text && c.score >= this.config.MS_ASSISTANT_MIN_SCORE,
    );

    let botResponse: BotResponse;

    if (filtered.length === 0) {
      botResponse = buildMorthNearMissResponse(safeQuestion, excludeButtonId);
    } else {
      const response = await this.llm.answer({
        question: safeQuestion,
        chunks: filtered,
        memory,
        extraInstructions: buildMorthLlmExtraInstructions(excludeButtonId),
      });

      if (response.mode === 'buttons' && response.buttons?.length) {
        const groundedText = enforceGroundedReply(response.text, filtered);
        if (isUnavailableKbMarker(groundedText)) {
          botResponse = buildMorthNearMissResponse(safeQuestion, excludeButtonId);
        } else {
          botResponse = enforceMorthBotResponse(
            { ...response, text: groundedText },
            safeQuestion,
            excludeButtonId,
          );
        }
      } else {
        const replyText = enforceGroundedReply(
          response.mode === 'text' ? response.text : (response.text ?? ''),
          filtered,
        );
        if (isUnavailableKbMarker(replyText)) {
          botResponse = buildMorthNearMissResponse(safeQuestion, excludeButtonId);
        } else {
          botResponse = enforceMorthBotResponse(
            { mode: 'text', text: replyText },
            safeQuestion,
            excludeButtonId,
          );
        }
      }
    }

    const replyText =
      botResponse.mode === 'text' || botResponse.mode === 'buttons' || botResponse.mode === 'list'
        ? botResponse.text
        : '';

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
        const current = await this.memory.get(waBusinessNumber, waId);
        await this.memory.save(waBusinessNumber, waId, { ...current, summary });
      })
      .catch((err) => logger.warn({ err }, 'MsAssistantService: summary refresh failed'));

    return this.toJobs(botResponse, job);
  }

  private async answerFromKnowledgeHero(
    job: InboundJob,
    question: string,
    opts: { mode: 'qa' | 'menu'; excludeButtonId?: string } = { mode: 'qa' },
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const safeQuestion = sanitizeUserQuestion(question);
    const { excludeButtonId } = opts;

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'user', content: safeQuestion, at: Date.now() },
      { mode: opts.mode },
    );

    const memory = await this.memory.get(waBusinessNumber, waId);

    await this.emitProgress(job, 'Finding the right Hero for you…');

    const vector = await this.embeddings.embedOne(safeQuestion);
    const chunks = await this.store.search(vector, this.config.MS_ASSISTANT_TOP_K);
    const filtered = chunks.filter(
      (c) => c.text && c.score >= this.config.MS_ASSISTANT_MIN_SCORE,
    );

    let botResponse: BotResponse;

    if (filtered.length === 0) {
      botResponse = buildHeroNearMissResponse(safeQuestion, excludeButtonId);
    } else {
      const response = await this.llm.answer({
        question: safeQuestion,
        chunks: filtered,
        memory,
        extraInstructions: buildHeroLlmExtraInstructions(excludeButtonId),
      });

      if (response.mode === 'buttons' && response.buttons?.length) {
        const groundedText = enforceGroundedReply(response.text, filtered);
        if (isUnavailableKbMarker(groundedText)) {
          botResponse = buildHeroNearMissResponse(safeQuestion, excludeButtonId);
        } else {
          botResponse = enforceHeroBotResponse(
            { ...response, text: groundedText },
            safeQuestion,
            excludeButtonId,
          );
        }
      } else {
        const replyText = enforceGroundedReply(
          response.mode === 'text' ? response.text : (response.text ?? ''),
          filtered,
        );
        if (isUnavailableKbMarker(replyText)) {
          botResponse = buildHeroNearMissResponse(safeQuestion, excludeButtonId);
        } else {
          botResponse = enforceHeroBotResponse(
            { mode: 'text', text: replyText },
            safeQuestion,
            excludeButtonId,
          );
        }
      }
    }

    const leadOutcome = this.applyHeroLeadWarmth(job, safeQuestion, memory, botResponse);
    botResponse = leadOutcome.response;
    if (leadOutcome.lead) {
      await this.memory.patchHeroLead(waBusinessNumber, waId, leadOutcome.lead);
    }

    const replyText =
      botResponse.mode === 'text' || botResponse.mode === 'buttons' || botResponse.mode === 'list'
        ? botResponse.text
        : '';

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
        const current = await this.memory.get(waBusinessNumber, waId);
        await this.memory.save(waBusinessNumber, waId, { ...current, summary });
      })
      .catch((err) => logger.warn({ err }, 'MsAssistantService: summary refresh failed'));

    return this.toJobs(botResponse, job);
  }

  /** Lead capture starts only from Get city quote / Book test ride buttons — not inline. */
  private applyHeroLeadWarmth(
    _job: InboundJob,
    _question: string,
    _memory: Awaited<ReturnType<RedisConversationMemory['get']>>,
    response: BotResponse,
  ): { response: BotResponse; lead?: HeroLeadState } {
    return { response };
  }

  private buildAnswerWithNav(text: string): BotResponse {
    if (this.isHonda) return buildHondaAnswerWithNav(text);
    return buildAnswerWithNav(text);
  }

  private buildNearMissAllowListForProfile() {
    if (this.isHonda) return buildHondaNearMissAllowList();
    if (this.isMorth) return buildMorthNearMissAllowList();
    if (this.isHero) return buildHeroNearMissAllowList();
    return buildNearMissAllowList();
  }

  private unavailableFallbackMessage(): string {
    return getAssistantPrompts(this.config.MS_ASSISTANT_BOT_PROFILE).unavailableMessage;
  }

  private async buildNearMissReply(
    question: string,
    chunks: RetrievedChunk[],
  ): Promise<string> {
    const allowList = this.buildNearMissAllowListForProfile();
    const fallback = this.unavailableFallbackMessage();

    if (this.isHonda) {
      return buildHondaNearMissReply(question);
    }
    if (this.isMorth) {
      return buildMorthNearMissReply(question);
    }
    if (this.isHero) {
      return buildHeroNearMissReply(question);
    }

    try {
      const response = await this.llm.suggestNearMiss({ question, chunks, allowList });
      const text =
        response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
          ? response.text
          : (response.text ?? '');
      return enforceNearMissReply(text, allowList) ?? fallback;
    } catch (err) {
      logger.warn({ err }, 'MsAssistantService: near-miss LLM failed');
      return fallback;
    }
  }

  private toJobs(response: BotResponse | BotResponse[], job: InboundJob): OutboundJob[] {
    const list = Array.isArray(response) ? response : [response];
    const ctx = {
      waId: job.message.waId,
      waBusinessNumber: job.message.waBusinessNumber,
      orgId: job.orgId,
      sessionId: `${
        this.isHonda
          ? 'honda-mechanic'
          : this.isMorth
            ? 'morth'
            : this.isHero
              ? 'hero-sales'
              : 'ms-assistant'
      }:${job.message.waId}`,
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
    key === 'client opportunity scan' ||
    key === 'take the survey' ||
    key === 'survey' ||
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

function extractHeroModelFromQuestion(question: string): string | undefined {
  const q = question.toLowerCase();
  if (/xpulse/.test(q)) return 'Xpulse 210';
  if (/xtreme 160|160r 4v|160r/.test(q)) return 'Xtreme 160R';
  if (/xtreme 125|125r/.test(q)) return 'Xtreme 125R';
  if (/glamour x/.test(q)) return 'Glamour X';
  if (/glamour/.test(q)) return 'Glamour';
  if (/super splendor/.test(q)) return 'Super Splendor XTEC';
  if (/splendor.*xtec|xtec 2\.0/.test(q)) return 'Splendor+ XTEC';
  if (/splendor/.test(q)) return 'Splendor+';
  if (/hf deluxe|hf delux/.test(q)) return 'HF Deluxe';
  if (/hf 100|hf100/.test(q)) return 'HF 100';
  return undefined;
}
