/*
 * Command Center — Chart Styles (reusable, data-agnostic)
 * ------------------------------------------------------------------
 * Copied verbatim from the shared "charts styles" kit (SLDS 2 palette,
 * axes/gridlines, dashed reference line, HTML legend, and the dark-navy
 * popover/tooltip). Adapted only to load Chart.js v2.9.4 as an ES module
 * (instead of a global <script>) and to export window.ChartStyles.
 *
 * You supply the DATA, this supplies the STYLING.
 */
import Chart from 'chart.js';

// The original kit expects Chart.js on the global; expose it before the IIFE.
if (typeof window !== 'undefined' && !window.Chart) window.Chart = Chart;

(function (global) {
  'use strict';

  // ── Theme tokens (SLDS 2) ─────────────────────────────────────────
  var THEME = {
    // series colors, in order (index 0 is the "baseline"/neutral series)
    palette: ['#5C5C5C', '#066AFE', '#0B827C', '#8C4B02'],
    accent: '#066AFE',
    reference: '#B60554',            // dashed target / reference line
    axisColor: '#5C5C5C',
    gridColor: '#EEE',
    tooltipBg: 'rgba(3,45,96,0.9)',  // the popover background
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
  };

  function color(i) { return THEME.palette[i % THEME.palette.length]; }

  function hexToRgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // Optional: align Chart.js global font with the app's SLDS system font.
  function applyGlobalDefaults() {
    if (!global.Chart) return;
    global.Chart.defaults.global.defaultFontFamily = THEME.fontFamily;
    global.Chart.defaults.global.defaultFontColor = THEME.axisColor;
    global.Chart.defaults.global.defaultFontSize = 11;
  }

  // ── The popover / tooltip ─────────────────────────────────────────
  function tooltip(opts) {
    opts = opts || {};
    var cfg = {
      backgroundColor: THEME.tooltipBg,
      titleFontFamily: THEME.fontFamily,
      bodyFontFamily: THEME.fontFamily,
      cornerRadius: 4,
      xPadding: 10,
      yPadding: 8,
      caretSize: 5,
      callbacks: {}
    };
    if (opts.mode) { cfg.mode = opts.mode; cfg.intersect = false; }
    if (opts.label) cfg.callbacks.label = opts.label;
    if (opts.title) cfg.callbacks.title = opts.title;
    return cfg;
  }

  // Pad a value range so points/lines don't hug the chart edges.
  function niceRange(vals, pad) {
    vals = vals.filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    if (!vals.length) return { min: undefined, max: undefined };
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = hi - lo; if (span === 0) span = Math.abs(hi) * 0.1 || 1;
    return { min: lo - span * pad, max: hi + span * pad };
  }

  function axis(labelString, formatFn, extra) {
    var ticks = { fontSize: 9, fontColor: THEME.axisColor };
    if (formatFn) ticks.callback = formatFn;
    var a = { gridLines: { color: THEME.gridColor }, ticks: ticks };
    if (labelString) a.scaleLabel = { display: true, labelString: labelString, fontSize: 10, fontColor: THEME.axisColor };
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return a;
  }

  var identity = function (v) { return v; };

  // ── Diagonal reference-line plugin (y = ratio * x), per-chart ─────
  function referenceLinePlugin(getRatio) {
    return {
      afterDraw: function (chart) {
        var ratio = getRatio();
        if (ratio == null) return;
        var ctx = chart.chart.ctx;
        var xAxis = chart.scales['x-axis-1'], yAxis = chart.scales['y-axis-1'];
        if (!xAxis || !yAxis) return;
        var x1 = xAxis.min, x2 = xAxis.max;
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = THEME.reference;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xAxis.getPixelForValue(x1), yAxis.getPixelForValue(ratio * x1));
        ctx.lineTo(xAxis.getPixelForValue(x2), yAxis.getPixelForValue(ratio * x2));
        ctx.stroke();
        ctx.restore();
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // LINE CHART
  // ══════════════════════════════════════════════════════════════════
  function lineChart(ctx, cfg) {
    var yFormat = cfg.yFormat || identity;
    var valueFormat = cfg.valueFormat || yFormat;

    var datasets = cfg.series.map(function (s, i) {
      var c = s.color || color(i);
      return {
        label: s.label,
        data: s.data,
        borderColor: c,
        backgroundColor: 'transparent',
        borderWidth: s.dashed ? 1.5 : 2,
        borderDash: s.dashed ? [6, 4] : undefined,
        pointRadius: s.dashed ? 0 : 2,
        pointBackgroundColor: c,
        lineTension: s.dashed ? 0 : 0.3
      };
    });

    if (cfg.referenceValue != null) {
      datasets.push({
        label: cfg.referenceLabel || 'Target',
        data: cfg.labels.map(function () { return cfg.referenceValue; }),
        borderColor: THEME.reference,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        lineTension: 0
      });
    }

    var yTicks = { fontSize: 10, fontColor: THEME.axisColor, callback: yFormat };
    if (cfg.autoscale !== false) {
      var vals = [];
      cfg.series.forEach(function (s) { vals = vals.concat(s.data); });
      if (cfg.referenceValue != null) vals.push(cfg.referenceValue);
      var rr = niceRange(vals, 0.08);
      yTicks.min = rr.min; yTicks.max = rr.max;
    }

    return new global.Chart(ctx, {
      type: 'line',
      data: { labels: cfg.labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        legend: { display: false },
        hover: { mode: 'index', intersect: false },
        tooltips: tooltip({
          mode: 'index',
          label: function (i, d) { return d.datasets[i.datasetIndex].label + ': ' + valueFormat(i.yLabel); }
        }),
        scales: {
          xAxes: [{ gridLines: { display: false }, ticks: { fontSize: 10, fontColor: THEME.axisColor } }],
          yAxes: [{ gridLines: { color: THEME.gridColor }, ticks: yTicks }]
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // SCATTER CHART
  // ══════════════════════════════════════════════════════════════════
  function scatterChart(ctx, cfg) {
    var pad = cfg.pad == null ? 0.15 : cfg.pad;
    var datasets = cfg.points.map(function (p, i) {
      return { label: p.label, data: [{ x: p.x, y: p.y }], backgroundColor: p.color || color(i), pointRadius: 6 };
    });
    var xr = niceRange(cfg.points.map(function (p) { return p.x; }), pad);
    var yr = niceRange(cfg.points.map(function (p) { return p.y; }), pad);

    var plugins = [];
    if (cfg.referenceRatio != null) plugins.push(referenceLinePlugin(function () { return cfg.referenceRatio; }));

    return new global.Chart(ctx, {
      type: 'scatter',
      data: { datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        legend: { display: false },
        tooltips: tooltip({
          label: cfg.tooltip || function (i) { return '(' + i.xLabel + ', ' + i.yLabel + ')'; }
        }),
        scales: {
          xAxes: [axis(cfg.xLabel, cfg.xFormat, { type: 'linear', position: 'bottom', ticks: { fontSize: 9, fontColor: THEME.axisColor, callback: cfg.xFormat || identity, min: xr.min, max: xr.max } })],
          yAxes: [axis(cfg.yLabel, cfg.yFormat, { ticks: { fontSize: 9, fontColor: THEME.axisColor, callback: cfg.yFormat || identity, min: yr.min, max: yr.max } })]
        }
      },
      plugins: plugins
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // BAR CHART (categorical — one bar per label, optional per-bar colors)
  // ══════════════════════════════════════════════════════════════════
  function barChart(ctx, cfg) {
    var yFormat = cfg.yFormat || identity;
    var valueFormat = cfg.valueFormat || yFormat;
    var colors = cfg.colors || cfg.data.map(function (_, i) { return color(i); });

    var yTicks = { fontSize: 10, fontColor: THEME.axisColor, callback: yFormat };
    if (cfg.yMin != null) yTicks.min = cfg.yMin;
    if (cfg.yMax != null) yTicks.max = cfg.yMax;
    if (cfg.beginAtZero) yTicks.beginAtZero = true;

    var plugins = [];
    if (cfg.referenceValue != null) {
      plugins.push({
        afterDraw: function (chart) {
          var yAxis = chart.scales['y-axis-0'] || chart.scales['y-axis-1'];
          var xAxis = chart.scales['x-axis-0'] || chart.scales['x-axis-1'];
          if (!yAxis || !xAxis) return;
          var y = yAxis.getPixelForValue(cfg.referenceValue);
          var c = chart.chart.ctx;
          c.save();
          c.setLineDash([5, 4]);
          c.strokeStyle = THEME.reference;
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(xAxis.left, y);
          c.lineTo(xAxis.right, y);
          c.stroke();
          c.restore();
        }
      });
    }

    return new global.Chart(ctx, {
      type: 'bar',
      data: {
        labels: cfg.labels,
        datasets: [{
          data: cfg.data,
          backgroundColor: colors.map(function (c) { return hexToRgba(c, 0.85); }),
          borderColor: colors,
          borderWidth: 1,
          maxBarThickness: cfg.maxBarThickness || 48
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        legend: { display: false },
        tooltips: tooltip({
          label: cfg.tooltip || function (i, d) { return cfg.labels[i.index] + ': ' + valueFormat(i.yLabel); }
        }),
        scales: {
          xAxes: [{ gridLines: { display: false }, ticks: { fontSize: 10, fontColor: THEME.axisColor } }],
          yAxes: [{ gridLines: { color: THEME.gridColor }, ticks: yTicks }]
        }
      },
      plugins: plugins
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // BUBBLE CHART
  // ══════════════════════════════════════════════════════════════════
  function bubbleChart(ctx, cfg) {
    var padX = cfg.padX == null ? 0.20 : cfg.padX;
    var padY = cfg.padY == null ? 0.15 : cfg.padY;
    var datasets = cfg.bubbles.map(function (b, i) {
      var c = b.color || color(i);
      return { label: b.label, data: [{ x: b.x, y: b.y, r: b.r }], backgroundColor: hexToRgba(c, 0.30), borderColor: c };
    });
    var xr = niceRange(cfg.bubbles.map(function (b) { return b.x; }), padX);
    var yr = niceRange(cfg.bubbles.map(function (b) { return b.y; }), padY);

    return new global.Chart(ctx, {
      type: 'bubble',
      data: { datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        legend: { display: false },
        tooltips: tooltip({
          label: cfg.tooltip || function (i, d) { var p = d.datasets[i.datasetIndex].data[i.index]; return '(' + p.x + ', ' + p.y + ')'; }
        }),
        scales: {
          xAxes: [axis(cfg.xLabel, cfg.xFormat, { type: 'linear', position: 'bottom', ticks: { fontSize: 9, fontColor: THEME.axisColor, callback: cfg.xFormat || identity, min: xr.min, max: xr.max } })],
          yAxes: [axis(cfg.yLabel, cfg.yFormat, { ticks: { fontSize: 9, fontColor: THEME.axisColor, callback: cfg.yFormat || identity, min: yr.min, max: yr.max } })]
        }
      }
    });
  }

  // ── HTML legend (matches .cs-chart-legend in chart-theme.css) ─────
  function renderLegend(container, items) {
    container.className = 'cs-chart-legend';
    container.innerHTML = items.map(function (it, i) {
      var c = it.color || color(i);
      var swatch = it.dashed
        ? '<span class="cs-legend-dash" style="border-top-color:' + c + '"></span>'
        : '<span class="cs-legend-dot" style="color:' + c + '"></span>';
      return '<span class="cs-legend-item">' + swatch + '<span>' + it.label + '</span></span>';
    }).join('');
  }

  // ── Handy formatters ──────────────────────────────────────────────
  var format = {
    millions: function (dp) { dp = dp == null ? 1 : dp; return function (v) { return '$' + (v / 1e6).toFixed(dp) + 'M'; }; },
    thousands: function (dp) { dp = dp == null ? 0 : dp; return function (v) { return (v / 1e3).toFixed(dp) + 'K'; }; },
    money: function (v) { return '$' + Math.round(v).toLocaleString(); },
    integer: function (v) { return Math.round(v).toLocaleString(); },
    percent: function (dp) { dp = dp == null ? 0 : dp; return function (v) { return v.toFixed(dp) + '%'; }; }
  };

  // Bubble radius helper (matches the original sqrt scaling).
  function radiusFromValue(v, divisor, min) {
    divisor = divisor || 60; min = min == null ? 8 : min;
    return Math.max(min, Math.sqrt(Math.max(0, v)) / divisor);
  }

  global.ChartStyles = {
    THEME: THEME,
    color: color,
    hexToRgba: hexToRgba,
    applyGlobalDefaults: applyGlobalDefaults,
    tooltip: tooltip,
    niceRange: niceRange,
    referenceLinePlugin: referenceLinePlugin,
    lineChart: lineChart,
    scatterChart: scatterChart,
    barChart: barChart,
    bubbleChart: bubbleChart,
    renderLegend: renderLegend,
    radiusFromValue: radiusFromValue,
    format: format
  };
})(typeof window !== 'undefined' ? window : this);

export default (typeof window !== 'undefined' ? window.ChartStyles : undefined);
