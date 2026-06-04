import { extractReadableTextFromHtml } from "./extract-web";
import { fetchWebResource } from "./web-transport";

export type WeatherSearchItem = {
  title: string;
  url: string;
  snippet?: string;
  content: string;
};

const cityWeatherCodes: Record<string, string> = {
  北京: "101010100",
  上海: "101020100",
  天津: "101030100",
  重庆: "101040100",
  广州: "101280101",
  深圳: "101280601",
  杭州: "101210101",
  南京: "101190101",
  武汉: "101200101",
  成都: "101270101",
  西安: "101110101",
  南宁: "101300101",
  桂林: "101300501",
  柳州: "101300301",
};

export function looksLikeWeatherQuery(query: string): boolean {
  return /天气|气温|温度|forecast|weather|下雨|降雨|降水|冷不冷|热不热/i.test(query);
}

export function extractWeatherLocation(query: string): string | null {
  const normalized = query.trim();
  const patterns = [
    /(?:查|搜|看|获取)?(?:一下|下)?([\u4e00-\u9fa5]{2,8}(?:市|区|县)?)(?:最近|近期)?(?:的)?天气/u,
    /([\u4e00-\u9fa5]{2,8}(?:市|区|县)?)天气/u,
    /天气(?:怎么样|如何).*?([\u4e00-\u9fa5]{2,8}(?:市|区|县)?)/u,
    /([\u4e00-\u9fa5]{2,8}(?:市|区|县)?)(?:最近|近期)?(?:的)?(?:天气|气温)/u,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    return raw.replace(/(的)$/u, "").replace(/(市|区|县)$/u, "") || raw;
  }

  return null;
}

function stripAnsi(text: string) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

async function fetchWttrForecast(location: string): Promise<WeatherSearchItem | null> {
  const encoded = encodeURIComponent(location);
  const response = await fetchWebResource({
    url: `https://wttr.in/${encoded}?format=v2&lang=zh`,
    headers: {
      Accept: "text/plain",
      "User-Agent": "curl/8.0",
    },
  });

  const content = stripAnsi(response.body).trim();
  if (!content || content.length < 20) return null;

  return {
    title: `${location} 天气预报`,
    url: `https://wttr.in/${encoded}`,
    snippet: "wttr.in",
    content,
  };
}

async function fetchWeatherComCn(city: string): Promise<WeatherSearchItem | null> {
  const code = cityWeatherCodes[city];
  if (!code) return null;

  const url = `https://www.weather.com.cn/weather/${code}.shtml`;
  const response = await fetchWebResource({ url });
  const content = extractReadableTextFromHtml(response.body, url, 6_000);
  if (!content || content.length < 80) return null;

  return {
    title: `${city}天气预报 - 中国天气网`,
    url,
    snippet: "中国天气网",
    content,
  };
}

export async function runWeatherSearch(query: string): Promise<WeatherSearchItem[] | null> {
  if (!looksLikeWeatherQuery(query)) return null;

  const location = extractWeatherLocation(query) ?? query.replace(/天气.*/u, "").trim();
  if (!location) return null;

  const results: WeatherSearchItem[] = [];
  const attempts = await Promise.allSettled([
    fetchWeatherComCn(location),
    fetchWttrForecast(location),
  ]);

  for (const attempt of attempts) {
    if (attempt.status === "fulfilled" && attempt.value) {
      results.push(attempt.value);
    }
  }

  return results.length > 0 ? results : null;
}
