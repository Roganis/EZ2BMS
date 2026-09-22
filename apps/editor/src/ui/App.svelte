<script lang="ts">
  import { CHART_CORE_VERSION } from '@ez2bms/chart-core';
</script>

<main class="boot">
  <h1><span class="ez">EZ2</span>BMS</h1>
  <p>chart suite for EZ2PORT · core {CHART_CORE_VERSION}</p>
</main>

<style>
  .boot {
    height: 100%;
    display: grid;
    place-content: center;
    text-align: center;
    background: radial-gradient(ellipse at center, var(--bg-2), var(--bg-0) 70%);
  }
  h1 {
    margin: 0;
    font-size: 64px;
    letter-spacing: 0.08em;
    text-shadow: var(--glow);
  }
  .ez {
    color: var(--neon);
  }
  p {
    color: var(--ink-dim);
    font-family: var(--font-num);
  }
</style>
