// total-activity-chart.ts — Generates a dual-axis chart showing total weekly
// commits (left axis) and PRs (right axis) on GitHub over time.
// The two y-axis domains are set so both lines start at the same height.

import { readFileSync, writeFileSync } from "fs";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import sharp from "sharp";

interface WeeklyRow {
  week_start: string;
  commits_total: number;
  prs_total: number;
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
    });
  }
  return rows;
}

async function main() {
  const rows = loadWeekly();
  console.log(`Loaded ${rows.length} weeks of data`);

  // Compute aligned y-axis domains so both lines start at the same visual height.
  // Both axes start at 0. We set the max so that firstValue/max is the same ratio.
  const firstCommits = rows[0].commits_total / 1e6;
  const firstPrs = rows[0].prs_total / 1e6;
  const maxCommits = Math.max(...rows.map((r) => r.commits_total)) / 1e6;
  const maxPrs = Math.max(...rows.map((r) => r.prs_total)) / 1e6;

  // Use the larger growth factor to set both domains
  const commitGrowth = maxCommits / firstCommits;
  const prGrowth = maxPrs / firstPrs;
  const maxGrowth = Math.max(commitGrowth, prGrowth) * 1.15; // 15% headroom

  const commitDomainMax = Math.ceil(firstCommits * maxGrowth);
  const prDomainMax = parseFloat((firstPrs * maxGrowth).toFixed(1));

  const commitData = rows.map((r) => ({
    week_start: r.week_start,
    commits: r.commits_total / 1e6,
  }));

  const prData = rows.map((r) => ({
    week_start: r.week_start,
    prs: r.prs_total / 1e6,
  }));

  const axisFont = "Helvetica Neue, Arial, sans-serif";
  const axisLabelStyle = {
    labelFont: axisFont,
    labelFontSize: 17,
    gridColor: "#EEF0F6",
    gridDash: [4, 4],
    domainColor: "#DEE2EC",
    tickColor: "#DEE2EC",
  };

  const vlSpec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: 1000,
    height: 420,
    padding: 0,
    background: "#FAFBFF",
    title: {
      text: "Total Public GitHub Activity per Week",
      subtitle: "Commits (left) and Pull Requests (right)  ·  January 2025 - Present",
      font: axisFont,
      fontSize: 32,
      fontWeight: 700,
      color: "#1E2A3A",
      subtitleFont: axisFont,
      subtitleFontSize: 21,
      subtitleColor: "#8B95A5",
      subtitlePadding: 8,
      anchor: "start",
      offset: 18,
    },
    layer: [
      {
        data: { values: commitData },
        mark: {
          type: "line",
          interpolate: "monotone",
          strokeWidth: 3,
          color: "#10B981",
        },
        encoding: {
          x: {
            field: "week_start",
            type: "temporal",
            axis: {
              title: null,
              format: "%b %Y",
              labelAngle: 0,
              tickCount: "month" as any,
              ...axisLabelStyle,
              labelFontSize: 19,
              labelColor: "#8B95A5",
            },
          },
          y: {
            field: "commits",
            type: "quantitative",
            scale: { domain: [0, commitDomainMax] },
            axis: {
              title: "Commits (millions/week)",
              titleFont: axisFont,
              titleFontSize: 18,
              titleFontWeight: 600,
              titleColor: "#10B981",
              titlePadding: 12,
              labelColor: "#10B981",
              ...axisLabelStyle,
            },
          },
        },
      },
      {
        data: { values: prData },
        mark: {
          type: "line",
          interpolate: "monotone",
          strokeWidth: 3,
          color: "#6C5CE7",
          strokeDash: [8, 4],
        },
        encoding: {
          x: { field: "week_start", type: "temporal" },
          y: {
            field: "prs",
            type: "quantitative",
            scale: { domain: [0, prDomainMax] },
            axis: {
              title: "Pull Requests (millions/week)",
              titleFont: axisFont,
              titleFontSize: 18,
              titleFontWeight: 600,
              titleColor: "#6C5CE7",
              titlePadding: 12,
              labelColor: "#6C5CE7",
              ...axisLabelStyle,
              grid: false,
            },
          },
        },
      },
    ],
    resolve: { scale: { y: "independent" } },
    config: {
      font: axisFont,
      view: { stroke: null },
      legend: { disable: true },
    },
  } as vegaLite.TopLevelSpec;

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

  const MARGIN = 40;
  const ATTR_H = 60;
  const finalW = tw! + MARGIN * 2;
  const finalH = th! + MARGIN * 2 + ATTR_H;

  // Add a manual legend + attribution via SVG overlay
  const overlayH = ATTR_H + 10;
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${finalW}" height="${overlayH}">
    <line x1="${MARGIN}" y1="18" x2="${MARGIN + 30}" y2="18" stroke="#10B981" stroke-width="3"/>
    <text x="${MARGIN + 38}" y="24" font-family="${axisFont}" font-size="22" font-weight="600" fill="#10B981">Commits</text>
    <line x1="${MARGIN + 160}" y1="18" x2="${MARGIN + 190}" y2="18" stroke="#6C5CE7" stroke-width="3" stroke-dasharray="8,4"/>
    <text x="${MARGIN + 198}" y="24" font-family="${axisFont}" font-size="22" font-weight="600" fill="#6C5CE7">Pull Requests</text>
    <text x="${MARGIN}" y="52" font-family="${axisFont}" font-size="28" fill="#A0A8B8">by @jphme / ellamind.com</text>
  </svg>`;
  const overlayBuf = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  const png = await sharp({
    create: { width: finalW, height: finalH, channels: 4, background: "#FAFBFF" },
  })
    .composite([
      { input: trimmedBuf, left: MARGIN, top: MARGIN },
      { input: overlayBuf, left: 0, top: th! + MARGIN + 5 },
    ])
    .png({ quality: 95 })
    .toBuffer();

  writeFileSync("total-activity-chart.png", png);
  console.log(
    `Wrote total-activity-chart.png (${(png.length / 1024).toFixed(0)} KB, ${finalW}x${finalH})`,
  );
}

main();
