import { nextTick, onMounted, onUnmounted, type Ref } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollReveal(
  targets: string,
  trigger: string,
  vars: gsap.TweenVars,
  reduceMotion: boolean,
) {
  if (reduceMotion) return;

  return gsap.from(targets, {
    autoAlpha: 0,
    y: 28,
    duration: 0.75,
    ease: "power2.out",
    scrollTrigger: {
      trigger,
      start: "top 82%",
      once: true,
    },
    ...vars,
  });
}

export function useLandingMotion(root: Ref<HTMLElement | null>) {
  let ctx: gsap.Context | undefined;

  onMounted(async () => {
    await nextTick();

    const el = root.value;
    if (!el) return;

    const reduceMotion = prefersReducedMotion();
    const duration = reduceMotion ? 0 : 0.65;
    const stagger = reduceMotion ? 0 : 0.1;

    ctx = gsap.context(() => {
      const heroTl = gsap.timeline({
        defaults: { ease: "power2.out", duration },
      });

      heroTl
        .from(".landing-nav", { autoAlpha: 0, y: -14 })
        .from(".landing-eyebrow", { autoAlpha: 0, y: 18 }, "-=0.35")
        .from(".landing-hero h1", { autoAlpha: 0, y: 28 }, "-=0.45")
        .from(".landing-hero-lead", { autoAlpha: 0, y: 22 }, "-=0.5")
        .from(
          ".landing-hero-cta .landing-btn",
          { autoAlpha: 0, y: 16, stagger },
          "-=0.45",
        );

      if (reduceMotion) return;

      scrollReveal(".sheaf-demo", ".landing-demo-wrap", {
        y: 36,
        duration: 0.85,
      }, reduceMotion);

      scrollReveal(".landing-demo-controls", ".landing-demo-wrap", {
        y: 20,
        duration: 0.6,
        delay: 0.12,
      }, reduceMotion);

      const logosTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".landing-logos",
          start: "top 85%",
          once: true,
        },
        defaults: { ease: "power2.out", duration: 0.55 },
      });
      logosTl
        .from(".landing-logos > p", { autoAlpha: 0, y: 16 })
        .from(
          ".landing-logo-row span",
          { autoAlpha: 0, y: 12, stagger: 0.07 },
          "-=0.3",
        );

      const featuresTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".landing-features",
          start: "top 82%",
          once: true,
        },
        defaults: { ease: "power2.out", duration: 0.65 },
      });
      featuresTl
        .from(".landing-section-title", { autoAlpha: 0, y: 22 })
        .from(
          ".landing-feature-card",
          { autoAlpha: 0, y: 32, stagger: 0.12 },
          "-=0.35",
        );

      scrollReveal(".landing-quote blockquote", ".landing-quote", {
        y: 24,
        duration: 0.7,
      }, reduceMotion);
      scrollReveal(".landing-quote cite", ".landing-quote", {
        y: 14,
        duration: 0.5,
        delay: 0.15,
      }, reduceMotion);

      const faqTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".landing-faq",
          start: "top 82%",
          once: true,
        },
        defaults: { ease: "power2.out", duration: 0.65 },
      });
      faqTl
        .from(".landing-faq .landing-section-title", { autoAlpha: 0, y: 22 })
        .from(".landing-faq-lead", { autoAlpha: 0, y: 16 }, "-=0.4")
        .from(
          ".landing-faq-item",
          { autoAlpha: 0, y: 20, stagger: 0.08 },
          "-=0.35",
        );

      const ctaTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".landing-cta",
          start: "top 85%",
          once: true,
        },
        defaults: { ease: "power2.out", duration: 0.6 },
      });
      ctaTl
        .from(".landing-cta h2", { autoAlpha: 0, y: 20 })
        .from(".landing-cta-lead", { autoAlpha: 0, y: 16 }, "-=0.4")
        .from(
          ".landing-cta .landing-download-platforms, .landing-cta .landing-download-actions",
          { autoAlpha: 0, y: 14 },
          "-=0.35",
        )
        .from(".landing-cta .landing-download-meta", { autoAlpha: 0, y: 10 }, "-=0.3");

      gsap.from(".landing-footer", {
        autoAlpha: 0,
        y: 20,
        duration: 0.55,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".landing-footer",
          start: "top 92%",
          once: true,
        },
      });
    }, el);

    ScrollTrigger.refresh();
  });

  onUnmounted(() => {
    ctx?.revert();
  });
}
