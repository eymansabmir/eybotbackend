import { Translate } from '@google-cloud/translate/build/src/v2';
import { Node } from '../../schemas/node.schema';
import { NodeType } from '../../schemas/node-types.enum';
import type { IFlowRepository } from '../../features/flow/flow.repository';

const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

let translate: Translate | undefined;
if (apiKey) {
  translate = new Translate({ key: apiKey });
}

/**
 * Protects {{variables}} from being translated
 */
const protectVariables = (text: string): { protectedText: string; variables: string[] } => {
  const variables: string[] = [];
  const protectedText = text.replace(/\{\{[^}]+\}\}/g, (match) => {
    variables.push(match);
    return `[#${variables.length - 1}]`;
  });
  return { protectedText, variables };
};

/**
 * Restores {{variables}} after translation
 */
const restoreVariables = (text: string, variables: string[]): string => {
  return text.replace(/\[\s*#\s*(\d+)\s*\]/g, (match, index) => {
    const varIndex = parseInt(index, 10);
    return variables[varIndex] || match;
  });
};

/**
 * Translate a batch of texts using Google Translate
 */
async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  if (!translate || texts.length === 0) return texts;

  const protectedItems = texts.map(text => protectVariables(text));
  const [translations] = await translate.translate(protectedItems.map(p => p.protectedText), targetLang);

  const results = Array.isArray(translations) ? translations : [translations];
  return results.map((t, i) => {
    const variables = protectedItems[i]?.variables || [];
    return restoreVariables(t, variables);
  });
}

/**
 * Helper to read a value at a dotted path in an object
 */
function getValueByPath(obj: any, path: string): string | undefined {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

/**
 * Helper to set a value at a dotted path in an object
 */
function setValueByPath(obj: any, path: string, value: string): void {
  const parts = path.split('.');
  const last = parts.pop()!;
  const target = parts.reduce((acc, part) => acc && acc[part], obj);
  if (target) target[last] = value;
}

/**
 * Sync translations for a flow.
 * Uses the IFlowRepository — no direct database or Prisma access.
 */
export async function syncFlowTranslations(
  repo: IFlowRepository,
  flowId: string,
  targetLanguages: string[],
): Promise<void> {
  console.log(`[i18n] Starting syncFlowTranslations for flow ${flowId} with ${targetLanguages.length} languages`);
  const flow = await repo.findByIdOrFail(flowId);
  const nodes = flow.nodes as any as Node[];
  const translatableItems: { nodeId: string; path: string; text: string }[] = [];

  // 1. Collect all translatable strings from relevant node types
  nodes.forEach((node) => {
    const paths: string[] = [];
    switch (node.type) {
      case NodeType.SEND_TEXT:
      case NodeType.ASK_QUESTION:
      case NodeType.LANGUAGE:
        paths.push('data.message');
        break;
      case NodeType.HUMAN_HANDOFF:
        if (node.data.message) paths.push('data.message');
        break;
      case NodeType.SEND_IMAGE:
      case NodeType.SEND_VIDEO:
      case NodeType.SEND_AUDIO:
      case NodeType.SEND_DOCUMENT:
      case NodeType.SEND_STICKER:
        if (node.data.caption) paths.push('data.caption');
        break;
      case NodeType.SEND_LOCATION:
        if (node.data.name) paths.push('data.name');
        if (node.data.address) paths.push('data.address');
        break;
      case NodeType.OPENAI:
      case NodeType.ELEVENLABS:
        if (node.data.fallbackText) paths.push('data.fallbackText');
        break;
      case NodeType.SEND_BUTTONS:
        paths.push('data.body', 'data.footer');
        (node.data.buttons as any[])?.forEach((_, i) => paths.push(`data.buttons.${i}.title`));
        break;
      case NodeType.SEND_LIST:
        paths.push('data.body', 'data.footer', 'data.buttonTitle');
        (node.data.sections as any[])?.forEach((s, si) => {
          paths.push(`data.sections.${si}.title`);
          s.rows?.forEach((_: any, ri: number) => {
            paths.push(`data.sections.${si}.rows.${ri}.title`, `data.sections.${si}.rows.${ri}.description`);
          });
        });
        break;
      case NodeType.NPS:
        paths.push('data.message');
        if (node.data.leftLabel) paths.push('data.leftLabel');
        if (node.data.rightLabel) paths.push('data.rightLabel');
        if (node.data.buttonLabel) paths.push('data.buttonLabel');
        break;
      case NodeType.SEND_CARDS:
        (node.data.items as any[])?.forEach((item, ii) => {
          if (item.title) paths.push(`data.items.${ii}.title`);
          if (item.description) paths.push(`data.items.${ii}.description`);
          item.buttons?.forEach((_: any, bi: number) => {
            paths.push(`data.items.${ii}.buttons.${bi}.text`);
          });
        });
        break;
      case NodeType.SEND_CAROUSEL:
        if (node.data.bodyText) paths.push('data.bodyText');
        (node.data.cards as any[])?.forEach((card, ci) => {
          if (card.bodyText) paths.push(`data.cards.${ci}.bodyText`);
          if (card.ctaUrlButton?.displayText) paths.push(`data.cards.${ci}.ctaUrlButton.displayText`);
          card.quickReplyButtons?.forEach((_: any, bi: number) => {
            paths.push(`data.cards.${ci}.quickReplyButtons.${bi}.title`);
          });
        });
        break;
    }

    paths.forEach(path => {
      const text = getValueByPath(node, path);
      if (typeof text === 'string' && text.trim()) {
        translatableItems.push({ nodeId: node.id, path, text });
      }
    });
  });

  if (translatableItems.length === 0) return;

  // 2. For each target language: translate and save via the repository
  for (const lang of targetLanguages) {
    console.log(`[i18n] Translating flow ${flowId} to "${lang}"...`);
    const texts = translatableItems.map(item => item.text);
    let translatedTexts: string[];
    try {
      translatedTexts = await translateBatch(texts, lang);
    } catch (transErr: any) {
      continue; // Skip this language if translation fails
    }

    const translatedNodes = JSON.parse(JSON.stringify(nodes));
    translatableItems.forEach((item, i) => {
      const node = translatedNodes.find((n: any) => n.id === item.nodeId);
      const translatedText = translatedTexts[i];
      if (node && translatedText !== undefined) {
        setValueByPath(node, item.path, translatedText);
      }
    });

    // Persist via repository — all DB access is encapsulated here
    await repo.saveTranslation(flowId, lang, translatedNodes);
  }
}
