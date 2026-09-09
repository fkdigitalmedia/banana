import OpenAI from 'openai';

/**
 * Creates an OpenAI client configured for the DeepSeek API endpoint.
 * DeepSeek uses the OpenAI SDK format with baseURL https://api.deepseek.com.
 */
export function createDeepSeekClient(apiKey: string): OpenAI {
  if (!apiKey || apiKey === 'your_deepseek_api_key_here') {
    throw new Error('DEEPSEEK_API_KEY is not configured or is using placeholder value.');
  }

  return new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
    timeout: 90000, // 90s timeout for complex prompts
    maxRetries: 0,  // We handle retries with exponential backoff manually
  });
}

export interface DeepSeekCallOptions {
  maxRetries?: number;
  temperature?: number;
  jsonMode?: boolean;
}

/**
 * Calls DeepSeek with robust retry logic, backoff, and JSON response mode.
 */
export async function callDeepSeek(
  client: OpenAI,
  systemPrompt: string,
  userPrompt: string,
  options?: DeepSeekCallOptions
): Promise<string> {
  const maxRetries = options?.maxRetries ?? 3;
  const temperature = options?.temperature ?? 0.6;
  const jsonMode = options?.jsonMode ?? true;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
      });

      const content = response.choices[0]?.message?.content;
      if (!content || content.trim().length === 0) {
        throw new Error('DeepSeek returned an empty response.');
      }

      return content;
    } catch (error: any) {
      lastError = error;
      attempt++;

      // Check for non-retriable auth errors (401, 403)
      if (error?.status === 401 || error?.status === 403) {
        throw new Error(`DeepSeek API Authentication Failed: ${error.message}`);
      }

      if (attempt > maxRetries) {
        break;
      }

      // Exponential backoff: 1.5s, 3s, 6s...
      const delayMs = Math.min(1500 * Math.pow(2, attempt - 1), 10000);
      console.warn(`[DeepSeek] Attempt ${attempt} failed (${error.message}). Retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  throw new Error(`DeepSeek API call failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
}
