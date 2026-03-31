import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { MotionMetricTimeSeries } from "../MotionMetric";

export const motionMetricTimeSeriesArtifactsRoot = path.resolve("artifacts/motion-metric-timeseries");

function sanitizePathPart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function ensureDirectory(dirPath: string) {
    fs.mkdirSync(dirPath, { recursive: true });
}

export function resetMotionMetricTimeSeriesArtifactsRoot() {
    fs.rmSync(motionMetricTimeSeriesArtifactsRoot, { recursive: true, force: true });
    ensureDirectory(motionMetricTimeSeriesArtifactsRoot);
}

export function getMetricArtifactDirectory(metricName: string, clipId: string) {
    return path.join(
        motionMetricTimeSeriesArtifactsRoot,
        sanitizePathPart(metricName),
        sanitizePathPart(clipId),
    );
}

export function writeTimeSeriesCsv(series: MotionMetricTimeSeries, outputDir: string) {
    ensureDirectory(outputDir);
    const csv = Papa.unparse(series.rows);
    const outputPath = path.join(outputDir, `${sanitizePathPart(series.seriesId)}.csv`);
    fs.writeFileSync(outputPath, csv, "utf8");
    return outputPath;
}

function escapeJsonForHtml(value: unknown) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function writeTimeSeriesPlotHtml(series: MotionMetricTimeSeries, outputDir: string) {
    ensureDirectory(outputDir);

    const traces = series.yKeys.map((yKey) => ({
        type: "scatter",
        mode: "lines",
        name: yKey,
        x: series.rows.map((row) => row[series.xKey]),
        y: series.rows.map((row) => row[yKey]),
    }));
    const layout = {
        title: series.title ?? series.seriesId,
        xaxis: { title: series.xLabel ?? series.xKey },
        yaxis: { title: series.yLabel ?? "value" },
    };

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${series.title ?? series.seriesId}</title>
  <script src="https://cdn.plot.ly/plotly-2.35.3.min.js"></script>
</head>
<body>
  <div id="plot" style="width: 100%; height: 720px;"></div>
  <script>
    const traces = ${escapeJsonForHtml(traces)};
    const layout = ${escapeJsonForHtml(layout)};
    Plotly.newPlot('plot', traces, layout, { responsive: true });
  </script>
</body>
</html>
`;

    const outputPath = path.join(outputDir, `${sanitizePathPart(series.seriesId)}.html`);
    fs.writeFileSync(outputPath, html, "utf8");
    return outputPath;
}
