import { errorMessage } from "./errors";
import { extractReadableTextFromHtml } from "./extract-web";
import { fetchWebResource, resolveWebFetchMode, type WebFetchMode } from "./web-transport";
import { runWeatherSearch } from "./weather-search";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebSearchProvider =
  | "weather-direct"
  | "bing-rss"
  | "duckduckgo-instant"
  | "wikipedia-opensearch";

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet?: string;
  content: string;
};

export type WebSearchResponse = {
  query: string;
  provider: WebSearchProvider;
  mode: WebFetchMode;
  results: WebSearchResultItem[];
};

export type WebSearchOptions = {
  maxResults?: number;
  contentMaxChars?: number;
  fetchPageContent?: boolean;
};

const defaultMaxResults = 5;
const defaultContentMaxChars = 4_000;

const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function pushHit(
  hits: WebSearchHit[],
  seen: Set<string>,
  title: string,
  url: string,
  snippet?: string,
) {
  const normalizedTitle = title.trim();
  const normalizedUrl = url.trim();
  if (!normalizedTitle || !isHttpUrl(normalizedUrl) || seen.has(normalizedUrl)) return;
  seen.add(normalizedUrl);
  hits.push({
    title: normalizedTitle,
    url: normalizedUrl,
    snippet: snippet?.trim() || undefined,
  });
}

export function parseBingRssResults(xml: string): WebSearchHit[] {
  const doc = new DOMParser().parseFromString(xml.trim(), "application/xml");
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();

  for (const item of Array.from(doc.querySelectorAll("item"))) {
    const title = item.querySelector("title")?.textContent ?? "";
    const url = item.querySelector("link")?.textContent?.trim() ?? "";
    const snippet = item.querySelector("description")?.textContent ?? "";
    pushHit(hits, seen, title, url, snippet);
  }

  return hits;
}

type InstantTopic = {
  Text?: string;
  FirstURL?: string;
  Topics?: InstantTopic[];
  Result?: string;
};

export function parseDuckDuckGoInstantResults(payload: unknown): WebSearchHit[] {
  if (!payload || typeof payload !== "object") return [];

  const data = payload as {
    Abstract?: string;
    AbstractURL?: string;
    AbstractText?: string;
    Heading?: string;
    Answer?: string;
    RelatedTopics?: InstantTopic[];
    Results?: InstantTopic[];
  };

  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();

  if (data.AbstractURL && (data.AbstractText || data.Abstract)) {
    pushHit(
      hits,
      seen,
      data.Heading || data.AbstractText || "摘要",
      data.AbstractURL,
      data.AbstractText || data.Abstract,
    );
  }

  if (data.Answer?.trim() && data.AbstractURL) {
    pushHit(hits, seen, data.Heading || "即时答案", data.AbstractURL, data.Answer);
  }

  const walk = (topics: InstantTopic[] | undefined) => {
    for (const topic of topics ?? []) {
      if (topic.FirstURL) {
        const title = topic.Text?.trim() || topic.Result?.replace(/<[^>]+>/g, "").trim() || topic.FirstURL;
        pushHit(hits, seen, title, topic.FirstURL, topic.Text);
      }
      if (topic.Topics?.length) walk(topic.Topics);
    }
  };
  walk(data.RelatedTopics);
  walk(data.Results);

  return hits;
}

export function parseWikipediaOpenSearchResults(payload: unknown): WebSearchHit[] {
  if (!Array.isArray(payload) || payload.length < 4) return [];

  const titles = payload[1];
  const descriptions = payload[2];
  const urls = payload[3];
  if (!Array.isArray(titles) || !Array.isArray(urls)) return [];

  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < titles.length; i++) {
    const title = typeof titles[i] === "string" ? titles[i] : "";
    const url = typeof urls[i] === "string" ? urls[i] : "";
    const snippet = Array.isArray(descriptions) && typeof descriptions[i] === "string" ? descriptions[i] : "";
    pushHit(hits, seen, title, url, snippet);
  }

  return hits;
}

function hasCjk(text: string) {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(text);
}

function looksLikeWeatherQuery(query: string) {
  return /天气|气温|温度|forecast|weather|下雨|降雨|降水/i.test(query);
}

function rankHits(query: string, hits: WebSearchHit[]): WebSearchHit[] {
  if (!looksLikeWeatherQuery(query)) return hits;

  const preferred = /weather\.com\.cn|nmc\.cn|tq121\.com\.cn|wttr\.in/i;
  return [...hits].sort((a, b) => {
    const aScore = preferred.test(a.url) ? 1 : 0;
    const bScore = preferred.test(b.url) ? 1 : 0;
    return bScore - aScore;
  });
}

async function searchBingRss(query: string): Promise<WebSearchHit[]> {
  const params = new URLSearchParams({
    format: "rss",
    q: query,
  });
  if (!hasCjk(query)) {
    params.set("ensearch", "1");
  }
  const url = `https://www.bing.com/search?${params.toString()}`;
  const response = await fetchWebResource({
    url,
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      "User-Agent": browserUserAgent,
    },
  });

  if (response.status < 200 || response.status >= 400) {
    throw new Error(`Bing RSS HTTP ${response.status}`);
  }

  const hits = parseBingRssResults(response.body);
  if (hits.length === 0 && response.body.includes("Object moved")) {
    throw new Error("Bing RSS 返回了重定向页而非结果");
  }
  return hits;
}

async function searchDuckDuckGoInstant(query: string): Promise<WebSearchHit[]> {
  const url = `https://api.duckduckgo.com/?${new URLSearchParams({
    q: query,
    format: "json",
    no_redirect: "1",
    no_html: "1",
    skip_disambig: "1",
  })}`;

  const response = await fetchWebResource({
    url,
    headers: { "User-Agent": browserUserAgent },
  });
  const payload = JSON.parse(response.body) as unknown;
  return parseDuckDuckGoInstantResults(payload);
}

async function searchWikipediaOpenSearch(query: string): Promise<WebSearchHit[]> {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: "opensearch",
    search: query,
    limit: "8",
    namespace: "0",
    format: "json",
  })}`;

  const response = await fetchWebResource({
    url,
    headers: { "User-Agent": browserUserAgent },
  });
  const payload = JSON.parse(response.body) as unknown;
  return parseWikipediaOpenSearchResults(payload);
}

type SearchAttempt = {
  provider: WebSearchProvider;
  run: () => Promise<WebSearchHit[]>;
};

async function resolveSearchHits(
  query: string,
  mode: WebFetchMode,
): Promise<{ hits: WebSearchHit[]; provider: WebSearchProvider; attempts: string[] }> {
  const attempts: string[] = [];
  const chain: SearchAttempt[] =
    mode === "tauri"
      ? [
          { provider: "bing-rss", run: () => searchBingRss(query) },
          { provider: "duckduckgo-instant", run: () => searchDuckDuckGoInstant(query) },
          { provider: "wikipedia-opensearch", run: () => searchWikipediaOpenSearch(query) },
        ]
      : [
          { provider: "duckduckgo-instant", run: () => searchDuckDuckGoInstant(query) },
          { provider: "bing-rss", run: () => searchBingRss(query) },
          { provider: "wikipedia-opensearch", run: () => searchWikipediaOpenSearch(query) },
        ];

  for (const attempt of chain) {
    try {
      const hits = rankHits(query, await attempt.run());
      attempts.push(`${attempt.provider}: ${hits.length} 条`);
      if (hits.length > 0) {
        return { hits, provider: attempt.provider, attempts };
      }
    } catch (error) {
      attempts.push(`${attempt.provider}: ${errorMessage(error)}`);
    }
  }

  throw new Error(
    attempts.length > 0
      ? `搜索无结果（${attempts.join("；")}）`
      : "搜索无结果",
  );
}

async function fetchHitContent(
  hit: WebSearchHit,
  contentMaxChars: number,
  mode: WebFetchMode,
): Promise<WebSearchResultItem> {
  const fallbackContent = hit.snippet || hit.title;

  if (mode === "browser") {
    return {
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
      content: fallbackContent,
    };
  }

  try {
    const page = await fetchWebResource({
      url: hit.url,
      headers: { "User-Agent": browserUserAgent },
    });
    const content = extractReadableTextFromHtml(page.body, page.finalUrl, contentMaxChars);
    return {
      title: hit.title,
      url: page.finalUrl,
      snippet: hit.snippet,
      content: content.trim() || fallbackContent,
    };
  } catch {
    return {
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
      content: fallbackContent,
    };
  }
}

export async function runWebSearch(
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("搜索关键词不能为空");
  }

  const maxResults = options.maxResults ?? defaultMaxResults;
  const contentMaxChars = options.contentMaxChars ?? defaultContentMaxChars;
  const fetchPageContent = options.fetchPageContent ?? true;
  const mode = await resolveWebFetchMode();

  const weatherResults = await runWeatherSearch(normalizedQuery);
  if (weatherResults && weatherResults.length > 0) {
    return {
      query: normalizedQuery,
      provider: "weather-direct",
      mode,
      results: weatherResults.slice(0, maxResults),
    };
  }

  const { hits, provider } = await resolveSearchHits(normalizedQuery, mode);
  const selected = hits.slice(0, maxResults);

  const settled = await Promise.allSettled(
    selected.map((hit) =>
      fetchPageContent
        ? fetchHitContent(hit, contentMaxChars, mode)
        : Promise.resolve({
            title: hit.title,
            url: hit.url,
            snippet: hit.snippet,
            content: hit.snippet || hit.title,
          }),
    ),
  );

  const results = settled
    .map((entry, index) => {
      if (entry.status === "fulfilled") return entry.value;
      const hit = selected[index];
      if (!hit) return null;
      return {
        title: hit.title,
        url: hit.url,
        snippet: hit.snippet,
        content: hit.snippet || hit.title,
      };
    })
    .filter((item): item is WebSearchResultItem => item !== null && item.content.trim().length > 0);

  if (results.length === 0) {
    throw new Error("搜索到了链接，但无法生成可读摘要");
  }

  return {
    query: normalizedQuery,
    provider,
    mode,
    results,
  };
}

const providerLabels: Record<WebSearchProvider, string> = {
  "weather-direct": "天气直连",
  "bing-rss": "Bing RSS",
  "duckduckgo-instant": "DuckDuckGo Instant",
  "wikipedia-opensearch": "Wikipedia",
};

export function formatWebSearchForAgent(response: WebSearchResponse): string {
  const header = [
    `搜索词: ${response.query}`,
    `来源: ${providerLabels[response.provider]}`,
    `环境: ${response.mode === "tauri" ? "桌面安全网关（可抓取正文）" : "浏览器（多为摘要）"}`,
    "请根据以下结果直接回答用户；若已有预报数据，整理成表格或列表，并标注来源，不要说「查不到」。",
    "",
  ].join("\n");

  const blocks = response.results.map((item, index) => {
    const lines = [`[${index + 1}] ${item.title}`, `URL: ${item.url}`];
    if (item.snippet) lines.push(`摘要: ${item.snippet}`);
    lines.push("", item.content);
    return lines.join("\n");
  });

  return `${header}${blocks.join("\n\n---\n\n")}\n\n若摘要仍不足以回答，请对最相关链接调用 fetch_url。`;
}
