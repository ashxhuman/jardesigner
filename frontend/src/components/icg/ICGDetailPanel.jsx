import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Divider, CircularProgress, Chip, IconButton, Link, Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const BASE = `http://${window.location.hostname}:5000/icg`;

const ION_COLORS = {
  Na:  { bg: '#e3f0ff', border: '#1976d2', text: '#0d47a1' },
  K:   { bg: '#e8f5e9', border: '#388e3c', text: '#1b5e20' },
  Ca:  { bg: '#fff3e0', border: '#f57c00', text: '#e65100' },
  KCa: { bg: '#f3e5f5', border: '#7b1fa2', text: '#4a148c' },
  IH:  { bg: '#fce4ec', border: '#c62828', text: '#b71c1c' },
};

const TRACE_LABELS = {
  1: 'Activation',
  2: 'Inactivation',
  3: 'Deactivation',
  4: 'Action Potential',
  5: 'Ramp',
};

function SectionLabel({ children }) {
  return (
    <Typography variant="caption" sx={{
      fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
      color: 'text.disabled', display: 'block', mb: 0.5,
    }}>
      {children}
    </Typography>
  );
}

function TraceImg({ base, n }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {TRACE_LABELS[n]}
      </Typography>
      <img
        src={`${base}_${n}.png`}
        alt={TRACE_LABELS[n]}
        onError={() => setFailed(true)}
        style={{ width: '100%', display: 'block', borderRadius: 6, marginTop: 4, border: '1px solid #e0e0e0' }}
      />
    </Box>
  );
}

export default function ICGDetailPanel({ row, onClose }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!row) return;
    setDetail(null);
    setError(null);
    setLoading(true);
    const url = row.icg_id
      ? `${BASE}/detail/icg/${row.icg_id}`
      : `${BASE}/detail/${row.modeldb_id}/${row.suffix}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setDetail(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [row?.modeldb_id, row?.suffix, row?.icg_id]);

  if (!row) return null;

  const ionColor = ION_COLORS[row.ion_class] || { bg: '#f3f4f6', border: '#9e9e9e', text: '#424242' };

  return (
    <Box sx={{
      width: 300, flexShrink: 0,
      borderLeft: '1px solid', borderColor: 'divider',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>

      {/* ── Header ── */}
      <Box sx={{ p: 2, pb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {row.suffix}
              </Typography>
              <Box sx={{
                px: 0.9, py: 0.1, borderRadius: 1,
                bgcolor: ionColor.bg, color: ionColor.text,
                border: `1px solid ${ionColor.border}55`,
                fontSize: '0.7rem', fontWeight: 700, lineHeight: 1.6,
              }}>
                {row.ion_class}
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary">
              ModelDB {row.modeldb_id}
              {row.icg_id ? ` · ICG ${row.icg_id}` : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.25, ml: 0.5 }}>
            <Tooltip title="Open in ICGenealogy">
              <IconButton size="small" onClick={() => {
                if (row.fid && row.icg_id) window.open(`https://icg.neurotheory.ox.ac.uk/channels/${row.fid}/${row.icg_id}`, '_blank');
              }}>
                <OpenInNewIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon sx={{ fontSize: '1rem' }} />
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* ── CSV-derived publication info (instant, no fetch) ── */}
      {(row.title || row.authors) && (
        <Box sx={{ px: 2, py: 1.5 }}>
          <SectionLabel>Publication</SectionLabel>
          {row.title && (
            <Typography variant="body2" sx={{ fontStyle: 'italic', mb: 0.5, lineHeight: 1.4 }}>
              {row.title}
            </Typography>
          )}
          {row.authors && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {row.authors}
              {row.year ? ` · ${row.year}` : ''}
            </Typography>
          )}
          {row.pubmedid && (
            <Link
              href={`https://pubmed.ncbi.nlm.nih.gov/${row.pubmedid}/`}
              target="_blank" rel="noopener noreferrer"
              variant="caption" sx={{ display: 'inline-block', mt: 0.5 }}
            >
              PubMed ↗
            </Link>
          )}
          {row.cites > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: row.pubmedid ? 1 : 0 }}>
              {row.pubmedid ? '· ' : ''}{row.cites} citations
            </Typography>
          )}
        </Box>
      )}

      <Divider />

      {/* ── ICG API section: traces + classification + metadata ── */}
      <Box sx={{ px: 2, py: 1.5, flex: 1 }}>

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
            <CircularProgress size={14} thickness={5} />
            <Typography variant="caption" color="text.disabled">Loading ICG data…</Typography>
          </Box>
        )}

        {error && (
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            ICG detail unavailable: {error}
          </Typography>
        )}

        {detail && (
          <Box>
            {/* Trace images */}
            {detail.trace_img_base ? (
              <>
                <SectionLabel>Current Traces</SectionLabel>
                <Box sx={{ mb: 1 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TraceImg key={n} base={detail.trace_img_base} n={n} />
                  ))}
                </Box>
                <Divider sx={{ mb: 1.5 }} />
              </>
            ) : (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5, fontStyle: 'italic' }}>
                No voltage-clamp traces available for this channel.
              </Typography>
            )}

            {/* Classification chips */}
            {detail.cls?.filter(g => !g.name?.toLowerCase().includes('runtime')).length > 0 && (
              <>
                <SectionLabel>Classification</SectionLabel>
                <Box sx={{ mb: 1.5 }}>
                  {detail.cls
                    .filter(g => !g.name?.toLowerCase().includes('runtime'))
                    .map(group => (
                      <Box key={group.id} sx={{ mb: 0.75 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          {group.name}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.25 }}>
                          {group.cls.map(sub => (
                            <Chip key={sub.id} label={sub.name} size="small" variant="outlined"
                              sx={{ height: 18, fontSize: '0.68rem' }} />
                          ))}
                        </Box>
                      </Box>
                    ))}
                </Box>
                <Divider sx={{ mb: 1.5 }} />
              </>
            )}

            {/* Free metadata */}
            {detail.metadata?.length > 0 && (
              <>
                <SectionLabel>Metadata</SectionLabel>
                <Box>
                  {detail.metadata.map(m => m.value ? (
                    <Box key={m.label_id} sx={{ mb: 0.75 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>
                        {m.name}
                      </Typography>
                      <Typography variant="body2">{m.value}</Typography>
                    </Box>
                  ) : null)}
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>

      {/* ── Footer attribution ── */}
      <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.disabled">
          Traces and classification from{' '}
          <Link href="https://icg.neurotheory.ox.ac.uk" target="_blank" rel="noopener noreferrer" variant="caption">
            ICGenealogy
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}
