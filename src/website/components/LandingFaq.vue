<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
import { ref } from "vue";
import type { FaqItem } from "../content/faq";

const props = defineProps<{
  items: FaqItem[];
  title: string;
  lead: string;
}>();

const openId = ref<string | null>(props.items[0]?.id ?? null);

function toggle(id: string) {
  openId.value = openId.value === id ? null : id;
}
</script>

<template>
  <section id="faq" class="landing-faq" :aria-label="title">
    <h2 class="landing-section-title">{{ title }}</h2>
    <p class="landing-faq-lead">{{ lead }}</p>
    <div class="landing-faq-list">
      <article
        v-for="item in items"
        :key="item.id"
        class="landing-faq-item"
        :class="{ open: openId === item.id }"
      >
        <h3>
          <button
            type="button"
            class="landing-faq-trigger"
            :aria-expanded="openId === item.id"
            :aria-controls="`faq-panel-${item.id}`"
            @click="toggle(item.id)"
          >
            <span>{{ item.question }}</span>
            <ChevronDown :size="18" aria-hidden="true" class="landing-faq-chevron" />
          </button>
        </h3>
        <div
          :id="`faq-panel-${item.id}`"
          class="landing-faq-panel"
          :hidden="openId !== item.id"
        >
          <p>{{ item.answer }}</p>
        </div>
      </article>
    </div>
  </section>
</template>
