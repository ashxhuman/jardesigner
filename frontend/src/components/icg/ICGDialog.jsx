import React from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ICGApp from './ICGApp';

const HEADER_BG = '#1a3a5c';
const ICG_ORANGE = '#e8952a';
const ICG_BLUE   = '#4a7fb5';

function ICGLogo({ fontSize = '2rem' }) {
  const cap = { fontWeight: 800, fontSize: `calc(${fontSize} * 1.15)`, lineHeight: 1 };
  const low = { fontWeight: 500, fontSize, lineHeight: 1 };
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0 }}>
      <Box component="span" sx={{ ...cap, color: ICG_ORANGE }}>I</Box>
      <Box component="span" sx={{ ...low, color: ICG_ORANGE }}>on</Box>
      <Box component="span" sx={{ ...cap, color: ICG_ORANGE }}>C</Box>
      <Box component="span" sx={{ ...low, color: ICG_ORANGE }}>hannel</Box>
      <Box component="span" sx={{ ...cap, color: ICG_BLUE }}>G</Box>
      <Box component="span" sx={{ ...low, color: ICG_BLUE }}>enealogy</Box>
    </Box>
  );
}

function ICGHeader() {
  return (
    <Box
      sx={{
        bgcolor: HEADER_BG,
        px: 3,
        py: 2,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ICGLogo fontSize="1.75rem" />
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.75 }}>
        Search ion channel models from the IonChannelGenealogy Omnimodel · powered by moose.channels
      </Typography>
    </Box>
  );
}

export default function ICGDialog({ open, onClose, onChanImport }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      fullWidth
      maxWidth="lg"
      PaperProps={{ sx: { height: '90vh', borderRadius: 2 } }}
    >
      <DialogTitle sx={{ position: 'relative', p: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
        <a
          href="http://icg.neurotheory.ox.ac.uk"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none' }}
        >
          <ICGHeader />
        </a>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          <ICGApp onChanImport={onChanImport} onClose={onClose} />
        </Box>
      </DialogContent>

      <Typography
        variant="caption"
        sx={{ display: 'flex', justifyContent: 'center', gap: '6px', p: 1.5, color: 'text.secondary' }}
      >
        Channel data from{' '}
        <a href="http://icg.neurotheory.ox.ac.uk" target="_blank" rel="noopener noreferrer">
          IonChannelGenealogy
        </a>
        {' '}· Chintaluri et al. 2025 ·{' '}
        <a href="https://modeldb.science" target="_blank" rel="noopener noreferrer">
          ModelDB
        </a>
      </Typography>
    </Dialog>
  );
}
