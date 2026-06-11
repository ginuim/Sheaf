<script setup lang="ts">
import type { LegalSection } from "../content/legal";

defineProps<{
  sections: LegalSection[];
}>();
</script>

<template>
  <div class="legal-content">
    <section v-for="(section, index) in sections" :key="index" class="legal-section">
      <h3>{{ section.title }}</h3>
      <p v-for="(para, i) in section.paragraphs" :key="i">{{ para }}</p>
      <ul v-if="section.list">
        <li v-for="item in section.list" :key="item">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>
