import { logger } from '../utils/logger';

export const INDEXNOW_KEY = 'fdaae3f296be4b85b8728643b9fcc152';

export interface IndexNowResponse {
  success: boolean;
  statusCode?: number;
  message: string;
  submittedUrls: string[];
}

/**
 * Submit URL(s) to the IndexNow protocol (supported by Bing, Yandex, Seznam, Naver, etc.)
 */
export async function submitToIndexNow(
  siteUrl: string,
  urls: string | string[]
): Promise<IndexNowResponse> {
  const urlList = Array.isArray(urls) ? urls : [urls];
  if (urlList.length === 0) {
    return { success: false, message: 'No URLs provided', submittedUrls: [] };
  }

  let host: string;
  try {
    const parsed = new URL(siteUrl);
    host = parsed.hostname;
  } catch {
    host = siteUrl.replace(/^https?:\/\//, '').split('/')[0];
  }

  const cleanSiteUrl = siteUrl.replace(/\/$/, '');
  const keyLocation = `${cleanSiteUrl}/${INDEXNOW_KEY}.txt`;

  const payload = {
    host,
    key: INDEXNOW_KEY,
    keyLocation,
    urlList
  };

  logger.info(`[IndexNow] Submitting ${urlList.length} URL(s) to IndexNow API for host: ${host}`);

  // Endpoints: IndexNow shared endpoint and Bing fallback
  const endpoints = [
    'https://api.indexnow.org/indexnow',
    'https://www.bing.com/indexnow'
  ];

  let lastStatus = 0;
  let lastError = '';

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      lastStatus = response.status;

      // IndexNow returns 200 (OK) or 202 (Accepted)
      if (response.ok || response.status === 200 || response.status === 202) {
        logger.info(`[IndexNow] Successfully submitted ${urlList.length} URL(s) via ${endpoint} (HTTP ${response.status})`);
        return {
          success: true,
          statusCode: response.status,
          message: `Submitted ${urlList.length} URL(s) successfully (HTTP ${response.status})`,
          submittedUrls: urlList
        };
      } else {
        const text = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}: ${text || response.statusText}`;
        logger.warn(`[IndexNow] ${endpoint} returned error: ${lastError}`);
      }
    } catch (err: any) {
      lastError = err.message || 'Network error';
      logger.warn(`[IndexNow] Failed to reach ${endpoint}: ${lastError}`);
    }
  }

  return {
    success: false,
    statusCode: lastStatus,
    message: `IndexNow submission failed: ${lastError}`,
    submittedUrls: urlList
  };
}
