import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Box, Typography, Alert, CircularProgress, IconButton, Tooltip, Select, MenuItem } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ZoomOutMapIcon      from '@mui/icons-material/ZoomOutMap';
import DownloadIcon        from '@mui/icons-material/Download';
import LegendToggleIcon    from '@mui/icons-material/LegendToggle';
import OpenInFullIcon      from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import TouchAppIcon        from '@mui/icons-material/TouchApp';
import * as d3 from 'd3';
import LandingGraphic from '../assets/LandingGraphic.png';

const MARGIN = { top: 28, right: 60, bottom: 48, left: 72 };
const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
const traceColor = i => colorScale(i);

const fmtVal = v => {
  if (!isFinite(v)) return '';
  if (Math.abs(v) >= 10000 || (Math.abs(v) < 0.001 && v !== 0)) return d3.format('.3e')(v);
  return d3.format('.4~g')(v);
};

// ─── resize hook ──────────────────────────────────────────────────────────────
const useSize = () => {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
};

const downloadCSV = (plot) => {
  if (!plot?.val) return;
  const n = plot.val[0].length;
  let csv = 'Time,' + plot.val.map((_, i) => `Trace_${i + 1}`).join(',') + '\n';
  for (let i = 0; i < n; i++)
    csv += [i * plot.dt, ...plot.val.map(t => t[i])].join(',') + '\n';
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `${plot.title || 'plot'}.csv`,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

// ─── D3Panel ──────────────────────────────────────────────────────────────────
const D3Panel = memo(({
  plot, hoverTime, onHover, isSimulating, runtime,
  showLegend, xZoom, onXZoom, onFocus, isFocused,
  interactive, resetKey,
}) => {
  const theme   = useTheme();
  const isDark  = theme.palette.mode === 'dark';
  const { ref: containerRef, w, h } = useSize();
  const axesRef    = useRef(null);
  const svgNodeRef = useRef(null);
  const zoomRef    = useRef(null);

  const [brushYDomain, setBrushYDomain] = useState(null);
  const xScaleRef = useRef(null);

  const iw = Math.max(0, w - MARGIN.left - MARGIN.right);
  const ih = Math.max(0, h - MARGIN.top  - MARGIN.bottom);

  // clear brush y-zoom on parent reset
  useEffect(() => { setBrushYDomain(null); }, [resetKey]);

  // ── computed domains ──
  const computedYDomain = useMemo(() => {
    if (!plot || ih <= 0) return null;
    const all = plot.val.flatMap(t => t);
    let [lo, hi] = d3.extent(all);
    if (lo === hi || lo == null) { lo = (lo ?? 0) - 0.1; hi = (hi ?? 0) + 0.1; }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  }, [plot?.val, ih]);

  const computedXTmax = useMemo(() => {
    if (!plot) return runtime ?? 0.3;
    const pts = plot.val[0]?.length ?? 0;
    return Math.max(pts * plot.dt, runtime ?? 0.3);
  }, [plot?.val[0]?.length, plot?.dt, runtime]);

  // ── scales ──
  const xBase = useMemo(() => {
    if (iw <= 0) return null;
    return d3.scaleLinear().domain([0, computedXTmax]).range([0, iw]);
  }, [computedXTmax, iw]);

  const yBase = useMemo(() => {
    if (ih <= 0) return null;
    return d3.scaleLinear()
      .domain(brushYDomain ?? computedYDomain ?? [-1, 1])
      .range([ih, 0]);
  }, [brushYDomain, computedYDomain, ih]);

  const xScale = useMemo(() => {
    if (!xBase) return null;
    const s = xZoom ? xZoom.rescaleX(xBase) : xBase;
    xScaleRef.current = s;
    return s;
  }, [xBase, xZoom]);

  const yScale = yBase;

  // ── wheel zoom (x only) ──
  useEffect(() => {
    const node = svgNodeRef.current;
    if (!node || !iw || !interactive) {
      if (node) d3.select(node).on('.zoom', null);
      zoomRef.current = null;
      return;
    }
    const zoom = d3.zoom()
      .scaleExtent([0.5, 500])
      .filter(e => e.type === 'wheel')
      .on('zoom', e => onXZoom(e.transform));
    zoomRef.current = zoom;
    d3.select(node).call(zoom);
    if (xZoom) d3.select(node).call(zoom.transform, xZoom);
    return () => { d3.select(node).on('.zoom', null); zoomRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iw, ih, interactive]);

  // sync D3 internal transform when xZoom changes
  useEffect(() => {
    const node = svgNodeRef.current;
    if (!node || !zoomRef.current) return;
    d3.select(node).call(zoomRef.current.transform, xZoom ?? d3.zoomIdentity);
  }, [xZoom]);

  // ── brush box zoom (click + drag) ──
  useEffect(() => {
    const node = svgNodeRef.current;
    if (!node || !xScale || !yScale || !iw || !interactive) return;
    const orange = theme.palette.warning.main;
    const brush = d3.brush()
      .extent([[0, 0], [iw, ih]])
      .on('end', event => {
        if (!event.selection) return;
        const [[x0, y0], [x1, y1]] = event.selection;
        if (x1 - x0 > 4) // ignore accidental tiny drags
          onXZoom(d3.zoomIdentity.translate(-x0 * (iw / (x1 - x0)), 0).scale(iw / (x1 - x0)));
        if (y1 - y0 > 4)
          setBrushYDomain([yScale.invert(y1), yScale.invert(y0)]);
        d3.select(node).select('.brush-layer').call(brush.move, null);
      });
    d3.select(node).select('.brush-layer').call(brush);
    d3.select(node).select('.brush-layer .selection')
      .attr('fill', orange).attr('fill-opacity', 0.12)
      .attr('stroke', orange).attr('stroke-width', 1.5);
    return () => d3.select(node).select('.brush-layer').on('.brush', null);
  }, [xScale, yScale, iw, ih, interactive]);

  // ── axes ──
  useEffect(() => {
    if (!axesRef.current || !xScale || !yScale) return;
    const g  = d3.select(axesRef.current);
    const tc = theme.palette.text.primary;
    const gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const lc = theme.palette.divider;

    g.select('.x-axis')
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(v => `${d3.format('~g')(v)}s`))
      .call(ax => ax.select('.domain').attr('stroke', lc))
      .call(ax => ax.selectAll('.tick line').attr('stroke', lc))
      .call(ax => ax.selectAll('.tick text').attr('fill', tc).attr('font-size', 10));

    g.select('.y-axis')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(fmtVal))
      .call(ax => ax.select('.domain').attr('stroke', lc))
      .call(ax => ax.selectAll('.tick line').attr('stroke', lc))
      .call(ax => ax.selectAll('.tick text').attr('fill', tc).attr('font-size', 10));

    g.select('.x-grid')
      .call(d3.axisBottom(xScale).ticks(6).tickSize(-ih).tickFormat(''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line').attr('stroke', gc));

    g.select('.y-grid')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-iw).tickFormat(''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line').attr('stroke', gc));
  }, [xScale, yScale, iw, ih, isDark]);

  // ── line generator ──
  const lineGen = useMemo(() => {
    if (!xScale || !yScale || !plot) return null;
    return d3.line()
      .x((_, i) => xScale(i * plot.dt))
      .y(d => yScale(d))
      .defined(d => isFinite(d));
  }, [xScale, yScale, plot?.dt]);

  // ── hover ──
  const handleMouseMove = useCallback((e) => {
    if (!xScale || !interactive) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left - MARGIN.left;
    const t  = xScale.invert(px);
    if (t >= 0) onHover(t);
  }, [xScale, interactive, onHover]);

  const hoverValues = useMemo(() => {
    if (hoverTime == null || !plot || !interactive) return null;
    return plot.val.map(trace => {
      const raw = hoverTime / plot.dt;
      const i0  = Math.max(0, Math.floor(raw));
      const i1  = Math.min(i0 + 1, trace.length - 1);
      if (i0 >= trace.length) return trace[trace.length - 1];
      return trace[i0] * (1 - (raw - i0)) + trace[i1] * (raw - i0);
    });
  }, [hoverTime, plot, interactive]);

  const crossX    = hoverTime != null && xScale ? xScale(hoverTime) : null;
  const showCross = crossX != null && crossX >= 0 && crossX <= iw;

  const tc     = theme.palette.text.primary;
  const dim    = theme.palette.text.secondary;
  const orange = theme.palette.warning.main;
  const paneBg = isDark ? 'rgba(22,27,34,0.95)' : 'rgba(255,255,255,0.95)';
  const clipId = `clip-${(plot?.title || 'p').replace(/\W+/g, '-')}-${iw}`;

  const lastValues = useMemo(() => {
    if (!plot || !yScale) return [];
    return plot.val.map((trace, i) => {
      const v  = trace[trace.length - 1];
      const py = isFinite(v) ? yScale(v) : null;
      return { v, py, color: traceColor(i) };
    });
  }, [plot?.val, yScale]);

  return (
    <Box ref={containerRef}
      sx={{ width: '100%', height: '100%', position: 'relative',
            cursor: !interactive ? 'default' : 'crosshair' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => interactive && onHover(null)}
    >
      {w > 0 && h > 0 && xScale && yScale && lineGen && (
        <svg ref={svgNodeRef} width={w} height={h} style={{ overflow: 'hidden', display: 'block' }}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={iw} height={ih} />
            </clipPath>
          </defs>

          <g transform={`translate(${MARGIN.left},${MARGIN.top})`} ref={axesRef}>
            <g className="x-grid" transform={`translate(0,${ih})`} />
            <g className="y-grid" />
            <g className="x-axis" transform={`translate(0,${ih})`} />
            <g className="y-axis" />

            <text x={iw / 2} y={ih + 40} textAnchor="middle" fill={dim} fontSize={11}>
              {plot.xlabel ?? 'Time (s)'}
            </text>
            <text x={-ih / 2} y={-56} textAnchor="middle" fill={dim} fontSize={11} transform="rotate(-90)">
              {plot.ylabel}
            </text>

            <g clipPath={`url(#${clipId})`}>
              {plot.val.map((trace, i) => (
                <path key={i} d={lineGen(trace)} fill="none"
                  stroke={traceColor(i)} strokeWidth={1.8} opacity={0.95} />
              ))}

              {/* live-head marker */}
              {isSimulating && plot.val[0]?.length > 0 && (() => {
                const px = xScale((plot.val[0].length - 1) * plot.dt);
                return (px >= 0 && px <= iw)
                  ? <line x1={px} x2={px} y1={0} y2={ih} stroke={orange} strokeWidth={1} opacity={0.35} />
                  : null;
              })()}

              {/* last-value dashed reference lines */}
              {lastValues.map(({ py, color }, i) =>
                py != null && py >= 0 && py <= ih
                  ? <line key={i} x1={0} x2={iw} y1={py} y2={py}
                      stroke={color} strokeWidth={0.8} strokeDasharray="3,4" opacity={0.45} />
                  : null
              )}

              {/* vertical crosshair */}
              {showCross && (
                <line x1={crossX} x2={crossX} y1={0} y2={ih}
                  stroke={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'}
                  strokeWidth={1} />
              )}

              {/* crosshair dots */}
              {showCross && hoverValues && hoverValues.map((v, i) => {
                if (!isFinite(v)) return null;
                const py = yScale(v);
                if (py < 0 || py > ih) return null;
                return <circle key={i} cx={crossX} cy={py} r={4}
                  fill={traceColor(i)} stroke={isDark ? '#111' : '#fff'} strokeWidth={1.5} />;
              })}
            </g>

            {/* last-value badges on right axis */}
            {lastValues.map(({ v, py, color }, i) => {
              if (py == null || py < 0 || py > ih) return null;
              return (
                <g key={i}>
                  <rect x={iw + 2} y={py - 8} width={MARGIN.right - 4} height={16} rx={2} fill={color} />
                  <text x={iw + 2 + (MARGIN.right - 4) / 2} y={py + 4}
                    textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtVal(v)}</text>
                </g>
              );
            })}

            {/* x-axis time badge */}
            {showCross && (
              <g>
                <rect x={crossX - 26} y={ih + 2} width={52} height={15} rx={2} fill={orange} />
                <text x={crossX} y={ih + 12} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {d3.format('.3f')(hoverTime)}s
                </text>
              </g>
            )}

            {/* top-right per-trace hover readout */}
            {showCross && hoverValues && (() => {
              const rowH = 15, pad = 6;
              const boxW = 110, boxH = hoverValues.length * rowH + pad * 2;
              return (
                <g transform={`translate(${iw - boxW - 4},4)`}>
                  <rect x={0} y={0} width={boxW} height={boxH} rx={3}
                    fill={paneBg}
                    stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}
                    strokeWidth={1} />
                  {hoverValues.map((v, i) => {
                    const y = pad + i * rowH + rowH / 2;
                    return (
                      <g key={i} transform={`translate(0,${y})`}>
                        <line x1={pad} x2={pad + 12} y1={0} y2={0}
                          stroke={traceColor(i)} strokeWidth={2.5} />
                        <text x={pad + 16} y={4} fill={tc} fontSize={9}
                          style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {`T${i + 1}: `}
                          <tspan fontWeight={700}>{isFinite(v) ? fmtVal(v) : '–'}</tspan>
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}

            <g className="brush-layer" />
          </g>

          <text x={MARGIN.left + iw / 2} y={17} textAnchor="middle"
            fill={tc} fontSize={12} fontWeight={600}>{plot.title}</text>

          {showLegend && plot.val.length > 1 && (
            <g transform={`translate(${MARGIN.left + 8},${MARGIN.top + 8})`}>
              {plot.val.map((_, i) => (
                <g key={i} transform={`translate(0,${i * 18})`}>
                  <rect x={0} y={-9} width={84} height={16} rx={3}
                    fill={paneBg} opacity={0.9} />
                  <line x1={4} x2={18} y1={-1} y2={-1} stroke={traceColor(i)} strokeWidth={2.5} />
                  <text x={22} y={3} fill={tc} fontSize={10}>Trace {i + 1}</text>
                </g>
              ))}
            </g>
          )}
        </svg>
      )}

      {onFocus && (
        <Tooltip title={isFocused ? 'Back to grid' : 'Focus this plot'}>
          <IconButton size="small" onClick={onFocus} sx={{
            position: 'absolute', top: 2, left: 2,
            opacity: 0.25, '&:hover': { opacity: 1 },
            bgcolor: isDark ? 'rgba(22,27,34,0.6)' : 'rgba(255,255,255,0.6)',
          }}>
            {isFocused ? <CloseFullscreenIcon sx={{ fontSize: 14 }} /> : <OpenInFullIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
});

// ─── Toolbar ──────────────────────────────────────────────────────────────────
const Toolbar = ({
  plots, focusIdx, onFocusIdx,
  interactive, onToggleInteractive,
  onResetZoom, onDownloadAll,
  showLegend, onToggleLegend,
}) => (
  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', px: 1, py: 0.5, flexShrink: 0 }}>
    {plots && plots.length > 1 && (
      <Select size="small" value={focusIdx ?? -1}
        onChange={e => onFocusIdx(e.target.value === -1 ? null : e.target.value)}
        sx={{ fontSize: 12, height: 28, minWidth: 130 }}
      >
        <MenuItem value={-1}>All plots</MenuItem>
        {plots.map((p, i) => <MenuItem key={i} value={i}>{p.title || `Plot ${i + 1}`}</MenuItem>)}
      </Select>
    )}

    {focusIdx != null && plots && (
      <>
        <Tooltip title="Previous"><span>
          <IconButton size="small" disabled={plots.length < 2}
            onClick={() => onFocusIdx((focusIdx - 1 + plots.length) % plots.length)}>
            <ArrowBackIosNewIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </span></Tooltip>
        <Tooltip title="Next"><span>
          <IconButton size="small" disabled={plots.length < 2}
            onClick={() => onFocusIdx((focusIdx + 1) % plots.length)}>
            <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </span></Tooltip>
      </>
    )}

    <Tooltip title={interactive ? 'Disable interaction' : 'Enable interaction — drag to box zoom, scroll to zoom x'}>
      <IconButton size="small" onClick={onToggleInteractive} color={interactive ? 'primary' : 'default'}>
        <TouchAppIcon fontSize="small" />
      </IconButton>
    </Tooltip>

    <Tooltip title="Reset zoom">
      <IconButton size="small" onClick={onResetZoom}>
        <ZoomOutMapIcon fontSize="small" />
      </IconButton>
    </Tooltip>

    <Tooltip title="Toggle legend">
      <IconButton size="small" onClick={onToggleLegend} color={showLegend ? 'primary' : 'default'}>
        <LegendToggleIcon fontSize="small" />
      </IconButton>
    </Tooltip>

    <Tooltip title="Download CSV">
      <IconButton size="small" onClick={onDownloadAll}><DownloadIcon fontSize="small" /></IconButton>
    </Tooltip>
  </Box>
);

// ─── Main window ──────────────────────────────────────────────────────────────
const D3GraphWindow = memo(({ liveGraphData, plotDataUrl, isPlotReady, plotError, isSimulating, runtime }) => {
  const [completedData, setCompletedData] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [hoverTime,  setHoverTime]  = useState(null);
  const [xZoom,      setXZoom]      = useState(null);
  const [showLegend, setShowLegend] = useState(false);
  const [focusIdx,   setFocusIdx]   = useState(null);
  const [interactive, setInteractive] = useState(false);
  const [resetKey,    setResetKey]    = useState(0);

  useEffect(() => {
    if (!isPlotReady || !plotDataUrl) { setCompletedData(null); return; }
    setLoading(true); setFetchError(null);
    fetch(plotDataUrl)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
      .then(d => { setCompletedData(d); setLoading(false); })
      .catch(e => { setFetchError(e.message); setLoading(false); });
  }, [isPlotReady, plotDataUrl]);

  const displayData = completedData ?? liveGraphData;

  const handleResetZoom = useCallback(() => {
    setXZoom(null);
    setResetKey(k => k + 1);
  }, []);

  const handleDownloadAll = useCallback(() => displayData?.plots?.forEach(downloadCSV), [displayData]);

  const gridStyle = useMemo(() => {
    if (!displayData) return {};
    const nc = displayData.ncols ?? Math.ceil(Math.sqrt(displayData.plots.length));
    const nr = displayData.nrows ?? Math.ceil(displayData.plots.length / nc);
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${nc}, minmax(0, 1fr))`,
      gridTemplateRows:    `repeat(${nr}, minmax(0, 1fr))`,
      gap: 12, padding: 12,
      width: '100%', height: '100%', boxSizing: 'border-box',
    };
  }, [displayData]);

  const panelProps = {
    hoverTime, onHover: setHoverTime,
    isSimulating, runtime, showLegend,
    xZoom, onXZoom: setXZoom,
    interactive, resetKey,
  };
  const hasError = plotError || fetchError;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ px: 2, py: 0.75, flex: 1 }}>
          {isSimulating ? 'Live Graph' : 'Graph Display'}
        </Typography>
        {displayData && (
          <Toolbar
            plots={displayData.plots}
            focusIdx={focusIdx}
            onFocusIdx={idx => { setFocusIdx(idx); setXZoom(null); }}
            interactive={interactive}
            onToggleInteractive={() => setInteractive(v => !v)}
            onResetZoom={handleResetZoom}
            onDownloadAll={handleDownloadAll}
            showLegend={showLegend}
            onToggleLegend={() => setShowLegend(v => !v)}
          />
        )}
      </Box>

      {hasError && (
        <Alert severity="error" sx={{ mx: 2, my: 1, flexShrink: 0 }}>{plotError || fetchError}</Alert>
      )}

      <Box sx={{ flexGrow: 1, overflow: 'hidden', minHeight: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', gap: 2 }}>
            <CircularProgress size={28} />
            <Typography color="text.secondary">Loading plot data…</Typography>
          </Box>
        )}

        {!loading && displayData && focusIdx == null && (
          <div style={gridStyle}>
            {displayData.plots.map((plot, i) => (
              <D3Panel key={i} plot={plot} {...panelProps}
                onFocus={displayData.plots.length > 1 ? () => { setFocusIdx(i); setXZoom(null); } : null}
                isFocused={false}
              />
            ))}
          </div>
        )}

        {!loading && displayData && focusIdx != null && (
          <Box sx={{ width: '100%', height: '100%', p: 1.5 }}>
            <D3Panel key={focusIdx} plot={displayData.plots[focusIdx]} {...panelProps}
              onFocus={() => { setFocusIdx(null); setXZoom(null); }}
              isFocused
            />
          </Box>
        )}

        {!loading && !displayData && !hasError && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <img src={LandingGraphic} alt="" style={{ objectFit: 'contain', maxWidth: '90%', maxHeight: '90%' }} />
          </Box>
        )}
      </Box>
    </Box>
  );
});

export default D3GraphWindow;
