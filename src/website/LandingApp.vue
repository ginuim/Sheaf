<script setup lang="ts">
import { computed, ref } from "vue";
import SheafProductDemo from "./components/SheafProductDemo.vue";
import type { DemoScenarioId } from "./components/SheafProductDemo.vue";

const downloadHref = "#download";
const demoRef = ref<InstanceType<typeof SheafProductDemo> | null>(null);

const demoScenarios: { id: DemoScenarioId; label: string }[] = [
  { id: "outline", label: "大纲导航" },
  { id: "preview", label: "预览模式" },
  { id: "ai", label: "AI 改写" },
  { id: "export", label: "导出到社交媒体" },
];

function runDemoScenario(id: DemoScenarioId) {
  demoRef.value?.runScenario(id);
}

const demoIsDark = computed(() => demoRef.value?.isDark ?? false);

function toggleDemoTheme() {
  demoRef.value?.toggleTheme();
}
const features = [
  {
    title: "分屏实时预览",
    body: "编辑与预览同步滚动。衬线预览、等宽编辑，长文写作不累眼。",
    link: "#demo",
    linkLabel: "体验界面 →",
  },
  {
    title: "AI 段落改写",
    body: "用自然语言描述修改意图，审阅 diff 后一键应用，不打断写作心流。",
    link: "#demo",
    linkLabel: "查看 AI 面板 →",
  },
  {
    title: "本地优先",
    body: "文件保存在你的磁盘。大纲导航、PDF 导出、暗色模式，专为专注写作设计。",
    link: "#download",
    linkLabel: "下载 macOS 版 →",
  },
];
</script>

<template>
  <div class="landing">
    <header class="landing-nav">
      <a class="landing-brand" href="/website/">
        <span class="landing-brand-mark">S</span>
        <span>Sheaf</span>
      </a>
      <nav class="landing-nav-links" aria-label="主导航">
        <a href="#features">功能</a>
        <a href="#demo">演示</a>
        <a href="#download">下载</a>
      </nav>
      <div class="landing-nav-actions">
        <a class="landing-btn landing-btn-ghost" href="#features">了解更多</a>
        <a class="landing-btn landing-btn-primary" :href="downloadHref">下载</a>
      </div>
    </header>

    <section class="landing-hero">
      <span class="landing-eyebrow">Markdown · 本地 · 排版</span>
      <h1>为专注写作而生的 Markdown 编辑器</h1>
      <p class="landing-hero-lead">
        Sheaf 把编辑、预览与 AI 改写放在同一界面。留白、衬线与分屏，让长文写作像阅读纸书一样舒服。
      </p>
      <div class="landing-hero-cta">
        <a class="landing-btn landing-btn-primary" :href="downloadHref">
          下载 macOS 版
        </a>
        <a class="landing-btn landing-btn-outline" href="#demo">查看产品演示</a>
      </div>
    </section>

    <section id="demo" class="landing-demo-wrap" aria-label="产品演示">
      <SheafProductDemo ref="demoRef" />
      <div class="landing-demo-controls" role="group" aria-label="演示控制">
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
          :class="{ active: demoIsDark }"
          :aria-pressed="demoIsDark"
          @click="toggleDemoTheme"
        >
          {{ demoIsDark ? "浅色模式" : "暗黑模式" }}
        </button>
      </div>
    </section>

    <section class="landing-logos" aria-hidden="true">
      <p>为需要长时间写作的人设计</p>
      <div class="landing-logo-row">
        <span>技术文档</span>
        <span>论文草稿</span>
        <span>产品说明</span>
        <span>读书笔记</span>
        <span>博客长文</span>
      </div>
    </section>

    <section id="features" class="landing-features">
      <h2 class="landing-section-title">写作所需，尽在一处</h2>
      <div class="landing-feature-grid">
        <article
          v-for="item in features"
          :key="item.title"
          class="landing-feature-card"
        >
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
          <a :href="item.link">{{ item.linkLabel }}</a>
        </article>
      </div>
    </section>

    <section class="landing-quote">
      <blockquote>
        「好的排版让文字呼吸。留白不是浪费，是给思考的空间。」
      </blockquote>
      <cite>— Sheaf 设计理念</cite>
    </section>

    <section id="download" class="landing-cta">
      <h2>现在开始写作</h2>
      <p>macOS 原生应用，打开即写。你的文稿留在本地。</p>
      <a class="landing-btn landing-btn-primary" href="#">下载 for macOS</a>
    </section>

    <footer class="landing-footer">
      <div class="landing-footer-grid">
        <div>
          <h4>产品</h4>
          <ul>
            <li><a href="#features">功能</a></li>
            <li><a href="#demo">演示</a></li>
            <li><a href="#download">下载</a></li>
          </ul>
        </div>
        <div>
          <h4>资源</h4>
          <ul>
            <li><a href="#">更新日志</a></li>
            <li><a href="#">使用文档</a></li>
          </ul>
        </div>
        <div>
          <h4>法律</h4>
          <ul>
            <li><a href="#">隐私政策</a></li>
            <li><a href="#">服务条款</a></li>
          </ul>
        </div>
        <div>
          <h4>联系</h4>
          <ul>
            <li><a href="mailto:hello@example.com">hello@example.com</a></li>
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
          >Reaidea Studio</a> 版权所有。
        </p>
        <p class="landing-footer-meta">Sheaf · 本地 Markdown 编辑器</p>
      </div>
    </footer>
  </div>
</template>
