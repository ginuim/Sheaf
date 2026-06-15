import { onMounted, ref } from "vue";
import { GITHUB_LATEST_RELEASE_API } from "../content/repo";

const CACHE_KEY = "sheaf_latest_release";

function parseReleaseVersion(tagName: string): string | null {
  const match = /^v?(\d+\.\d+\.\d+)$/.exec(tagName.trim());
  return match?.[1] ?? null;
}

export function useLatestRelease() {
  const version = ref<string | null>(null);

  onMounted(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        version.value = cached;
        return;
      }
    } catch {
      // sessionStorage unavailable
    }

    void (async () => {
      try {
        const res = await fetch(GITHUB_LATEST_RELEASE_API, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { tag_name?: string };
        const next = data.tag_name ? parseReleaseVersion(data.tag_name) : null;
        if (!next) return;
        version.value = next;
        try {
          sessionStorage.setItem(CACHE_KEY, next);
        } catch {
          // ignore
        }
      } catch {
        // network or parse failure — version label stays hidden
      }
    })();
  });

  return { version };
}
