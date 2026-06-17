import React from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NMOBanner from '../../assets/DataRepository/NMOBanner.png';
import NeuromorphoApp from './NeuromorphoApp';

export default function NeuromorphoDialog({ open, onClose, clientId, onFileChange }) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            scroll="paper"
            fullWidth
            maxWidth="lg"
            PaperProps={{ sx: { height: '90vh', borderRadius: 2 } }}
        >
            <DialogTitle sx={{
                position: 'relative',
                borderBottom: '1px solid',
                borderColor: 'divider',
                p: 0,
            }}>
                <Box sx={{ position: 'relative' }}>
                    <a href="https://neuromorpho.org" target="_blank" rel="noopener noreferrer" title="Visit NeuroMorpho.Org">
                        <img src={NMOBanner} alt="NeuroMorpho.Org" style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer' }} />
                    </a>
                    <Typography variant="caption" sx={{ position: 'absolute', bottom: 4, right: 8, color: 'rgba(0,0,0,0.75)', fontSize: '0.65rem' }}>
                        © <a href="https://neuromorpho.org" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>NeuroMorpho.Org</a>
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.7)' }}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                    <NeuromorphoApp
                        clientId={clientId}
                        onFileChange={onFileChange}
                        onClose={onClose}
                    />
                </Box>
            </DialogContent>

            <Typography sx={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: 2 }}>
                <span>Data from NeuroMorpho.Org.</span>
                <a href="https://neuromorpho.org/useterm.jsp" target="_blank" rel="noopener noreferrer">Terms of Use</a>
            </Typography>
        </Dialog>
    );
}
