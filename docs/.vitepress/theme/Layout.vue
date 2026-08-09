<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import Home from './Home.vue'

const { frontmatter } = useData()
</script>

<template>
  <Home v-if="frontmatter.layout === 'home'" />
  <component :is="DefaultTheme.Layout" v-else />
</template>
