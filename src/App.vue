<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header class="season-nav">
    <RouterLink to="/">2026</RouterLink>
    <RouterLink to="/2025">2025</RouterLink>
  </header>
  <RouterView />
</template>

<style>
* { box-sizing: border-box; }
html, body, #app { min-height: 100%; }
body { margin: 0; font-family: Inter, Roboto, "Helvetica Neue", Arial, sans-serif; color: #202124; }
button, input, select { font: inherit; }
button { cursor: pointer; }
.season-nav { position: fixed; z-index: 20; top: 10px; right: 16px; display: flex; gap: 5px; padding: 4px; border-radius: 9px; background: rgb(255 255 255 / 88%); box-shadow: 0 2px 10px rgb(0 0 0 / 18%); }
.season-nav a { padding: 5px 10px; border-radius: 6px; color: #333; text-decoration: none; font-weight: 700; }
.season-nav a.router-link-active { color: white; background: #111; }
</style>
