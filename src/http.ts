// Port of Ahmad::http()/api() — fetch with SSE fallback parsing.
import type { Logger } from './logger.js';

/** Thrown on HTTP 403 — the chat is unreachable (bot blocked, kicked, or deleted chat). Callers may swallow it. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function isForbidden(e: unknown): boolean {
  return e instanceof ForbiddenError || (e instanceof Error && /HTTP 403\b/.test(e.message));
}

export class HttpClient {
  constructor(private logger: Logger) {}

  async http(url: string, data: unknown, headers: Record<string, string> = {}, timeoutMs = 120000): Promise<any> {
    const service = url.includes('tapi.bale.ai') ? 'Bale' : 'AI provider';
    const path = safePath(url);
    const operation = service === 'Bale' ? path.split('/').pop() || path : path;
    const started = Date.now();
    this.logger.log('request.start', { service, operation });
    const body = JSON.stringify(data);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    let text = '';
    let status = 0;
    let contentType = 'unknown';
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        signal: controller.signal,
      });
      status = res.status;
      contentType = res.headers.get('content-type') || 'unknown';
      text = await res.text();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.log('request.end', {
        service,
        operation,
        status,
        content_type: contentType,
        bytes: 0,
        duration_ms: Date.now() - started,
        curl_error: msg,
      });
      throw new Error(`${service} request failed: HTTP ${status} ${msg}`);
    } finally {
      clearTimeout(timer);
    }
    this.logger.log('request.end', {
      service,
      operation,
      status,
      content_type: contentType,
      bytes: text.length,
      duration_ms: Date.now() - started,
      curl_error: '',
    });
    if (status === 403) throw new ForbiddenError(`${service} request failed: HTTP 403`);
    if (status >= 400) throw new Error(`${service} request failed: HTTP ${status}`);
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (json === null && contentType.toLowerCase().includes('text/event-stream')) {
      const parsed = this.parseSse(text);
      if (parsed.error) throw new Error('AI provider stream reported an error');
      if (parsed.content !== '') {
        json = { choices: [{ message: { content: parsed.content } }] };
      }
    }
    if (json === null || typeof json !== 'object') {
      throw new Error(
        `${service} returned invalid JSON: HTTP ${status}, content type ${contentType}, bytes ${text.length}`,
      );
    }
    if (Object.prototype.hasOwnProperty.call(json, 'ok') && !json.ok) {
      throw new Error('Bale API rejected request: ' + (json.description ?? 'unknown error'));
    }
    return json;
  }

  private parseSse(out: string): { content: string; error: boolean } {
    let content = '';
    let error = false;
    let events = 0;
    for (const line of out.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '' || data === '[DONE]') continue;
      let event: any;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (!event || typeof event !== 'object') continue;
      events++;
      if (event.error) {
        error = true;
      }
      const choice = event.choices?.[0];
      const piece =
        choice?.delta?.content ??
        choice?.message?.content ??
        choice?.text ??
        choice?.delta?.text ??
        choice?.message?.reasoning_content ??
        choice?.delta?.reasoning_content ??
        '';
      if (typeof piece === 'string') content += piece;
      else if (Array.isArray(piece)) {
        for (const p of piece) {
          if (typeof p === 'string') content += p;
          else if (p && typeof p === 'object' && typeof p.text === 'string') content += p.text;
        }
      }
    }
    this.logger.log('stream.parsed', {
      events,
      content_chars: [...content].length,
      has_error: error,
    });
    return { content, error };
  }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
