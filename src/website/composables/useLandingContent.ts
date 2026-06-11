import { computed } from "vue";
import { useLocale } from "../../composables/useLocale";
import { getChangelog } from "../content/changelog";
import { getDocSections } from "../content/docs";
import { getPrivacyPolicy, getTermsOfService } from "../content/legal";

export function useLandingContent() {
  const { locale } = useLocale();

  const docSections = computed(() => getDocSections(locale.value));
  const changelog = computed(() => getChangelog(locale.value));
  const privacyPolicy = computed(() => getPrivacyPolicy(locale.value));
  const termsOfService = computed(() => getTermsOfService(locale.value));

  return { docSections, changelog, privacyPolicy, termsOfService };
}
