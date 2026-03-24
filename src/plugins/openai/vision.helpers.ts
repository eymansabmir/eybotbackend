/**
 * Vision helpers — ported from autobot forge blocks.
 *
 * Detects vision-compatible models and splits text+image-URL messages
 * into the multi-part content blocks that the OpenAI API expects.
 */

import {
  MODELS_WITH_IMAGE_URL_SUPPORT,
  EXCLUDED_MODELS_FROM_IMAGE_URL_SUPPORT,
} from './openai.constants';

// ── Wildcard matching ─────────────────────────────────────────────────────

/**
 * Returns true when `value` matches at least one of the `patterns`.
 * Patterns support a trailing `*` wildcard only (prefix matching).
 */
function wildcardMatch(patterns: string[], value: string): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (value.startsWith(prefix)) return true;
    } else if (value === pattern) {
      return true;
    }
  }
  return false;
}

// ── Public helpers ────────────────────────────────────────────────────────

/**
 * Returns `true` when the model supports `image_url` content parts
 * (GPT-4 Turbo, GPT-4o, GPT-5, etc.).
 */
export function isModelCompatibleWithVision(model: string | undefined): boolean {
  if (!model) return false;
  if (EXCLUDED_MODELS_FROM_IMAGE_URL_SUPPORT.includes(model)) return false;
  return wildcardMatch(MODELS_WITH_IMAGE_URL_SUPPORT, model);
}

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageUrlContentPart {
  type: 'image_url';
  image_url: { url: string };
}

export type ContentPart = TextContentPart | ImageUrlContentPart;

/**
 * Splits a user message that might contain image URLs (separated by
 * double-newlines) into OpenAI multi-part content blocks.
 *
 * If the input contains no URLs it returns the original string unchanged.
 *
 * Ported from autobot's `splitUserTextMessageIntoOpenAIBlocks`.
 */
export async function splitUserTextMessageIntoContentParts(
  input: string,
): Promise<string | ContentPart[]> {
  const blocks = input.split('\n\n');
  const parts: ContentPart[] = [];

  for (const block of blocks) {
    if (block.startsWith('http') || block.startsWith('["http')) {
      const urls: string[] = block.startsWith('[') ? JSON.parse(block) : [block];

      for (const rawUrl of urls) {
        const url = rawUrl.trim();
        try {
          const response = await fetch(url, { method: 'HEAD' });
          const contentType = response.headers.get('content-type') ?? '';

          if (response.ok && contentType.startsWith('image/')) {
            parts.push({ type: 'image_url', image_url: { url } });
          } else {
            parts.push({ type: 'text', text: url });
          }
        } catch {
          parts.push({ type: 'text', text: url });
        }
      }
    } else {
      // Merge consecutive text parts.
      const last = parts.at(-1);
      if (last?.type === 'text') {
        parts[parts.length - 1] = { type: 'text', text: last.text + '\n\n' + block };
      } else {
        parts.push({ type: 'text', text: block });
      }
    }
  }

  // If the result is a single text block, return it as a plain string.
  if (parts.length === 1 && parts[0]!.type === 'text') {
    return (parts[0] as TextContentPart).text;
  }

  return parts;
}
