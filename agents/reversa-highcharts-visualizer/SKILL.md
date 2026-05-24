---
name: reversa-highcharts-visualizer
license: MIT
compatibility: Claude Code, Codex, Cursor, Gemini CLI, and other Agent Skills-compatible agents.
metadata:
  author: pnocera
  version: "1.0.0"
  framework: reversa
  team: shared-skills
  role: charts-renderer
description: >
  Creates interactive and professional data visualizations using Highcharts.js, generating
  standalone HTML with animated, responsive, and accessible charts. Use this skill whenever
  the user asks to create charts, dashboards, data visualizations, or any visual representation
  of numerical/categorical data. Should be used when the user mentions terms such as "chart",
  "dashboard", "highcharts", "data visualization", "line chart", "bars", "pie", "scatter",
  "heatmap", "treemap", "gauge", "stock chart", "map", "gantt", "sankey", "funnel",
  or when providing data (CSV, JSON, table, spreadsheet) and requesting visual representation.
  Also should be activated when the user asks for beautiful, interactive, animated charts
  with tooltips, drill-down, or exportable. Works with inline data, CSV, JSON, and data files.
  Always generates a complete and functional standalone HTML.
---

# Highcharts Visualizer

Creates professional data visualizations using Highcharts.js. Always generates **standalone HTML**
(single file, self-contained) with interactive, animated, responsive, and accessible charts.

## Workflow

### 1. Receive the Data

Data can come from:

- **Inline in the conversation** — User pastes data, table, or list of values
- **CSV/JSON submitted** — Analyze the content using `view_file` and inject the data directly into the generated HTML. Never create Python scripts.
- **Excel spreadsheet** — Extract data from tables and inject it into the HTML. Do not use Python.
- **Sample data** — When the user wants to explore a chart type without real data
- **Data URL** — Use `web_fetch` to fetch remote data

### 2. Analyze the Data

Before generating the chart, understand the nature of the data:

- **Dimensions**: how many series? How many categories? Temporal or categorical?
- **Scale**: value range, outliers, distribution
- **Relationships**: comparison, composition, distribution, trend, correlation
- **Volume**: few points (<100), medium (100-10K), large (>10K — use boost module)

Analyze the data internally after reading and inject the tags as strings. Do not create intermediate Python programs.

### 3. Choose the Chart Type

Consult `references/CHART_CATALOG.md` for the complete catalog of 40+ chart types, with guidance on when to use each one.

**Quick decision rule:**

| Goal | Recommended types |
|------|------------------|
| Trend over time | line, area, spline, areaspline |
| Comparison between categories | column, bar, lollipop, bullet |
| Composition / proportion | pie, donut, stacked column, stacked area, treemap, sunburst |
| Distribution | histogram, box plot, scatter, bell curve |
| Correlation | scatter, bubble, heatmap |
| Flow / process | sankey, dependency wheel, network graph |
| Hierarchy | treemap, sunburst, organization chart |
| Geographic | map (Highcharts Maps module) |
| Financial / timeline | stock chart (candlestick, OHLC, flags) |
| Progress / KPI | gauge, solid gauge, activity gauge |
| Project / planning | gantt chart |
| Funnel / conversion | funnel, pyramid |

If the user did not specify the type, suggest 2-3 options that best represent the data.

### 4. Generate the Code

Consult `references/HIGHCHARTS_PATTERNS.md` for tested code patterns.

**Fundamental rules:**

1. **Standalone HTML**: single `.html` file. When run by the Reversa Docs Team, Highcharts comes from `assets/vendor/` (downloaded by the Publisher via `vendor-pins.yaml`). When run in isolation, accepts CDN as fallback but the preferred path is local.
2. **Pinned version**: `highcharts@11.4.8`. Core and modules must be the same version.
3. **Modules on demand**: only include extra scripts when necessary (see module table).
4. **Accessibility always**: always include `assets/vendor/highcharts-accessibility.js`.
5. **Exporting always**: always include `assets/vendor/highcharts-exporting.js`.
6. **Responsive**: the chart must adapt to the container/viewport.
7. **Consistent theme**: apply cohesive colors and professional typography.
8. **Animation**: enable entry animations and smooth transitions.
9. **Rich tooltips**: formatted tooltips with units and context.
10. **Large data**: for >10K points, include `modules/boost.js` (needs to be added to `vendor-pins.yaml`).
11. **No `fetch()` for local files**: data comes from `window.RV_DATA.metrics` (or `window.RV_DATA.timeline`), loaded by `assets/js/data.js`.

**Modules required per chart type (preference: local path in `assets/vendor/`):**

| Resource | Local (when run by the Docs team) | CDN Fallback |
|---------|-----------------------------------|--------------|
| Core (required) | `assets/vendor/highcharts.js` | `https://code.highcharts.com/11.4.8/highcharts.js` |
| Accessibility (required) | `assets/vendor/highcharts-accessibility.js` | `.../11.4.8/modules/accessibility.js` |
| Exporting (required) | `assets/vendor/highcharts-exporting.js` | `.../11.4.8/modules/exporting.js` |
| Treemap | `assets/vendor/highcharts-treemap.js` | `.../11.4.8/modules/treemap.js` |
| Sankey | `assets/vendor/highcharts-sankey.js` | `.../11.4.8/modules/sankey.js` |
| Timeline | `assets/vendor/highcharts-timeline.js` | `.../11.4.8/modules/timeline.js` |
| Others (Sunburst, Heatmap, Funnel, etc.) | add to `vendor-pins.yaml` before use | `.../11.4.8/modules/<module>.js` |
| Stock (candlestick, OHLC) | add to `vendor-pins.yaml` before use | `.../stock/11.4.8/highstock.js` |
| Maps | add to `vendor-pins.yaml` before use | `.../maps/11.4.8/highmaps.js` |
| Gantt | add to `vendor-pins.yaml` before use | `.../gantt/11.4.8/highcharts-gantt.js` |

> If a page needs a module that is **not yet** in `vendor-pins.yaml`, the correct approach is:
> 1. Ask the Publisher to add the pin (commit to this skill or open an issue), with primary URL + fallbacks.
> 2. Only then use the module.
> Pointing directly to CDN in final pages breaks the "works via `file://` without internet" invariant.

All CDNs (fallback) in format: `https://code.highcharts.com/11.4.8/{path}`.

### 5. Save and Deliver

Save the generated HTML directly to the destination folder using `write_to_file`. Always generate the pure HTML file with all data processed and injected into `<script>` variables. Do not use Python snippets.

## Quality Guidelines

- **Professional aesthetics**: cohesive colors (use Highcharts or custom palettes), clean typography, adequate spacing
- **Formatted data**: numbers with thousand separators, localized dates, units on axes
- **Clear legends**: descriptive series names, position that does not obstruct data
- **Rich interactivity**: hover highlights, contextual tooltips, zoom when applicable
- **Dark mode**: when appropriate, offer dark version with `backgroundColor: '#1a1a2e'`
- **Multiple charts**: for dashboards, organize in a responsive CSS grid
- **Commented code**: comments in English explaining each section

## Error Handling

Consult `references/ERRORS.md` for error scenarios and solutions.
