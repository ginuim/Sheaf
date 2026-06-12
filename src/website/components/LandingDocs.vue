<script setup lang="ts">
import type { DocSection } from "../content/docs";

defineProps<{
  sections: DocSection[];
  navLabel: string;
}>();
</script>

<template>
  <div class="docs-layout">
    <nav class="docs-nav" :aria-label="navLabel">
      <a v-for="section in sections" :key="section.id" :href="`#docs-${section.id}`">
        {{ section.title }}
      </a>
    </nav>
    <div class="docs-content">
      <article
        v-for="section in sections"
        :id="`docs-${section.id}`"
        :key="section.id"
        class="docs-article"
      >
        <h3>{{ section.title }}</h3>
        <p v-for="(para, i) in section.paragraphs" :key="i">{{ para }}</p>
        <ul v-if="section.list">
          <li v-for="item in section.list" :key="item">{{ item }}</li>
        </ul>
        <table v-if="section.table" class="docs-shortcuts">
          <tbody>
            <tr v-for="row in section.table" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td><kbd>{{ row.keys }}</kbd></td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  </div>
</template>
