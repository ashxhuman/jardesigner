import React, { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Box,
  CircularProgress,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';

import { API_BASE_URL } from '../../config.js';

const BASE = `${API_BASE_URL}/neuromorpho`;

export default function NeuromorphoSavedNeurons({ clientId }) {
  const [open, setOpen] = useState(false);
  const [neurons, setNeurons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchNeurons = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/neurons`, {
        headers: { 'X-Client-ID': clientId },
      });
      const data = await resp.json();
      setNeurons(data.neurons || []);
    } catch (e) {
      console.error('Failed to fetch saved neurons:', e);
    } finally {
      setLoading(false);
    }
  };

  // Refresh list whenever dialog opens
  useEffect(() => {
    if (open) fetchNeurons();
  }, [open]);

  const handleDelete = async (neuronId) => {
    setDeleting(neuronId);
    try {
      await fetch(`${BASE}/neurons/${neuronId}`, {
        method: 'DELETE',
        headers: { 'X-Client-ID': clientId },
      });
      setNeurons((prev) => prev.filter((n) => n.neuron_id !== neuronId));
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<FolderIcon />}
        onClick={() => setOpen(true)}
      >
        Saved Neurons
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Saved Neurons</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : neurons.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>
              No neurons saved yet.
            </Typography>
          ) : (
            <List dense>
              {neurons.map((n) => (
                <ListItem key={n.neuron_id} divider>
                  <ListItemText
                    primary={n.neuron_name}
                    secondary={
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        <Chip label={`ID: ${n.neuron_id}`} size="small" />
                        {n.archive && <Chip label={n.archive} size="small" variant="outlined" />}
                        {n.uploaded_at && (
                          <Chip
                            label={new Date(n.uploaded_at).toLocaleDateString()}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleDelete(n.neuron_id)}
                      disabled={deleting === n.neuron_id}
                    >
                      {deleting === n.neuron_id ? (
                        <CircularProgress size={16} />
                      ) : (
                        <DeleteIcon fontSize="small" />
                      )}
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
