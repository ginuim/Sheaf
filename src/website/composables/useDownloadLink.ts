import { computed } from "vue";
import { detectMacArch, getDownloadUrl } from "../content/downloads";

// TODO: CDN 上线后启用地区分流
// 逻辑：loc=CN → CDN（国内无翻墙用户）；loc≠CN → GitHub（海外用户 + 翻墙用户 VPN 出口在海外，自然走 GitHub）
//
// const CHINA_CODE = "CN";
// const GEO_CACHE_KEY = "sheaf_geo_country";
// const GEO_TRACE_URL = "https://cloudflare.com/cdn-cgi/trace";
//
// async function resolveCountryCode(): Promise<string | null> {
//   try {
//     const cached = sessionStorage.getItem(GEO_CACHE_KEY);
//     if (cached) return cached;
//   } catch {
//     // sessionStorage unavailable
//   }
//
//   try {
//     const res = await fetch(GEO_TRACE_URL, { signal: AbortSignal.timeout(4000) });
//     if (!res.ok) return null;
//     const match = (await res.text()).match(/^loc=([A-Z]{2})$/m);
//     const code = match?.[1] ?? null;
//     if (code) {
//       try {
//         sessionStorage.setItem(GEO_CACHE_KEY, code);
//       } catch {
//         // ignore
//       }
//     }
//     return code;
//   } catch {
//     return null;
//   }
// }

export function useDownloadLink() {
  const downloadHref = computed(() => getDownloadUrl("global", detectMacArch()));

  // TODO: CDN 上线后替换为下方逻辑
  //
  // const countryCode = ref<string | null>(null);
  //
  // onMounted(() => {
  //   void resolveCountryCode().then((code) => {
  //     countryCode.value = code;
  //   });
  // });
  //
  // const downloadHref = computed(() => {
  //   if (countryCode.value === null) return "#download";
  //   const arch = detectMacArch();
  //   const useOss = countryCode.value === CHINA_CODE;
  //   return getDownloadUrl(useOss ? "cn" : "global", arch);
  // });

  return { downloadHref };
}
