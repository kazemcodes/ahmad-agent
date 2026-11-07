// Port of src/WebSearch.php — Brave Search, top 5, sanitized.
export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

export class WebSearch {
  constructor(private key: string) {}

  async search(query: string): Promise<SearchResult[]> {
    const q = [...query].slice(0, 400).join('');
    const params = new URLSearchParams({ q, count: '5' });
    const url = `https://api.search.brave.com/res/v1/web/search?${params}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.key },
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new Error('Web search failed: ' + (e instanceof Error ? e.message : String(e)));
    }
    if (res.status !== 200) throw new Error(`Web search failed: HTTP ${res.status}`);
    const data: any = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') throw new Error('Invalid search response');
    const out: SearchResult[] = [];
    for (const row of data.web?.results ?? []) {
      const u: unknown = row.url;
      if (typeof u !== 'string' || !isHttpUrl(u)) continue;
      out.push({
        title: [...stripTags(String(row.title ?? ''))].slice(0, 120).join(''),
        url: u,
        description: [...stripTags(String(row.description ?? ''))].slice(0, 200).join(''),
      });
    }
    return out.slice(0, 5);
  }
}
