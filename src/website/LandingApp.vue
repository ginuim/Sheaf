<script setup lang="ts">
import { Moon, Sun } from "@lucide/vue";
import { computed, onUnmounted, ref, watch } from "vue";
import { useLocale } from "../composables/useLocale";
import type { AppLocale } from "../i18n";
import LandingChangelog from "./components/LandingChangelog.vue";
import LandingDocs from "./components/LandingDocs.vue";
import LandingLegal from "./components/LandingLegal.vue";
import LandingOverlay from "./components/LandingOverlay.vue";
import SheafProductDemo from "./components/SheafProductDemo.vue";
import type { DemoScenarioId } from "./components/SheafProductDemo.vue";
import { GITHUB_REPO_URL } from "./content/repo";
import { useDownloadLink } from "./composables/useDownloadLink";
import { useLandingContent } from "./composables/useLandingContent";
import { useLandingMotion } from "./composables/useLandingMotion";

type LandingOverlayPanel = "docs" | "changelog" | "privacy" | "terms";

const landingRoot = ref<HTMLElement | null>(null);
useLandingMotion(landingRoot);

const { locale, setLocale, t, tm } = useLocale();
const { docSections, changelog, privacyPolicy, termsOfService } = useLandingContent();

const { downloadHref } = useDownloadLink();
const demoRef = ref<InstanceType<typeof SheafProductDemo> | null>(null);
const isDark = ref(false);
const activeOverlay = ref<LandingOverlayPanel | null>(null);

function openOverlay(panel: LandingOverlayPanel) {
  activeOverlay.value = panel;
}

function closeOverlay() {
  activeOverlay.value = null;
}

function applyLandingTheme(dark: boolean) {
  if (dark) {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

watch(isDark, applyLandingTheme, { immediate: true });

onUnmounted(() => {
  delete document.documentElement.dataset.theme;
});

function toggleLandingTheme() {
  isDark.value = !isDark.value;
}

function toggleDemoTheme() {
  demoRef.value?.runThemeToggle();
}

function toggleLocale() {
  const next: AppLocale = locale.value === "zh-CN" ? "en" : "zh-CN";
  setLocale(next);
}

const localeToggleLabel = computed(() =>
  locale.value === "zh-CN" ? "English" : "中文",
);

const themeToggleLabel = computed(() =>
  isDark.value ? t("landing.nav.themeLight") : t("landing.nav.themeDark"),
);

const demoScenarios = computed(() => {
  const labels = tm("landing.demo.scenarios") as Record<DemoScenarioId, string>;
  return (["outline", "preview", "ai", "export"] as DemoScenarioId[]).map((id) => ({
    id,
    label: labels[id],
  }));
});

function runDemoScenario(id: DemoScenarioId) {
  demoRef.value?.runScenario(id);
}

const logoItems = computed(() => tm("landing.logos.items") as string[]);

const features = computed(() => [
  {
    key: "split",
    title: t("landing.features.split.title"),
    body: t("landing.features.split.body"),
    link: "#demo",
    linkLabel: t("landing.features.split.linkLabel"),
  },
  {
    key: "ai",
    title: t("landing.features.ai.title"),
    body: t("landing.features.ai.body"),
    link: "#demo",
    linkLabel: t("landing.features.ai.linkLabel"),
  },
  {
    key: "local",
    title: t("landing.features.local.title"),
    body: t("landing.features.local.body"),
    link: "#download",
    linkLabel: t("landing.features.local.linkLabel"),
  },
]);
</script>

<template>
  <div
    ref="landingRoot"
    class="landing"
    :data-theme="isDark ? 'dark' : undefined"
  >
    <header class="landing-nav">
      <a class="landing-brand" href="/">
        <span class="landing-brand-mark">S</span>
        <span>Sheaf</span>
      </a>
      <nav class="landing-nav-links" :aria-label="t('landing.nav.main')">
        <a href="#features">{{ t("landing.nav.features") }}</a>
        <a href="#demo">{{ t("landing.nav.demo") }}</a>
        <a href="#download">{{ t("landing.nav.download") }}</a>
      </nav>
      <div class="landing-nav-actions">
        <button
          type="button"
          class="landing-nav-icon-btn landing-nav-locale-btn"
          :aria-label="t('landing.nav.switchLocale')"
          @click="toggleLocale"
        >
          {{ localeToggleLabel }}
        </button>
        <button
          type="button"
          class="landing-nav-icon-btn"
          :aria-label="themeToggleLabel"
          :aria-pressed="isDark"
          @click="toggleLandingTheme"
        >
          <Sun v-if="isDark" :size="18" aria-hidden="true" />
          <Moon v-else :size="18" aria-hidden="true" />
        </button>
        <a class="landing-btn landing-btn-ghost" href="#features">{{ t("landing.nav.learnMore") }}</a>
        <a
          class="landing-btn landing-btn-primary"
          :href="downloadHref"
          rel="noopener noreferrer"
        >{{ t("landing.nav.download") }}</a>
      </div>
    </header>

    <section class="landing-hero">
      <span class="landing-eyebrow">{{ t("landing.hero.eyebrow") }}</span>
      <h1>{{ t("landing.hero.title") }}</h1>
      <p class="landing-hero-lead">
        {{ t("landing.hero.lead") }}
      </p>
      <div class="landing-hero-cta">
        <a
          class="landing-btn landing-btn-primary"
          :href="downloadHref"
          rel="noopener noreferrer"
        >
          {{ t("landing.hero.download") }}
        </a>
        <a class="landing-btn landing-btn-outline" href="#demo">{{ t("landing.hero.watchDemo") }}</a>
      </div>
    </section>

    <section id="demo" class="landing-demo-wrap" :aria-label="t('landing.demo.ariaLabel')">
      <SheafProductDemo ref="demoRef" v-model:dark="isDark" />
      <div class="landing-demo-controls" role="group" :aria-label="t('landing.demo.controls')">
        <button
          v-for="item in demoScenarios"
          :key="item.id"
          type="button"
          class="landing-demo-scenario-btn"
          @click="runDemoScenario(item.id)"
        >
          {{ item.label }}
        </button>
        <button
          type="button"
          class="landing-demo-scenario-btn landing-demo-theme-btn"
          :class="{ active: isDark }"
          :aria-pressed="isDark"
          @click="toggleDemoTheme"
        >
          {{ isDark ? t("landing.demo.themeLight") : t("landing.demo.themeDark") }}
        </button>
      </div>
    </section>

    <section class="landing-logos" aria-hidden="true">
      <p>{{ t("landing.logos.title") }}</p>
      <div class="landing-logo-row">
        <span v-for="item in logoItems" :key="item">{{ item }}</span>
      </div>
    </section>

    <section id="features" class="landing-features">
      <h2 class="landing-section-title">{{ t("landing.features.title") }}</h2>
      <div class="landing-feature-grid">
        <article
          v-for="item in features"
          :key="item.key"
          class="landing-feature-card"
        >
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
          <a :href="item.link">{{ item.linkLabel }}</a>
        </article>
      </div>
    </section>

    <section class="landing-quote">
      <blockquote>{{ t("landing.quote.text") }}</blockquote>
      <cite>{{ t("landing.quote.cite") }}</cite>
    </section>

    <LandingOverlay
      :open="activeOverlay === 'docs'"
      :title="t('landing.overlay.docs.title')"
      title-id="landing-docs-title"
      :lead="t('landing.overlay.docs.lead')"
      @close="closeOverlay"
    >
      <LandingDocs :sections="docSections" :nav-label="t('landing.overlay.docs.nav')" />
    </LandingOverlay>

    <LandingOverlay
      :open="activeOverlay === 'changelog'"
      :title="t('landing.overlay.changelog.title')"
      title-id="landing-changelog-title"
      :lead="t('landing.overlay.changelog.lead')"
      @close="closeOverlay"
    >
      <LandingChangelog :entries="changelog" />
    </LandingOverlay>

    <LandingOverlay
      :open="activeOverlay === 'privacy'"
      :title="t('landing.overlay.privacy.title')"
      title-id="landing-privacy-title"
      :lead="t('landing.overlay.privacy.lead')"
      @close="closeOverlay"
    >
      <LandingLegal :sections="privacyPolicy" />
    </LandingOverlay>

    <LandingOverlay
      :open="activeOverlay === 'terms'"
      :title="t('landing.overlay.terms.title')"
      title-id="landing-terms-title"
      :lead="t('landing.overlay.terms.lead')"
      @close="closeOverlay"
    >
      <LandingLegal :sections="termsOfService" />
    </LandingOverlay>

    <section id="download" class="landing-cta">
      <h2>{{ t("landing.cta.title") }}</h2>
      <p>{{ t("landing.cta.body") }}</p>
      <a
        class="landing-btn landing-btn-primary"
        :href="downloadHref"
        rel="noopener noreferrer"
      >{{ t("landing.cta.download") }}</a>
    </section>

    <footer class="landing-footer">
      <div class="landing-footer-grid">
        <div>
          <h4>{{ t("landing.footer.product") }}</h4>
          <ul>
            <li><a href="#features">{{ t("landing.nav.features") }}</a></li>
            <li><a href="#demo">{{ t("landing.nav.demo") }}</a></li>
            <li><a href="#download">{{ t("landing.nav.download") }}</a></li>
          </ul>
        </div>
        <div>
          <h4>{{ t("landing.footer.resources") }}</h4>
          <ul>
            <li>
              <button type="button" class="landing-footer-link" @click="openOverlay('changelog')">
                {{ t("landing.footer.changelog") }}
              </button>
            </li>
            <li>
              <button type="button" class="landing-footer-link" @click="openOverlay('docs')">
                {{ t("landing.footer.docs") }}
              </button>
            </li>
            <li>
              <a :href="GITHUB_REPO_URL" target="_blank" rel="noopener noreferrer">
                {{ t("landing.footer.github") }}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4>{{ t("landing.footer.legal") }}</h4>
          <ul>
            <li>
              <button type="button" class="landing-footer-link" @click="openOverlay('privacy')">
                {{ t("landing.footer.privacy") }}
              </button>
            </li>
            <li>
              <button type="button" class="landing-footer-link" @click="openOverlay('terms')">
                {{ t("landing.footer.terms") }}
              </button>
            </li>
          </ul>
        </div>
        <div>
          <h4>{{ t("landing.footer.contact") }}</h4>
          <ul>
            <li><a href="mailto:webmaster@reaidea.com">webmaster@reaidea.com</a></li>
          </ul>
        </div>
      </div>
      <div class="landing-footer-bottom">
        <p class="landing-copyright">
          © {{ new Date().getFullYear() }}
          <a
            class="landing-studio-link"
            href="https://reaidea.com"
            target="_blank"
            rel="noopener noreferrer"
          >reaidea</a> {{ t("landing.footer.copyright") }}
        </p>
        <p class="landing-footer-meta">{{ t("landing.footer.meta") }}</p>
      </div>
    </footer>
  </div>
</template>
