<script setup lang="ts">
import { CHANGELOG } from "../content/changelog";
</script>

<template>
  <ol class="changelog-list">
    <li v-for="entry in CHANGELOG" :key="entry.version" class="changelog-entry">
      <header class="changelog-entry-header">
        <span class="changelog-version">v{{ entry.version }}</span>
        <time class="changelog-date" :datetime="entry.date">{{ entry.date }}</time>
      </header>
      <h3 class="changelog-entry-title">{{ entry.title }}</h3>
      <ul class="changelog-items">
        <li v-for="item in entry.items" :key="item">{{ item }}</li>
      </ul>
    </li>
  </ol>
</template>
