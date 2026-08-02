import OpenAI from 'openai';
import type { MsAssistantConfig } from '../../config';
import { resolveMsAssistantApiKey } from '../../config';

/**
 * OpenAI SDK client that also works with GitHub Models / Copilot-compatible proxies.
 * Set OPENAI_BASE_URL (e.g. https://models.github.ai/inference) and put the PAT in
 * OPENAI_API_KEY or GITHUB_TOKEN.
 */
export function createMsOpenAIClient(config: MsAssistantConfig): OpenAI {
  const apiKey = resolveMsAssistantApiKey(config);
  if (!apiKey) {
    throw new Error(
      '[MsAssistant] OPENAI_API_KEY or GITHUB_TOKEN is required (GitHub PAT works with OPENAI_BASE_URL)',
    );
  }

  const options: ConstructorParameters<typeof OpenAI>[0] = { apiKey };

  if (config.OPENAI_BASE_URL) {
    options.baseURL = config.OPENAI_BASE_URL;
  }

  // GitHub Models / GitHub API clients often expect these headers.
  if (isGithubModelsEndpoint(config.OPENAI_BASE_URL)) {
    options.defaultHeaders = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  return new OpenAI(options);
}

function isGithubModelsEndpoint(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    return (
      host === 'models.github.ai' ||
      host === 'models.inference.ai.azure.com' ||
      host.endsWith('.models.github.ai')
    );
  } catch {
    return false;
  }
}
