import React, { useRef, useEffect, useMemo, useState, memo, useContext } from 'react';
import {
    Box, Button, Typography, TextField, FormControlLabel, Checkbox, Slider,
    Tooltip, Drawer, IconButton, Divider, Radio, RadioGroup, FormControl, FormLabel
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SettingsIcon from '@mui/icons-material/Settings';
import ThreeDManager from './ThreeDManager';
import { getColor } from './colormap';
import { ReplayContext } from './ReplayContext';

const ColorBar = ({ displayConfig, entityConfig, currentRange, readoutTitle }) => {
    const gradient = useMemo(() => {
        const colormap = displayConfig?.colormap || 'jet';
        const stops = Array.from({ length: 11 }, (_, i) => {
            const value = i / 10;
            return `${getColor(value, colormap)} ${i * 10}%`;
        }).join(', ');
        return `linear-gradient(to top, ${stops})`;
    }, [displayConfig?.colormap]);

    const formatColorBarLabel = (num) => {
        if (num === null || !isFinite(num)) return 'N/A';
        const absNum = Math.abs(num);
        if (absNum > 0 && (absNum < 0.01 || absNum >= 10000)) {
            return num.toExponential(1);
        }
        return parseFloat(num.toPrecision(3)).toString();
    };

    if (!displayConfig || !entityConfig) {
        return null;
    }

    const vmin = currentRange.vmin !== '' ? parseFloat(currentRange.vmin) : entityConfig.vmin;
    const vmax = currentRange.vmax !== '' ? parseFloat(currentRange.vmax) : entityConfig.vmax;

    return (
        <Box sx={{
            position: 'absolute', left: '16px', top: '16px', display: 'flex', flexDirection: 'column',
            gap: 1, color: 'black', textShadow: '0 0 2px white', pointerEvents: 'none'
        }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{readoutTitle}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: '20px', height: '150px', background: gradient, border: '1px solid black', borderRadius: '4px' }} />
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '150px' }}>
                    <Typography variant="caption">{formatColorBarLabel(vmax)}</Typography>
                    <Typography variant="caption">{formatColorBarLabel(vmin)}</Typography>
                </Box>
            </Box>
        </Box>
    );
};

const ThreeDViewer = (props) => {
  const {
    isSimulating, threeDConfig, onSelectionChange, onManagerReady,
    simulationFrames, drawableVisibility, setDrawableVisibility,
    isReplaying, onStartReplay, onPauseReplay, onSeekReplay, replayInterval, setReplayInterval, totalRuntime,
    explodeAxis, onExplodeAxisToggle, onSceneBuilt,
    defaultDiaScale,
    clickSelected
  } = props;

  const { replayTime } = useContext(ReplayContext);

  const mountRef = useRef(null);
  const managerRef = useRef(null);
  const [colorRanges, setColorRanges] = useState({});
  const [displayConfig, setDisplayConfig] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activeDrawableId, setActiveDrawableId] = useState(null);

  const showReplayControls = !isSimulating && simulationFrames.length > 0;
  const showSetupControls = !isSimulating && simulationFrames.length === 0;
  const drawables = useMemo(() => threeDConfig?.drawables || [], [threeDConfig]);

  const activeDrawable = useMemo(() => drawables.find(d => d.groupId === activeDrawableId), [drawables, activeDrawableId]);

  const activeColorRange = colorRanges[activeDrawable?.groupId] || { vmin: '', vmax: '' };
  const displayedSimPath = clickSelected.length > 0 ? clickSelected[clickSelected.length - 1].simPath : '';

  useEffect(() => {
    if (mountRef.current) {
        managerRef.current = new ThreeDManager(mountRef.current, onSelectionChange, defaultDiaScale);
        if (onManagerReady) onManagerReady(managerRef.current);
    }
    return () => {
        managerRef.current?.dispose();
        if (onManagerReady) onManagerReady(null);
    };
  }, [onSelectionChange, onManagerReady, defaultDiaScale]);

  useEffect(() => {
    if (managerRef.current && threeDConfig) {
      managerRef.current.buildScene(threeDConfig);
      if (onSceneBuilt) onSceneBuilt(managerRef.current.getBoundingBoxSize());

      const initialVisibility = {};
      const initialColorRanges = {};
      (threeDConfig?.drawables || []).forEach(d => {
          initialVisibility[d.groupId] = true;
          initialColorRanges[d.groupId] = { vmin: d.vmin?.toString() || '0', vmax: d.vmax?.toString() || '0' };
      });
      setDrawableVisibility(initialVisibility);
      setColorRanges(initialColorRanges);
      setDisplayConfig(threeDConfig);

      if (threeDConfig.drawables && threeDConfig.drawables.length > 0) {
        setActiveDrawableId(threeDConfig.drawables[0].groupId);
      }
    }
  }, [threeDConfig, setDrawableVisibility, onSceneBuilt]);

  useEffect(() => {
    if (managerRef.current) {
        for (const groupId in colorRanges) {
            const { vmin, vmax } = colorRanges[groupId];
            const vminNum = parseFloat(vmin); const vmaxNum = parseFloat(vmax);
            if (!isNaN(vminNum) && !isNaN(vmaxNum)) managerRef.current.updateColorRange(groupId, { vmin: vminNum, vmax: vmaxNum });
        }
    }
  }, [colorRanges]);

  useEffect(() => {
      if (managerRef.current) {
          managerRef.current.setDrawableVisibility(drawableVisibility);
          managerRef.current.setActiveGroupId(activeDrawableId);
      }
  }, [drawableVisibility, activeDrawableId]);

  const handleAutoscale = () => {
      if (!simulationFrames || simulationFrames.length === 0 || !activeDrawable) return;
      const targetGroupId = activeDrawable.groupId;
      let globalMin = Infinity; let globalMax = -Infinity;
      simulationFrames.forEach(frame => {
          if (frame.groupId === targetGroupId) frame.data.forEach(value => {
              if (value < globalMin) globalMin = value;
              if (value > globalMax) globalMax = value;
          });
      });
      if (isFinite(globalMin) && isFinite(globalMax)) {
           setColorRanges(prev => ({ ...prev, [targetGroupId]: { vmin: globalMin.toExponential(2), vmax: globalMax.toExponential(2) } }));
      }
  };
  const handleColorRangeChange = (key, value) => {
      if (!activeDrawable) return;
      const targetGroupId = activeDrawable.groupId;
      setColorRanges(prev => ({ ...prev, [targetGroupId]: { ...prev[targetGroupId], [key]: value } }));
  };
  const handleVisibilityChange = (groupId, isChecked) => { setDrawableVisibility(prev => ({ ...prev, [groupId]: isChecked })); };

  const keybindingsText = `Arrow keys: move display
<>,. : zoom in and out.
Dd: scale diameter of selected readout.
Pp: Pitch
Yy: Yaw
Rr: Roll
Aa: Auto-position`;

  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Main Control Bar (Always Visible) */}
        <Box sx={{ p: 1, borderBottom: '1px solid #ccc', background: '#f5f5f5', flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            {/* Replay controls */}
            {showReplayControls && (
                <>
                    <Button
                        variant="outlined" size="small" onClick={isReplaying ? onPauseReplay : onStartReplay}
                        startIcon={isReplaying ? <PauseIcon /> : <PlayArrowIcon />}
                        sx={{ width: '140px', justifyContent: 'flex-start' }}
                    >
                        {isReplaying ? "Pause" : "Replay"}
                    </Button>
                    <TextField size="small" label="Time (s)" value={replayTime.toFixed(4)} InputProps={{ readOnly: true }} sx={{ width: '120px' }}/>
                    <Box sx={{ width: '280px', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="caption">0</Typography>
                        <Slider min={0} max={totalRuntime} step={Math.max(totalRuntime/1000, 1e-6)} value={Math.min(replayTime, totalRuntime)} onChangeCommitted={(e, v)=> onSeekReplay(v)} aria-label="progress slider"
                            sx={{ '& .MuiSlider-thumb': { transition: 'none' }, '& .MuiSlider-track': { transition: 'none' } }}
                        />
                        <Typography variant="caption">{totalRuntime.toFixed(2)}s</Typography>
                    </Box>
                    <TextField
                        label="Selected Path" size="small" variant="outlined" value={displayedSimPath}
                        InputProps={{ readOnly: true }} sx={{ minWidth: '20ch' }}
                    />
                </>
            )}

            {/* Setup controls */}
            {showSetupControls && (
                <TextField
                    label="Selected Path" size="small" variant="outlined" value={displayedSimPath}
                    InputProps={{ readOnly: true }} sx={{ minWidth: '30ch' }}
                />
            )}

            {/* Spacer and Settings Icon */}
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title="View Options">
                <IconButton onClick={() => setIsPanelOpen(true)}>
                    <SettingsIcon />
                </IconButton>
            </Tooltip>
        </Box>

        {/* The Collapsible Side Panel (Drawer) */}
        <Drawer anchor="left" open={isPanelOpen} onClose={() => setIsPanelOpen(false)}>
            <Box sx={{ width: 350, p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Typography variant="h6">View Options</Typography>
                <Divider />

                {drawables.length > 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Visible Readouts:</Typography>
                        {drawables.map(d => (
                            <FormControlLabel key={d.groupId} control={<Checkbox checked={drawableVisibility[d.groupId] ?? true} onChange={(e) => handleVisibilityChange(d.groupId, e.target.checked)} size="small" />}
                                label={<Typography variant="body2">{d.title || d.groupId}</Typography>}
                            />
                        ))}
                    </Box>
                )}
                <Divider />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Readout Colorbar Range:</Typography>
                    <FormControl>
                        <FormLabel id="readout-select-label" sx={{fontSize: '0.8rem', mb: 1}}>Select Readout</FormLabel>
                        <RadioGroup
                            aria-labelledby="readout-select-label"
                            name="readout-select-group"
                            value={activeDrawableId}
                            onChange={(e) => setActiveDrawableId(e.target.value)}
                        >
                            {drawables.map(d => (
                                <FormControlLabel key={d.groupId} value={d.groupId} control={<Radio size="small" />} label={<Typography variant="body2">{d.title || d.groupId}</Typography>} />
                            ))}
                        </RadioGroup>
                    </FormControl>
                    <Button variant="outlined" size="small" onClick={handleAutoscale} disabled={!activeDrawable}>Autoscale</Button>
                    <TextField label="Vmin" size="small" variant="outlined" value={activeColorRange.vmin} onChange={(e) => handleColorRangeChange('vmin', e.target.value)} disabled={!activeDrawable} />
                    <TextField label="Vmax" size="small" variant="outlined" value={activeColorRange.vmax} onChange={(e) => handleColorRangeChange('vmax', e.target.value)} disabled={!activeDrawable} />
                </Box>
                <Divider />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Explode cell on axis:</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-around' }}>
                        <FormControlLabel control={<Checkbox checked={explodeAxis.x} onChange={() => onExplodeAxisToggle('x')} size="small" />} label="X" />
                        <FormControlLabel control={<Checkbox checked={explodeAxis.y} onChange={() => onExplodeAxisToggle('y')} size="small" />} label="Y" />
                        <FormControlLabel control={<Checkbox checked={explodeAxis.z} onChange={() => onExplodeAxisToggle('z')} size="small" />} label="Z" />
                    </Box>
                </Box>
                <Divider />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>Frame dt</Typography>
                    <Tooltip title="Playback Speed (Slower -> Faster)">
                        <Slider value={replayInterval} onChange={(e, newValue) => setReplayInterval(newValue)} aria-labelledby="replay-speed-slider" valueLabelDisplay="off" min={5} max={500} step={5} inverted />
                    </Tooltip>
                    <Box sx={{ minWidth: '55px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', p: '4px' }}>
                        <Typography variant="caption">{replayInterval}ms</Typography>
                    </Box>
                </Box>
                <Divider />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Keybindings</Typography>
                    <Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>
                        {keybindingsText}
                    </Typography>
                </Box>
            </Box>
        </Drawer>

        {/* 3D Viewer Area */}
        <Box sx={{ position: 'relative', flexGrow: 1 }}>
            <Box ref={mountRef} sx={{ height: '100%', width: '100%', background: '#FFFFFF' }} />
            {((isSimulating || simulationFrames.length > 0) && activeDrawable) && (
                <ColorBar
                    displayConfig={displayConfig}
                    entityConfig={activeDrawable}
                    currentRange={activeColorRange}
                    readoutTitle={activeDrawable.title || activeDrawable.groupId}
                />
            )}
        </Box>
    </Box>
  );
};

export default memo(ThreeDViewer);
