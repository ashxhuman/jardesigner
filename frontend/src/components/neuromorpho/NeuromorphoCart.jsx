import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Stack,
  Divider,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

const BASE = 'http://localhost:5000/neuromorpho';

export default function NeuromorphoCart({ cart, onCartChange, clientId }) {
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleRemove = (neuronId) => {
    onCartChange(cart.filter((id) => id !== neuronId));
  };

  const handleSave = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const resp = await fetch(`${BASE}/save-cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': clientId,
        },
        body: JSON.stringify({ neuron_ids: cart }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Save failed');
      setSnackbar({
        open: true,
        message: `Saved ${data.total_saved} of ${data.total_requested} neurons.${data.total_failed > 0 ? ` ${data.total_failed} failed.` : ''}`,
        severity: data.total_saved > 0 ? 'success' : 'error',
      });
      if (data.total_saved > 0) onCartChange([]);
    } catch (e) {
      setSnackbar({ open: true, message: e.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (cart.length === 0) return null;

  return (
    <>
      <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Cart ({cart.length})
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
          >
            {saving ? 'Saving…' : 'Save All'}
          </Button>
        </Stack>
        <Divider sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {cart.map((id) => (
            <Chip
              key={id}
              label={`ID: ${id}`}
              onDelete={() => handleRemove(id)}
              size="small"
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
