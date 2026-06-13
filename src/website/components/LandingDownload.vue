<script setup lang="ts">
import { computed, ref } from "vue";
import { useLocale } from "../../composables/useLocale";
import { useLatestRelease } from "../composables/useLatestRelease";
import {
  DOWNLOAD_PLATFORMS,
  detectMacArch,
  detectPlatform,
  getDownloadUrl,
  recommendedVariantId,
  type DownloadVariantId,
  type Platform,
} from "../content/downloads";
import { GITHUB_RELEASES_URL } from "../content/repo";

const { t } = useLocale();
const { version: releaseVersion } = useLatestRelease();

const selectedPlatform = ref<Platform>(detectPlatform());

const activePlatform = computed(
  () => DOWNLOAD_PLATFORMS.find((item) => item.platform === selectedPlatform.value)!,
);

const recommendedId = computed(() => recommendedVariantId());

function isRecommended(variantId: DownloadVariantId): boolean {
  return recommendedId.value === variantId;
}

function variantHref(variantId: DownloadVariantId, available: boolean): string | undefined {
  if (!available) return undefined;
  return getDownloadUrl("global", variantId);
}

const detectedHint = computed(() => {
  if (selectedPlatform.value !== "macos") return null;
  return detectMacArch() === "arm64"
    ? t("landing.download.detectedArm")
    : t("landing.download.detectedIntel");
});
</script>

<template>
  <section
    id="download"
    class="landing-cta landing-download"
    :aria-label="t('landing.download.ariaLabel')"
  >
    <h2>{{ t("landing.cta.title") }}</h2>
    <p class="landing-cta-lead">{{ t("landing.cta.body") }}</p>

    <div
      class="landing-download-platforms"
      role="tablist"
      :aria-label="t('landing.download.platforms')"
    >
      <button
        v-for="group in DOWNLOAD_PLATFORMS"
        :id="`download-tab-${group.platform}`"
        :key="group.platform"
        type="button"
        role="tab"
        class="landing-download-platform-btn"
        :class="{ active: selectedPlatform === group.platform }"
        :aria-selected="selectedPlatform === group.platform"
        :aria-controls="`download-panel-${group.platform}`"
        @click="selectedPlatform = group.platform"
      >
        {{ t(`landing.download.platform.${group.platform}`) }}
        <span v-if="!group.available" class="landing-download-soon">
          · {{ t("landing.download.comingSoon") }}
        </span>
      </button>
    </div>

    <div
      :id="`download-panel-${activePlatform.platform}`"
      class="landing-download-actions"
      role="tabpanel"
      :aria-labelledby="`download-tab-${activePlatform.platform}`"
    >
      <template v-for="variant in activePlatform.variants" :key="variant.id">
        <a
          v-if="variant.available"
          class="landing-btn"
          :class="isRecommended(variant.id) ? 'landing-btn-primary' : 'landing-btn-outline'"
          :href="variantHref(variant.id, variant.available)"
          rel="noopener noreferrer"
        >
          {{ t(`landing.download.variant.${variant.id}.title`) }}
        </a>
        <button
          v-else
          type="button"
          class="landing-btn landing-btn-outline"
          disabled
        >
          {{ t(`landing.download.variant.${variant.id}.title`) }}
          · {{ t("landing.download.comingSoon") }}
        </button>
      </template>
    </div>

    <p v-if="detectedHint" class="landing-download-hint">{{ detectedHint }}</p>

    <p class="landing-download-meta">
      <span v-if="releaseVersion">v{{ releaseVersion }}</span>
      <span v-if="releaseVersion" aria-hidden="true">·</span>
      <a :href="GITHUB_RELEASES_URL" target="_blank" rel="noopener noreferrer">
        {{ t("landing.download.allReleases") }}
      </a>
    </p>
  </section>
</template>
