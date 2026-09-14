import { Readable } from 'stream';
import type { InboundJob, OutboundJob } from '../../../plugins/worker/jobs';
import { logger } from '../../../utils/logger';
import type { MsAssistantConfig } from '../config';
import { getAssistantPrompts, isAxisLoanProfile, isHondaMechanicProfile, isHeroProfile, isMorthProfile, isResumeBuilderProfile } from '../bot-profiles';
import type { IWhatsAppPlugin } from '../../../plugins/whatsapp/whatsapp.interface';
import type { IStoragePlugin } from '../../../plugins/storage/storage.interface';
import type { AudioTranscriber } from '../infrastructure/stt/transcriber';
import {
  EMPTY_RESUME_STATE,
  RESUME_BUTTON_IDS,
  beginProfessionChoice,
  buildProfessionList,
  buildResumeAudioFallback,
  buildResumeGeneratingResponse,
  buildResumeQuestion,
  buildResumeReview,
  buildResumeWelcome,
  currentResumeGroup,
  detectLanguageSwitch,
  generateReferenceId,
  hasMinimumForResume,
  isResumeGenerateText,
  isResumeRestart,
  isResumeSkip,
  professionFromRowId,
  professionLabelFor,
  recordAnswer,
  startInterview,
  switchLanguage,
  type ResumeState,
} from './resume-builder';
import { extractResumeSlots } from './resume-extract';
import {
  buildResumePdf,
  fallbackStructuredResume,
  resumeFileName,
  structureResume,
  warmResumeBrowser,
  type StructuredResume,
} from './resume-pdf';
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
  WA_EMOJI,
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
import {
  mergeNegotiationContext,
  stageToLevel,
} from './axis-negotiation';
import {
  advanceBurgundyNegotiation,
  buildApplicationStartResponse,
  buildChangeLoanDetailsPrompt,
  buildOfferDetailsResponse,
  buildSpeakToExpertResponse,
  buildTeamReviewPromptResponse,
  buildThinkingPauseResponse,
  defaultTenureMonths,
  deliverFinalException,
  detectApplicationAcceptance,
  detectPriceObjection,
  detectRelationshipPushback,
  detectThinkingPause,
  emptyNegotiationFor,
  EMPTY_BURGUNDY_DISCOVERY,
  EMPTY_BURGUNDY_NEGOTIATION,
  formatBurgundyContextForLlm,
  hasClearRequirement,
  isEscalationFollowUpDue,
  loanTypeFromButtonId,
  mergeDiscoveryToNegotiation,
  parseBurgundyRequirement,
  submitBurgundyReview,
  type BurgundyDiscoveryState,
  type BurgundyNegotiationState,
  buildEmiDetailResponse,
  buildInitialOfferResponse,
  buildLoanRequirementPrompt,
} from './axis-burgundy';
import {
  buildNotInterestedResponse,
  detectNotInterested,
} from './axis-discovery';
import {
  buildAxisLeadConfirmation,
  buildAxisLeadPrompt,
  extractLoanContextFromText,
  formatAxisLeadForLog,
  inferLeadStepFromAssistantTurn as inferAxisLeadStepFromAssistantTurn,
  isAxisLeadCollecting,
  isQuestionLikeMessage as isAxisQuestionLikeMessage,
  looksLikeLeadFieldReply as looksLikeAxisLeadFieldReply,
  prepareAxisLeadFromContext,
  smartAdvanceAxisLead,
  type AxisLeadState,
} from './axis-lead';
import {
  AXIS_BUTTON_IDS,
  axisActionQuery,
  buildAxisAskPromptResponse,
  buildAxisWelcomeSequence,
  buildAxisLlmExtraInstructions,
  buildAxisMenuNudgeResponse,
  buildAxisNearMissAllowList,
  buildAxisNearMissReply,
  buildAxisNearMissResponse,
  buildAxisWelcomeResponse,
  enforceAxisBotResponse,
  isAxisLeadButton,
  isAxisLoanTypeButton,
  isAxisNegotiationButton,
  lastAxisUserQuestion,
  looksLikeAxisMenuChoice,
  resolveAxisMenuSelection,
} from './greeting-axis-loan';

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
    /** Inbound media download (WhatsApp voice notes) — Meta provider only. */
    private readonly whatsapp?: IWhatsAppPlugin,
    /** File storage for generated resume PDFs. */
    private readonly storage?: IStoragePlugin,
    /** Speech-to-text for Hindi voice notes (optional; degrades gracefully). */
    private readonly transcriber?: AudioTranscriber,
  ) {
    // Warm the headless browser at boot so the first resume PDF isn't hit with
    // the cold-launch delay. Fire-and-forget; generation retries on demand.
    if (this.isResumeBuilder) {
      void warmResumeBrowser();
    }
  }

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

  private get isAxisLoan(): boolean {
    return isAxisLoanProfile(this.config.MS_ASSISTANT_BOT_PROFILE);
  }

  private get isResumeBuilder(): boolean {
    return isResumeBuilderProfile(this.config.MS_ASSISTANT_BOT_PROFILE);
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
    if (this.isAxisLoan) {
      return this.handleAxisLoanInbound(job);
    }
    if (this.isResumeBuilder) {
      return this.handleResumeBuilderInbound(job);
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

  private get axisCustomerName(): string | undefined {
    return this.config.MS_ASSISTANT_AXIS_CUSTOMER_NAME?.trim() || undefined;
  }

  private get axisWelcomeImageUrl(): string | undefined {
    return this.config.MS_ASSISTANT_AXIS_WELCOME_IMAGE_URL?.trim() || undefined;
  }

  private get axisFollowUpImageUrl(): string | undefined {
    return this.config.MS_ASSISTANT_AXIS_FOLLOWUP_IMAGE_URL?.trim() || undefined;
  }

  private get axisEscalationWaitMs(): number {
    return (this.config.MS_ASSISTANT_AXIS_ESCALATION_WAIT_SEC ?? 86_400) * 1000;
  }

  private axisWelcomeJobs(job: InboundJob): OutboundJob[] {
    return this.toJobs(
      buildAxisWelcomeSequence(this.axisCustomerName, this.axisWelcomeImageUrl),
      job,
    );
  }

  private async handleAxisLoanInbound(job: InboundJob): Promise<OutboundJob[]> {
    const { message, orgId } = job;
    const { waId, waBusinessNumber } = message;
    const interactiveId = message.interactiveOptionId?.trim();
    const text = (message.text ?? '').trim();

    try {
      const memory = await this.memory.get(waBusinessNumber, waId);
      let leadState = memory.axisLead ?? { step: 'idle' as const };
      let discovery: BurgundyDiscoveryState = {
        ...EMPTY_BURGUNDY_DISCOVERY,
        ...(memory.axisDiscovery ?? {}),
      };
      let negotiation: BurgundyNegotiationState = {
        ...EMPTY_BURGUNDY_NEGOTIATION,
        ...(memory.axisNegotiation ?? {}),
        customerName: memory.axisNegotiation?.customerName ?? this.axisCustomerName,
      };
      const recoveringStep = inferAxisLeadStepFromAssistantTurn(memory.turns);

      const followUpDue =
        negotiation.stage === 'escalation_pending' &&
        isEscalationFollowUpDue(negotiation, this.axisEscalationWaitMs);
      if (followUpDue) {
        return this.deliverBurgundyFinalOffer(job, negotiation, discovery);
      }

      if (text && detectNotInterested(text)) {
        await this.memory.patchAxisDiscovery(waBusinessNumber, waId, {
          ...discovery,
          notInterested: true,
          step: 'done',
        });
        return this.toJobs(buildNotInterestedResponse(), job);
      }

      if (discovery.notInterested && text && !isGreetingText(text) && !isMenuNavText(text)) {
        return await this.answerFromKnowledge(job, text, { mode: 'qa' });
      }

      const isLeadReply =
        Boolean(text) &&
        !interactiveId &&
        !looksLikeAxisMenuChoice(text) &&
        !detectPriceObjection(text) &&
        !detectRelationshipPushback(text) &&
        !isAxisQuestionLikeMessage(text) &&
        (isAxisLeadCollecting(leadState) ||
          (recoveringStep && looksLikeAxisLeadFieldReply(text, recoveringStep)));

      if (isLeadReply && text && !isGreetingText(text) && !isMenuNavText(text)) {
        if (!isAxisLeadCollecting(leadState) && recoveringStep) {
          const ctx = extractLoanContextFromText(lastAxisUserQuestion(memory.turns));
          leadState = prepareAxisLeadFromContext({
            ...ctx,
            loanAmount: ctx.loanAmount ?? discovery.loanAmount,
            tenureMonths: ctx.tenureMonths ?? discovery.tenureMonths,
            purpose: discovery.loanPurpose,
          });
          leadState.step = recoveringStep;
          await this.memory.patchAxisLead(waBusinessNumber, waId, leadState);
        }
        return this.handleAxisLeadInput(job, text, leadState);
      }

      if (interactiveId || message.type === 'button' || message.type === 'interactive') {
        return await this.handleAxisLoanInteractive(job, interactiveId || text);
      }

      if (looksLikeAxisMenuChoice(text)) {
        return await this.handleAxisLoanInteractive(job, text);
      }

      if (isGreetingText(text) || isMenuNavText(text)) {
        await this.memory.patchAxisLead(waBusinessNumber, waId, { step: 'idle' });
        await this.memory.patchAxisDiscovery(waBusinessNumber, waId, EMPTY_BURGUNDY_DISCOVERY);
        await this.memory.patchAxisNegotiation(waBusinessNumber, waId, {
          ...EMPTY_BURGUNDY_NEGOTIATION,
          customerName: this.axisCustomerName,
        });
        await this.memory.setMode(waBusinessNumber, waId, 'menu');
        return this.axisWelcomeJobs(job);
      }

      if (!text) {
        return this.toJobs(buildAxisMenuNudgeResponse(), job);
      }

      if (detectApplicationAcceptance(text)) {
        if (
          negotiation.stage === 'exception_requested' ||
          negotiation.stage === 'ready_to_apply' ||
          negotiation.finalOfferDelivered ||
          negotiation.stage === 'final'
        ) {
          return this.startAxisApplication(job, discovery, negotiation);
        }
        return this.startAxisApplication(job, discovery, negotiation);
      }

      if (detectThinkingPause(text)) {
        await this.memory.patchAxisDiscovery(waBusinessNumber, waId, {
          ...discovery,
          thinkingAboutIt: true,
        });
        return this.toJobs(buildThinkingPauseResponse(), job);
      }

      if (negotiation.stage === 'escalation_pending') {
        return this.toJobs(
          {
            mode: 'text',
            text: formatWhatsAppText(
              `${WA_EMOJI.tip} *Review in progress*\n\n` +
                `_Our team will update you within 48 hours._`,
            ),
          },
          job,
        );
      }

      if (
        (detectPriceObjection(text) || detectRelationshipPushback(text)) &&
        !isAxisLeadCollecting(leadState) &&
        discovery.step === 'offer_shown'
      ) {
        return this.handleAxisNegotiation(job, text, discovery, negotiation);
      }

      const partial = parseBurgundyRequirement(text, discovery.loanType);
      if (
        partial.loanType === 'personal' &&
        partial.loanAmount &&
        !isAxisLeadCollecting(leadState)
      ) {
        return this.presentBurgundyInitialOffer(
          job,
          { ...discovery, ...partial, step: 'offer_shown' },
          negotiation,
        );
      }

      if (discovery.step === 'requirement' && text) {
        return this.handleBurgundyRequirementText(job, text, discovery, negotiation);
      }

      if (hasClearRequirement({ ...discovery, ...partial }) && !isAxisLeadCollecting(leadState)) {
        return this.presentBurgundyInitialOffer(job, { ...discovery, ...partial }, negotiation);
      }

      if (isAxisQuestionLikeMessage(text)) {
        return await this.answerFromKnowledge(job, text, { mode: 'qa' });
      }

      return await this.answerFromKnowledge(job, text, { mode: 'qa' });
    } catch (err) {
      logger.error({ err, waId, orgId }, 'MsAssistantService: handleAxisLoanInbound failed');
      return this.toJobs(
        { mode: 'text', text: formatWhatsAppText('⚠️ Something went wrong. Please try again.') },
        job,
      );
    }
  }

  private async handleAxisLoanInteractive(job: InboundJob, interactiveId: string): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const resolved = resolveAxisMenuSelection(interactiveId);
    const key = normalizeInteractiveKey(resolved);

    if (key === AXIS_BUTTON_IDS.MAIN_MENU || key === 'main menu') {
      await this.memory.patchAxisLead(waBusinessNumber, waId, { step: 'idle' });
      await this.memory.patchAxisDiscovery(waBusinessNumber, waId, EMPTY_BURGUNDY_DISCOVERY);
      await this.memory.setMode(waBusinessNumber, waId, 'menu');
      return this.axisWelcomeJobs(job);
    }

    if (key === AXIS_BUTTON_IDS.TYPE_QUESTION || key === 'ask anything') {
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildAxisAskPromptResponse(), job);
    }

    const memory = await this.memory.get(waBusinessNumber, waId);
    let discovery: BurgundyDiscoveryState = {
      ...EMPTY_BURGUNDY_DISCOVERY,
      ...(memory.axisDiscovery ?? {}),
    };
    let negotiation: BurgundyNegotiationState = {
      ...EMPTY_BURGUNDY_NEGOTIATION,
      ...(memory.axisNegotiation ?? {}),
      customerName: memory.axisNegotiation?.customerName ?? this.axisCustomerName,
    };

    if (isAxisLoanTypeButton(key)) {
      const loanType = loanTypeFromButtonId(key)!;
      discovery = {
        ...discovery,
        customerType: 'burgundy',
        loanType,
        step: 'requirement',
      };
      await this.memory.patchAxisDiscovery(waBusinessNumber, waId, discovery);
      await this.memory.setMode(waBusinessNumber, waId, 'qa');
      return this.toJobs(buildLoanRequirementPrompt(loanType), job);
    }

    if (key === AXIS_BUTTON_IDS.CHANGE_LOAN) {
      discovery = {
        ...discovery,
        step: 'requirement',
        loanAmount: undefined,
        tenureMonths: undefined,
        loanPurpose: undefined,
      };
      await this.memory.patchAxisDiscovery(waBusinessNumber, waId, discovery);
      await this.memory.patchAxisNegotiation(waBusinessNumber, waId, {
        ...EMPTY_BURGUNDY_NEGOTIATION,
        customerName: this.axisCustomerName,
      });
      return this.toJobs(buildChangeLoanDetailsPrompt(discovery.loanType), job);
    }

    if (key === AXIS_BUTTON_IDS.SPEAK_EXPERT) {
      return this.toJobs(buildSpeakToExpertResponse('expert'), job);
    }

    if (key === AXIS_BUTTON_IDS.SPEAK_RM) {
      return this.toJobs(buildSpeakToExpertResponse('rm'), job);
    }

    if (key === AXIS_BUTTON_IDS.REVIEW_LOAN || key === AXIS_BUTTON_IDS.VIEW_OFFER_DETAILS) {
      return this.toJobs(buildOfferDetailsResponse(negotiation), job);
    }

    if (key === AXIS_BUTTON_IDS.REQUEST_BEST || key === AXIS_BUTTON_IDS.SUBMIT_REVIEW) {
      if (negotiation.stage === 'review_prompt' || key === AXIS_BUTTON_IDS.SUBMIT_REVIEW) {
        return this.submitBurgundyReviewFlow(job, discovery, negotiation);
      }
      const updated = { ...negotiation, stage: 'review_prompt' as const };
      await this.memory.patchAxisNegotiation(waBusinessNumber, waId, updated);
      return this.toJobs(buildTeamReviewPromptResponse(), job);
    }

    if (key === AXIS_BUTTON_IDS.REQUEST_EXCEPTION) {
      const updated = { ...negotiation, stage: 'review_prompt' as const };
      await this.memory.patchAxisNegotiation(waBusinessNumber, waId, updated);
      return this.toJobs(buildTeamReviewPromptResponse(), job);
    }

    if (key === AXIS_BUTTON_IDS.PROCEED_OFFER) {
      return this.startAxisApplication(job, discovery, negotiation);
    }

    if (key === AXIS_BUTTON_IDS.VIEW_EMI || key === AXIS_BUTTON_IDS.VIEW_REVISED_EMI) {
      return this.toJobs(buildEmiDetailResponse(negotiation), job);
    }

    if (isAxisNegotiationButton(key)) {
      const objectionText = 'The interest rate is too high.';
      return this.handleAxisNegotiation(job, objectionText, discovery, negotiation);
    }

    if (isAxisLeadButton(key)) {
      if (key === AXIS_BUTTON_IDS.CALLBACK) {
        const lead = prepareAxisLeadFromContext({
          intent: 'callback',
          loanAmount: discovery.loanAmount ?? negotiation.loanAmount,
          tenureMonths: discovery.tenureMonths ?? negotiation.tenureMonths,
          purpose: discovery.loanPurpose,
        });
        await this.memory.patchAxisLead(waBusinessNumber, waId, lead);
        return this.toJobs(buildAxisLeadPrompt(lead), job);
      }
      return this.startAxisApplication(job, discovery, negotiation);
    }

    const contextQ = lastAxisUserQuestion(memory.turns);
    const actionQuery = axisActionQuery(key, contextQ);
    if (actionQuery) {
      return this.answerFromKnowledge(job, actionQuery, { mode: 'qa', excludeButtonId: key });
    }

    await this.memory.setMode(waBusinessNumber, waId, 'menu');
    return this.toJobs(buildAxisWelcomeResponse(), job);
  }

  private async handleBurgundyRequirementText(
    job: InboundJob,
    text: string,
    discovery: BurgundyDiscoveryState,
    negotiation: BurgundyNegotiationState,
  ): Promise<OutboundJob[]> {
    const partial = parseBurgundyRequirement(text, discovery.loanType);
    const merged = { ...discovery, ...partial };
    if (!hasClearRequirement(merged)) {
      return this.toJobs(
        {
          mode: 'text',
          text: formatWhatsAppText(
            `Could you share the loan amount and purpose together?\n\n_e.g. ₹50 lakh for my house_`,
          ),
        },
        job,
      );
    }
    return this.presentBurgundyInitialOffer(job, merged, negotiation);
  }

  private async presentBurgundyInitialOffer(
    job: InboundJob,
    discovery: BurgundyDiscoveryState,
    negotiation: BurgundyNegotiationState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const tenureMonths =
      discovery.tenureMonths ?? defaultTenureMonths(discovery.loanType);
    const nextDiscovery: BurgundyDiscoveryState = {
      ...discovery,
      customerType: 'burgundy',
      tenureMonths,
      step: 'offer_shown',
    };
    const baseNegotiation = emptyNegotiationFor(discovery.loanType);
    const nextNegotiation = mergeDiscoveryToNegotiation(nextDiscovery, {
      ...baseNegotiation,
      ...negotiation,
      stage: 'initial',
      currentRatePct: baseNegotiation.currentRatePct,
      initialRatePct: baseNegotiation.initialRatePct,
      customerName: this.axisCustomerName,
    });

    await this.memory.patchAxisDiscovery(waBusinessNumber, waId, nextDiscovery);
    await this.memory.patchAxisNegotiation(waBusinessNumber, waId, nextNegotiation);

    const response = buildInitialOfferResponse(nextNegotiation);
    return this.toJobs(response, job);
  }

  private async handleAxisNegotiation(
    job: InboundJob,
    text: string,
    discovery: BurgundyDiscoveryState,
    negotiation: BurgundyNegotiationState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const memory = await this.memory.get(waBusinessNumber, waId);
    negotiation = mergeNegotiationContext(negotiation, memory.axisLead, discovery);

    if (text.trim()) {
      await this.memory.appendTurn(
        waBusinessNumber,
        waId,
        { role: 'user', content: text.trim(), at: Date.now() },
        { mode: 'qa' },
      );
    }

    const result = advanceBurgundyNegotiation(negotiation, text);
    if (result.kind === 'noop') {
      return this.toJobs(buildOfferDetailsResponse(negotiation), job);
    }

    await this.memory.patchAxisNegotiation(waBusinessNumber, waId, result.negotiation);

    const replyText = result.responses
      .map((r) => {
        if (r.mode === 'text' || r.mode === 'buttons' || r.mode === 'list') return r.text;
        if (r.mode === 'image') return r.media.caption ?? '';
        return '';
      })
      .filter(Boolean)
      .join('\n\n');

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: replyText, at: Date.now() },
      { mode: 'qa' },
    );

    return this.toJobs(result.responses, job);
  }

  private async submitBurgundyReviewFlow(
    job: InboundJob,
    discovery: BurgundyDiscoveryState,
    negotiation: BurgundyNegotiationState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const merged = mergeDiscoveryToNegotiation(discovery, negotiation);
    const { negotiation: updated, response } = submitBurgundyReview(merged);
    await this.memory.patchAxisNegotiation(waBusinessNumber, waId, updated);
    this.scheduleBurgundyFollowUp(job, updated, discovery);
    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: response.text ?? '', at: Date.now() },
      { mode: 'qa' },
    );
    return this.toJobs(response, job);
  }

  private async deliverBurgundyFinalOffer(
    job: InboundJob,
    negotiation: BurgundyNegotiationState,
    discovery: BurgundyDiscoveryState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const { negotiation: finalNeg, responses } = deliverFinalException(
      mergeDiscoveryToNegotiation(discovery, negotiation),
      this.axisFollowUpImageUrl,
    );
    await this.memory.patchAxisNegotiation(waBusinessNumber, waId, finalNeg);
    await this.memory.patchAxisDiscovery(waBusinessNumber, waId, { ...discovery, step: 'done' });
    const replyText = responses
      .map((r) => {
        if (r.mode === 'text' || r.mode === 'buttons' || r.mode === 'list') return r.text;
        if (r.mode === 'image') return r.media.caption ?? '';
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: replyText, at: Date.now() },
      { mode: 'qa' },
    );
    return this.toJobs(responses, job);
  }

  private scheduleBurgundyFollowUp(
    job: InboundJob,
    _negotiation: BurgundyNegotiationState,
    discovery: BurgundyDiscoveryState,
  ): void {
    if (!this.publishProgress) return;
    const waitMs = this.axisEscalationWaitMs;
    const { waId, waBusinessNumber } = job.message;
    setTimeout(() => {
      void (async () => {
        try {
          const memory = await this.memory.get(waBusinessNumber, waId);
          const current = memory.axisNegotiation;
          if (!current || current.stage !== 'escalation_pending' || current.finalOfferDelivered) {
            return;
          }
          const jobs = await this.deliverBurgundyFinalOffer(
            job,
            current,
            memory.axisDiscovery ?? discovery,
          );
          await this.publishProgress!(jobs);
        } catch (err) {
          logger.warn({ err, waId }, 'Axis Burgundy: proactive follow-up failed');
        }
      })();
    }, waitMs);
    logger.info({ waId, waitMs }, 'Axis Burgundy: escalation follow-up scheduled');
  }

  private async startAxisApplication(
    job: InboundJob,
    discovery: BurgundyDiscoveryState,
    negotiation: BurgundyNegotiationState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const lead = prepareAxisLeadFromContext({
      loanAmount: discovery.loanAmount ?? negotiation.loanAmount,
      tenureMonths: discovery.tenureMonths ?? negotiation.tenureMonths,
      purpose: discovery.loanPurpose,
    });
    await this.memory.patchAxisLead(waBusinessNumber, waId, lead);
    await this.memory.setMode(waBusinessNumber, waId, 'qa');
    if (lead.step === 'done') {
      return this.toJobs(buildApplicationStartResponse(), job);
    }
    return this.toJobs(buildAxisLeadPrompt(lead), job);
  }

  private async handleAxisLeadInput(
    job: InboundJob,
    text: string,
    currentLead: AxisLeadState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;
    const memory = await this.memory.get(waBusinessNumber, waId);
    const result = smartAdvanceAxisLead(currentLead, text);

    if (result.kind === 'invalid') {
      return this.toJobs({ mode: 'text', text: formatWhatsAppText(result.message) }, job);
    }

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'user', content: text, at: Date.now() },
      { mode: 'qa' },
    );

    await this.memory.patchAxisLead(waBusinessNumber, waId, result.lead);

    let response = result.response;
    if (result.kind === 'complete') {
      const negLevel = stageToLevel(memory.axisNegotiation?.stage ?? 'initial');
      response = buildAxisLeadConfirmation(result.lead, negLevel);
      logger.info(
        { waId, orgId: job.orgId, lead: formatAxisLeadForLog(result.lead), negotiationLevel: negLevel },
        'AxisLoan: lead captured',
      );
    }

    const replyText =
      response.mode === 'text' || response.mode === 'buttons' ? response.text : '';

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: replyText, at: Date.now() },
      { mode: 'qa' },
    );

    return this.toJobs(response, job);
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
    if (this.isAxisLoan) {
      return this.answerFromKnowledgeAxis(job, question, opts);
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

  private async answerFromKnowledgeAxis(
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
    await this.emitProgress(job, 'Checking personal loan details…');

    const discoveryContext = formatBurgundyContextForLlm(
      memory.axisDiscovery,
      memory.axisNegotiation,
    );

    const vector = await this.embeddings.embedOne(safeQuestion);
    const chunks = await this.store.search(vector, this.config.MS_ASSISTANT_TOP_K);
    const filtered = chunks.filter(
      (c) => c.text && c.score >= this.config.MS_ASSISTANT_MIN_SCORE,
    );

    let botResponse: BotResponse;

    if (filtered.length === 0) {
      botResponse = buildAxisNearMissResponse(safeQuestion, excludeButtonId);
    } else {
      const response = await this.llm.answer({
        question: safeQuestion,
        chunks: filtered,
        memory,
        extraInstructions: buildAxisLlmExtraInstructions(excludeButtonId, discoveryContext),
      });

      const replyText = enforceGroundedReply(
        response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
          ? response.text
          : (response.text ?? ''),
        filtered,
      );

      if (isUnavailableKbMarker(replyText)) {
        botResponse = buildAxisNearMissResponse(safeQuestion, excludeButtonId);
      } else {
        botResponse = enforceAxisBotResponse(
          { mode: 'buttons', text: replyText, buttons: response.mode === 'buttons' ? response.buttons : [] },
          safeQuestion,
          excludeButtonId,
        );
      }
    }

    const replyText =
      botResponse.mode === 'text' || botResponse.mode === 'buttons' || botResponse.mode === 'list'
        ? botResponse.text
        : '';

    await this.memory.appendTurn(
      waBusinessNumber,
      waId,
      { role: 'assistant', content: replyText, at: Date.now() },
      { mode: opts.mode },
    );

    void this.llm
      .summarizeIfNeeded(await this.memory.get(waBusinessNumber, waId))
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
    if (this.isAxisLoan) return buildAxisNearMissAllowList();
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
    if (this.isAxisLoan) {
      return buildAxisNearMissReply(question);
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

  /* ── Resume builder (Hindi blue-collar resume bot) ────────────────────── */

  private async handleResumeBuilderInbound(job: InboundJob): Promise<OutboundJob[]> {
    const { message, orgId } = job;
    const { waId, waBusinessNumber } = message;
    const interactiveId = message.interactiveOptionId?.trim();

    try {
      const memory = await this.memory.get(waBusinessNumber, waId);
      const state: ResumeState = memory.resumeState ?? EMPTY_RESUME_STATE;

      // 1) Button taps
      if (interactiveId) {
        return await this.handleResumeButton(job, interactiveId, state);
      }

      // 2) Brand-new conversation → always greet + language choice first.
      //    (Avoids a wasted transcription call and a confusing "please type" reply
      //    when the very first message is a voice note.)
      if (state.status === 'idle') {
        await this.memory.patchResumeState(waBusinessNumber, waId, EMPTY_RESUME_STATE);
        return this.toJobs(buildResumeWelcome(), job);
      }

      // 3) Resolve inbound text (transcribe voice notes when possible)
      const resolved = await this.resolveResumeInboundText(job);
      if (resolved.wasAudioUnresolved) {
        return this.toJobs(buildResumeAudioFallback(state.language), job);
      }
      const trimmed = resolved.text.trim();

      // 4) Restart, or greeting outside an active interview → welcome
      if (
        isResumeRestart(trimmed) ||
        (state.status !== 'collecting' && isGreetingText(trimmed))
      ) {
        await this.memory.patchResumeState(waBusinessNumber, waId, EMPTY_RESUME_STATE);
        return this.toJobs(buildResumeWelcome(), job);
      }

      // 5) Typed language switch (e.g. "English" / "हिंदी") → re-render current view
      const switchTo = detectLanguageSwitch(trimmed);
      if (switchTo && switchTo !== state.language) {
        const result = switchLanguage(state, switchTo);
        await this.memory.patchResumeState(waBusinessNumber, waId, result.state);
        return this.toJobs(result.response, job);
      }

      // 6) Awaiting a profession pick from the list → nudge with the list again
      if (state.status === 'choosing_profession') {
        return this.toJobs(buildProfessionList(state.language), job);
      }

      // 7) Review stage → generate on confirmation, else re-show review
      if (state.status === 'review') {
        if (isResumeGenerateText(trimmed)) {
          return await this.generateAndSendResume(job, state);
        }
        return this.toJobs(buildResumeReview(state), job);
      }

      // 8) Already finished → show welcome (restart path)
      if (state.status === 'done') {
        return this.toJobs(buildResumeWelcome(), job);
      }

      // 9) Collecting → extract EVERY slot from the message, store, ask what's missing
      const group = currentResumeGroup(state);
      if (!group) {
        return this.toJobs(buildResumeReview({ ...state, status: 'review' }), job);
      }
      if (!trimmed) {
        return this.toJobs(buildResumeQuestion(state), job);
      }
      if (isResumeSkip(trimmed) && !group.required) {
        const skipped = recordAnswer(state, {}, { skip: true });
        await this.memory.patchResumeState(waBusinessNumber, waId, skipped.state);
        return this.toJobs(skipped.response, job);
      }
      const slots = await extractResumeSlots(this.llm, {
        rawText: trimmed,
        language: state.language,
        professionLabel: professionLabelFor(state, 'en'),
        focusFields: group.fields,
        askedAbout: group.ask,
      });
      const result = recordAnswer(state, slots);
      await this.memory.patchResumeState(waBusinessNumber, waId, result.state);
      return this.toJobs(result.response, job);
    } catch (err) {
      logger.error({ err, waId, orgId }, 'MsAssistantService: handleResumeBuilderInbound failed');
      return this.toJobs(
        {
          mode: 'text',
          text: formatWhatsAppText('माफ़ कीजिए, कुछ गड़बड़ हो गई। कृपया *फिर से* लिखकर दोबारा शुरू करें।'),
        },
        job,
      );
    }
  }

  private async handleResumeButton(
    job: InboundJob,
    interactiveId: string,
    state: ResumeState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;

    // Profession picked from the interactive list → start the tailored interview.
    const profession = professionFromRowId(interactiveId);
    if (profession) {
      const language = state.language ?? 'hi';
      const result = startInterview(language, profession, this.phoneFromWaId(waId));
      await this.memory.patchResumeState(waBusinessNumber, waId, result.state);
      return this.toJobs(result.response, job);
    }

    switch (interactiveId) {
      case RESUME_BUTTON_IDS.START_HI:
      case RESUME_BUTTON_IDS.START_EN: {
        const language = interactiveId === RESUME_BUTTON_IDS.START_EN ? 'en' : 'hi';
        const { state: next, response } = beginProfessionChoice(language);
        await this.memory.patchResumeState(waBusinessNumber, waId, next);
        return this.toJobs(response, job);
      }
      case RESUME_BUTTON_IDS.RESTART: {
        await this.memory.patchResumeState(waBusinessNumber, waId, EMPTY_RESUME_STATE);
        return this.toJobs(buildResumeWelcome(), job);
      }
      case RESUME_BUTTON_IDS.LANG_HI:
      case RESUME_BUTTON_IDS.LANG_EN: {
        if (state.status === 'idle') {
          return this.toJobs(buildResumeWelcome(), job);
        }
        const language = interactiveId === RESUME_BUTTON_IDS.LANG_EN ? 'en' : 'hi';
        const result = switchLanguage(state, language);
        await this.memory.patchResumeState(waBusinessNumber, waId, result.state);
        return this.toJobs(result.response, job);
      }
      case RESUME_BUTTON_IDS.SKIP: {
        if (state.status !== 'collecting') {
          return this.toJobs(buildResumeWelcome(), job);
        }
        const result = recordAnswer(state, {}, { skip: true });
        await this.memory.patchResumeState(waBusinessNumber, waId, result.state);
        return this.toJobs(result.response, job);
      }
      case RESUME_BUTTON_IDS.GENERATE:
        return await this.generateAndSendResume(job, state);
      default:
        return this.toJobs(
          state.status === 'collecting' ? buildResumeQuestion(state) : buildResumeWelcome(),
          job,
        );
    }
  }

  /** Formats a WhatsApp id (e.g. 918448728057) into a display phone number. */
  private phoneFromWaId(waId: string): string | undefined {
    const digits = waId.replace(/\D/g, '');
    if (!digits) return undefined;
    return `+${digits}`;
  }

  /** Resolves inbound message to text, transcribing WhatsApp voice notes when possible. */
  private async resolveResumeInboundText(
    job: InboundJob,
  ): Promise<{ text: string; wasAudioUnresolved: boolean }> {
    const { message } = job;
    const isAudio = message.type === 'audio' || message.type === 'voice';
    if (!isAudio) {
      return { text: message.text ?? '', wasAudioUnresolved: false };
    }

    if (!this.transcriber || !this.whatsapp || !message.mediaId) {
      logger.info(
        { hasTranscriber: Boolean(this.transcriber), hasWhatsapp: Boolean(this.whatsapp) },
        'resume: voice note received but transcription unavailable',
      );
      return { text: '', wasAudioUnresolved: true };
    }

    try {
      const mediaUrl = message.mediaUrl ?? (await this.whatsapp.getMediaUrl(message.mediaId));
      const buffer = await this.whatsapp.downloadMedia(mediaUrl);
      logger.info(
        { mediaId: message.mediaId, mime: message.mediaMimeType, bytes: buffer.length },
        'resume: downloaded voice note, transcribing',
      );
      const transcript = await this.transcriber.transcribe(
        buffer,
        message.mediaMimeType ?? 'audio/ogg',
        this.config.MS_ASSISTANT_STT_LANGUAGE,
      );
      if (!transcript.trim()) return { text: '', wasAudioUnresolved: true };
      return { text: transcript, wasAudioUnresolved: false };
    } catch (err) {
      logger.warn({ err }, 'resume: audio transcription failed');
      return { text: '', wasAudioUnresolved: true };
    }
  }

  private async generateAndSendResume(
    job: InboundJob,
    state: ResumeState,
  ): Promise<OutboundJob[]> {
    const { waId, waBusinessNumber } = job.message;

    const lang = state.language;

    if (!hasMinimumForResume(state)) {
      return this.toJobs(
        {
          mode: 'text',
          text: formatWhatsAppText(
            lang === 'en'
              ? 'To build a resume I need at least your *name* or *type of work*.'
              : 'रिज़्यूमे बनाने के लिए कम-से-कम आपका *नाम* या *काम* बताना ज़रूरी है।',
          ),
        },
        job,
      );
    }

    if (!this.storage) {
      logger.error('resume: storage plugin not configured — cannot host PDF');
      return this.toJobs(
        {
          mode: 'text',
          text: formatWhatsAppText(
            lang === 'en'
              ? "Sorry, sending the resume file isn't available right now."
              : 'माफ़ कीजिए, अभी रिज़्यूमे फ़ाइल भेजने की सुविधा उपलब्ध नहीं है।',
          ),
        },
        job,
      );
    }

    // Early "generating…" nudge (best-effort).
    await this.emitProgress(job, buildResumeGeneratingResponse(lang).text ?? '…');

    // 1) Structure the answers with the LLM. Never let a slow/hung provider stall
    //    the whole flow — time it out and fall back to a deterministic resume.
    let structured: StructuredResume = fallbackStructuredResume(state);
    const tStruct = Date.now();
    logger.info({ waId, orgId: job.orgId }, 'resume: structuring answers');
    try {
      structured = await withTimeout(structureResume(this.llm, state), 45_000, 'structureResume');
    } catch (err) {
      logger.warn({ err, waId }, 'resume: structuring timed out — using deterministic fallback');
    }
    logger.info({ waId, ms: Date.now() - tStruct }, 'resume: structuring done');

    // 2) Render the PDF via Puppeteer (cold browser launch can be slow).
    let pdf: Buffer;
    const tPdf = Date.now();
    logger.info({ waId }, 'resume: rendering PDF');
    try {
      pdf = await withTimeout(buildResumePdf(structured), 60_000, 'buildResumePdf');
    } catch (err) {
      logger.error({ err, waId, orgId: job.orgId }, 'resume: PDF generation failed');
      return this.toJobs(
        {
          mode: 'text',
          text: formatWhatsAppText(
            lang === 'en'
              ? 'Sorry, I could not create the resume file just now. Please tap *Create Resume* again in a moment.'
              : 'माफ़ कीजिए, अभी रिज़्यूमे फ़ाइल नहीं बन पाई। कृपया थोड़ी देर में फिर से *रिज़्यूमे बनाएँ* दबाएँ।',
          ),
        },
        job,
      );
    }
    logger.info({ waId, ms: Date.now() - tPdf, bytes: pdf.length }, 'resume: PDF rendered');

    const fileName = resumeFileName(structured);

    let upload;
    const tUp = Date.now();
    logger.info({ waId, fileName }, 'resume: uploading PDF');
    try {
      upload = await withTimeout(
        this.storage.uploadFile(bufferToMulterFile(pdf, fileName, 'application/pdf'), 'bot-media'),
        45_000,
        'uploadResumePdf',
      );
    } catch (err) {
      logger.error({ err, waId, orgId: job.orgId }, 'resume: PDF upload failed');
      return this.toJobs(
        {
          mode: 'text',
          text: formatWhatsAppText(
            lang === 'en'
              ? 'Sorry, I could not upload the resume file just now. Please try *Create Resume* again shortly.'
              : 'माफ़ कीजिए, अभी रिज़्यूमे फ़ाइल अपलोड नहीं हो पाई। कृपया थोड़ी देर में फिर से *रिज़्यूमे बनाएँ* दबाएँ।',
          ),
        },
        job,
      );
    }
    logger.info({ waId, ms: Date.now() - tUp }, 'resume: PDF uploaded');

    let url = upload.url;
    if (!/^https?:\/\//i.test(url)) {
      try {
        url = await this.storage.resolveUrl(upload.path, 'public');
      } catch (err) {
        logger.warn({ err }, 'resume: resolveUrl failed, using raw upload url');
      }
    }

    const referenceId = generateReferenceId();
    const doneState: ResumeState = { ...state, status: 'done', referenceId, documentUrl: url };
    await this.memory.patchResumeState(waBusinessNumber, waId, doneState);

    const caption = formatWhatsAppText(
      lang === 'en'
        ? `📄 *${structured.fullName}*'s resume is ready!\n\n` +
            `• *Reference ID:* ${referenceId}\n\n` +
            `You can share this for any job. To build a new one, just type *restart*.`
        : `📄 *${structured.fullName}* का रिज़्यूमे तैयार है!\n\n` +
            `• *रेफरेंस ID:* ${referenceId}\n\n` +
            `इसे आप किसी भी नौकरी के लिए भेज सकते हैं। नया रिज़्यूमे बनाने के लिए *फिर से* लिखें।`,
    );

    logger.info({ waId, orgId: job.orgId, referenceId, fileName }, 'resume: generated and sent');

    return this.toJobs(
      { mode: 'document', text: caption, media: { url, caption, filename: fileName } },
      job,
    );
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
              : this.isAxisLoan
                ? 'axis-loan'
                : this.isResumeBuilder
                  ? 'resume-builder'
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

/** Rejects if `promise` does not settle within `ms`, so no step can hang forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Wraps a Buffer as an Express.Multer.File so StoragePlugin.uploadFile can persist it. */
function bufferToMulterFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: fileName,
    encoding: '7bit',
    mimetype: mimeType,
    size: buffer.length,
    destination: '',
    filename: fileName,
    path: '',
    buffer,
    stream: Readable.from(buffer),
  } as Express.Multer.File;
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
