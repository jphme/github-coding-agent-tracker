// diagnostic-charts.ts — Generates three diagnostic charts from weekly summary data:
// 1. Total PRs per week
// 2. Total commits per week
// 3. PR/Commit ratio over time
// Now with attribution text at the bottom of each chart.

import { readFileSync, writeFileSync } from "fs";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import sharp from "sharp";

interface WeeklyRow {
  week_start: string;
  commits_total: number;
  prs_total: number;
  pr_commit_ratio: number;
}

function loadWeekly(): WeeklyRow[] {
  const content = readFileSync("weekly-summary.csv", "utf-8").replace(/\r\n/g, "\n");
  const lines = content.trim().split("\n");
  const header = lines[0].split(",");
  const rows: WeeklyRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const obj: any = {};
    header.forEach((h, i) => (obj[h] = cols[i]));
    rows.push({
      week_start: obj.week_start,
      commits_total: parseInt(obj.commits_total),
      prs_total: parseInt(obj.prs_total),
      pr_commit_ratio: parseFloat(obj.pr_commit_ratio),
    });
  }
  return rows;
}

async function renderChart(vlSpec: vegaLite.TopLevelSpec, filename: string): Promise<void> {
  const vegaSpec = vegaLite.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  const svg = await view.toSVG();

  const DPI = 150;
  const rawBuf = await sharp(Buffer.from(svg), { density: DPI })
    .flatten({ background: "#FAFBFF" })
    .png()
    .toBuffer();

  const trimmedBuf = await sharp(rawBuf)
    .trim({ background: "#FAFBFF", threshold: 15 })
    .png()
    .toBuffer();
  const { width: tw, height: th } = await sharp(trimmedBuf).metadata();

  const MARGIN = 30;
  const ATTR_H = 50;
  const finalW = tw! + MARGIN * 2;
  const finalH = th! + MARGIN * 2 + ATTR_H;

  // Create attribution text overlay
  const attrText = "by @jphme / ellamind.com";
  const attrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${finalW}" height="${ATTR_H}">
    <text x="${MARGIN}" y="32" font-family="Helvetica Neue, Arial, sans-serif"
          font-size="22" fill="#A0A8B8">${attrText}</text>
  </svg>`;
  const attrBuf = await sharp(Buffer.from(attrSvg)).png().toBuffer();

  const png = await sharp({
    create: { width: finalW, height: finalH, channels: 4, background: "#FAFBFF" },
  })
    .composite([
      { input: trimmedBuf, left: MARGIN, top: MARGIN },
      { input: attrBuf, left: 0, top: th! + MARGIN * 2 - 8 },
    ])
    .png({ quality: 95 })
    .toBuffer();

  writeFileSync(filename, png);
  console.log(`Wrote ${filename} (${(png.length / 1024).toFixed(0)} KB, ${finalW}x${finalH})`);
}

function baseEncoding() {
  return {
    x: {
      field: "week_start",
      type: "temporal" as const,
      axis: {
        title: null,
        format: "%b %Y",
        tickCount: "month" as any,
        labelAngle: 0,
        labelFont: "Helvetica Neue, Arial, sans-serif",
        labelFontSize: 16,
        labelColor: "#8B95A5",
        gridColor: "#EEF0F6",
        gridDash: [4, 4],
        domainColor: "#DEE2EC",
        tickColor: "#DEE2EC",
      },
    },
  };
}

function makeTitle(text: string, subtitle: string) {
  return {
    text,
    subtitle,
    font: "Helvetica Neue, Arial, sans-serif",
    fontSize: 26,
    fontWeight: 700 as const,
    color: "#1E2A3A",
    subtitleFont: "Helvetica Neue, Arial, sans-serif",
    subtitleFontSize: 17,
    subtitleColor: "#8B95A5",
    subtitlePadding: 6,
    anchor: "start" as const,
    offset: 14,
  };
}

async function main() {
  const data = loadWeekly();
  console.log(`Loaded ${data.length} weeks of data`);

  // Chart 1: Total PRs per week
  const prsSpec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 900,
    height: 350,
    padding: 0,
    background: "#FAFBFF",
    title: makeTitle("Total Public GitHub PRs per Week", "Weekly sum of all public PRs"),
    data: { values: data.map((d) => ({ week_start: d.week_start, value: d.prs_total / 1e6 })) },
    mark: {
      type: "area",
      interpolate: "monotone",
      line: { strokeWidth: 2.5, stroke: "#6C5CE7" },
      color: {
        x1: 1,
        y1: 1,
        x2: 1,
        y2: 0,
        gradient: "linear",
        stops: [
          { offset: 0, color: "rgba(108,92,231,0.05)" },
          { offset: 1, color: "rgba(108,92,231,0.3)" },
        ],
      },
    },
    encoding: {
      ...baseEncoding(),
      y: {
        field: "value",
        type: "quantitative",
        axis: {
          title: "PRs (millions)",
          titleFont: "Helvetica Neue, Arial, sans-serif",
          titleFontSize: 17,
          titleFontWeight: 600,
          titleColor: "#5A6577",
          titlePadding: 10,
          labelFont: "Helvetica Neue, Arial, sans-serif",
          labelFontSize: 16,
          labelColor: "#8B95A5",
          gridColor: "#EEF0F6",
          gridDash: [4, 4],
          domainColor: "#DEE2EC",
          tickColor: "#DEE2EC",
        },
      },
    },
    config: { font: "Helvetica Neue, Arial, sans-serif", view: { stroke: null } },
  };

  // Chart 2: Total commits per week
  const commitsSpec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 900,
    height: 350,
    padding: 0,
    background: "#FAFBFF",
    title: makeTitle("Total Public GitHub Commits per Week", "Weekly sum of all public commits"),
    data: {
      values: data.map((d) => ({ week_start: d.week_start, value: d.commits_total / 1e6 })),
    },
    mark: {
      type: "area",
      interpolate: "monotone",
      line: { strokeWidth: 2.5, stroke: "#10B981" },
      color: {
        x1: 1,
        y1: 1,
        x2: 1,
        y2: 0,
        gradient: "linear",
        stops: [
          { offset: 0, color: "rgba(16,185,129,0.05)" },
          { offset: 1, color: "rgba(16,185,129,0.3)" },
        ],
      },
    },
    encoding: {
      ...baseEncoding(),
      y: {
        field: "value",
        type: "quantitative",
        axis: {
          title: "Commits (millions)",
          titleFont: "Helvetica Neue, Arial, sans-serif",
          titleFontSize: 17,
          titleFontWeight: 600,
          titleColor: "#5A6577",
          titlePadding: 10,
          labelFont: "Helvetica Neue, Arial, sans-serif",
          labelFontSize: 16,
          labelColor: "#8B95A5",
          gridColor: "#EEF0F6",
          gridDash: [4, 4],
          domainColor: "#DEE2EC",
          tickColor: "#DEE2EC",
        },
      },
    },
    config: { font: "Helvetica Neue, Arial, sans-serif", view: { stroke: null } },
  };

  // Chart 3: PR/Commit ratio over time
  const ratioSpec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 900,
    height: 350,
    padding: 0,
    background: "#FAFBFF",
    title: makeTitle(
      "PR-to-Commit Ratio Over Time",
      "Total PRs / Total Commits x 100  ·  Weekly averages",
    ),
    data: {
      values: data.map((d) => ({ week_start: d.week_start, value: d.pr_commit_ratio })),
    },
    mark: {
      type: "line",
      interpolate: "monotone",
      strokeWidth: 3,
      color: "#E17055",
      point: { filled: true, size: 30, color: "#E17055" },
    },
    encoding: {
      ...baseEncoding(),
      y: {
        field: "value",
        type: "quantitative",
        axis: {
          title: "PRs / Commits (%)",
          titleFont: "Helvetica Neue, Arial, sans-serif",
          titleFontSize: 17,
          titleFontWeight: 600,
          titleColor: "#5A6577",
          titlePadding: 10,
          labelFont: "Helvetica Neue, Arial, sans-serif",
          labelFontSize: 16,
          labelColor: "#8B95A5",
          gridColor: "#EEF0F6",
          gridDash: [4, 4],
          domainColor: "#DEE2EC",
          tickColor: "#DEE2EC",
        },
      },
    },
    config: { font: "Helvetica Neue, Arial, sans-serif", view: { stroke: null } },
  };

  await Promise.all([
    renderChart(prsSpec, "diagnostic-total-prs.png"),
    renderChart(commitsSpec, "diagnostic-total-commits.png"),
    renderChart(ratioSpec, "diagnostic-pr-commit-ratio.png"),
  ]);
}

main();
