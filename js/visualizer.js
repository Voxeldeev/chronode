import { timeToTick } from './parser.js';

export default class Visualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.textCache = {};
        this.scale = 1.0;
        this.resize();
    }

    resize(targetHeight = null) {
        if (targetHeight) {
            this.scale = targetHeight / window.innerHeight;
            this.canvas.width = Math.round(window.innerWidth * this.scale);
            this.canvas.height = targetHeight;
        } else {
            this.scale = 1.0;
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    _getNoteImage(text, color, size) {
        const key = `${text}_${color}_${size}_${this.scale}`;
        if (this.textCache[key]) return this.textCache[key];

        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');
        
        const pixelRatio = (window.devicePixelRatio || 2) * this.scale; 
        const logicalSize = size * 2.5;

        offscreenCanvas.width = logicalSize * pixelRatio;
        offscreenCanvas.height = logicalSize * pixelRatio;

        offscreenCtx.scale(pixelRatio, pixelRatio);

        offscreenCtx.fillStyle = color;
        offscreenCtx.font = `${size}px monospace`;
        offscreenCtx.textAlign = 'center';
        offscreenCtx.textBaseline = 'middle';
        offscreenCtx.fillText(text, logicalSize / 2, logicalSize / 2);

        offscreenCanvas.logicalSize = logicalSize;

        this.textCache[key] = offscreenCanvas;
        return offscreenCanvas;
    }

    _getPitchBend(event, currentOffset) {
        for (let i = 0; i < event.points.length - 1; i++) {
            const p1 = event.points[i];
            const p2 = event.points[i+1];
            if (currentOffset >= p1.timeOffset && currentOffset <= p2.timeOffset) {
                const t = (currentOffset - p1.timeOffset) / (p2.timeOffset - p1.timeOffset);
                return p1.pitchBend + (p2.pitchBend - p1.pitchBend) * t;
            }
        }
        return event.points[event.points.length - 1].pitchBend || 0;
    }

    draw(activeEvents, currentTime, songData, VISUAL_SETTINGS) {
        const logicalWidth = window.innerWidth;
        const logicalHeight = window.innerHeight;

        this.ctx.save();
        this.ctx.scale(this.scale, this.scale);

        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, logicalWidth, logicalHeight);

        const centerX = logicalWidth / 2;
        const centerY = logicalHeight / 2;
        const maxRadius = Math.min(centerX, centerY) * 0.85; 
        const orbitRadius = maxRadius + 40; 

        this._drawOrbitalTrail(currentTime, songData, centerX, centerY, orbitRadius);
        this._drawMelodicLines(activeEvents, currentTime, VISUAL_SETTINGS, songData, centerX, centerY, maxRadius);
        this._drawNotesAndPercussion(activeEvents, currentTime, VISUAL_SETTINGS, songData, centerX, centerY, maxRadius, orbitRadius);
        
        this.ctx.restore();
    }

    _drawOrbitalTrail(currentTime, songData, centerX, centerY, orbitRadius) {
        const currentGlobalTick = timeToTick(currentTime, songData.segments, songData.tpb);
        const standardTicksPerBar = songData.tpb * songData.bpb;
        
        let currentBarIndex = Math.floor(currentGlobalTick / standardTicksPerBar);
        if (currentBarIndex >= songData.barLengths.length) currentBarIndex = songData.barLengths.length - 1;
        
        const currentBarStartTick = currentBarIndex * standardTicksPerBar;
        const ticksInBar = songData.barLengths[currentBarIndex];

        const measureProgress = ticksInBar > 0 ? (currentGlobalTick - currentBarStartTick) / ticksInBar : 0;
        const orbitRotation = (measureProgress * Math.PI * 2) - (Math.PI / 2);

        const tailAngle = orbitRotation - (Math.PI / 4);
        const headAngle = orbitRotation;

        const tailX = centerX + Math.cos(tailAngle) * orbitRadius;
        const tailY = centerY + Math.sin(tailAngle) * orbitRadius;
        const headX = centerX + Math.cos(headAngle) * orbitRadius;
        const headY = centerY + Math.sin(headAngle) * orbitRadius;

        const cometGradient = this.ctx.createLinearGradient(tailX, tailY, headX, headY);
        cometGradient.addColorStop(0, 'rgba(255, 255, 255, 0)'); 
        cometGradient.addColorStop(1, 'rgba(255, 255, 255, 1)'); 

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = cometGradient;
        
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, orbitRadius, tailAngle, headAngle);
        this.ctx.stroke();
    }

    _drawMelodicLines(activeEvents, currentTime, VISUAL_SETTINGS, songData, centerX, centerY, maxRadius) {
        activeEvents.forEach(event => {
            if (event.isPerc || currentTime > event.endTime) return; 

            const lineColor = event.color || 'white';
            const boundedTime = Math.max(event.startTime, Math.min(currentTime, event.endTime));
            const currentOffset = boundedTime - event.startTime;
            const currentBend = this._getPitchBend(event, currentOffset); 

            let lineStartRatio = 0;
            let lineEndRatio = 1;

            if (currentTime < event.startTime) {
                const progress = (currentTime - (event.startTime - VISUAL_SETTINGS.lineShotTime)) / VISUAL_SETTINGS.lineShotTime;
                lineEndRatio = Math.max(0, Math.min(1, progress));
            } else if (currentTime > event.endTime - VISUAL_SETTINGS.lineShotTime) {
                const progress = (currentTime - (event.endTime - VISUAL_SETTINGS.lineShotTime)) / VISUAL_SETTINGS.lineShotTime;
                lineStartRatio = Math.max(0, Math.min(1, progress));
            }

            if (lineEndRatio <= lineStartRatio) return;

            const reversedLayerIndex = (songData.renderedChannelCount - event.layerIndex) + 1;

            const ringRadius = VISUAL_SETTINGS.useFixedOrbitalSpacing 
                ? reversedLayerIndex * VISUAL_SETTINGS.fixedOrbitalSpacing 
                : (maxRadius / songData.renderedChannelCount) * reversedLayerIndex;

            event.pitches.forEach(pitch => {
                const c_rpc = pitch + currentBend; 
                const angle = (c_rpc * 7 * (Math.PI * 2) / 12) - (Math.PI / 2);
                
                const startX = centerX + Math.cos(angle) * ringRadius * lineStartRatio;
                const startY = centerY + Math.sin(angle) * ringRadius * lineStartRatio;
                const endX = centerX + Math.cos(angle) * ringRadius * lineEndRatio;
                const endY = centerY + Math.sin(angle) * ringRadius * lineEndRatio;

                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.strokeStyle = lineColor;
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            });
        });
    }

    _drawNotesAndPercussion(activeEvents, currentTime, VISUAL_SETTINGS, songData, centerX, centerY, maxRadius, orbitRadius) {
        const percRadii = { 'kick': -16, 'snare': -8, 'othp': 0, 'chh': 8, 'ohh': 16 };
        const noteNames = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

        activeEvents.forEach(event => {
            const boundedTime = Math.max(event.startTime, Math.min(currentTime, event.endTime));
            const currentOffset = boundedTime - event.startTime;
            const currentBend = this._getPitchBend(event, currentOffset);

            if (event.isPerc) {
                if (currentTime < event.startTime || currentTime > event.endTime) return; 

                const percColor = event.color || 'white';
                
                const fadeProgress = (currentTime - event.startTime) / event.duration;
                const angle = (event.tickProgress * Math.PI * 2) - (Math.PI / 2);
                const radius = orbitRadius + percRadii[event.tag];
                
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;

                this.ctx.save();
                this.ctx.translate(x, y);
                this.ctx.rotate(angle);
                this.ctx.globalAlpha = Math.max(0, 1 - fadeProgress);

                this.ctx.lineWidth = 1.5;
                this.ctx.strokeStyle = percColor;
                this.ctx.fillStyle = percColor;
                this.ctx.beginPath();

                if (event.tag === 'kick') {
                    this.ctx.moveTo(5, 0); this.ctx.lineTo(0, 5); this.ctx.lineTo(-5, 0); this.ctx.lineTo(0, -5); this.ctx.fill();
                } else if (event.tag === 'snare') {
                    this.ctx.moveTo(-5, 0); this.ctx.lineTo(5, 0);
                    this.ctx.moveTo(-2.5, -4.33); this.ctx.lineTo(2.5, 4.33);
                    this.ctx.moveTo(-2.5, 4.33); this.ctx.lineTo(2.5, -4.33); this.ctx.stroke();
                } else if (event.tag === 'chh') {
                    this.ctx.moveTo(5, 0); this.ctx.lineTo(-3, -4); this.ctx.lineTo(-3, 4); this.ctx.closePath(); this.ctx.stroke();
                } else if (event.tag === 'ohh') {
                    this.ctx.moveTo(-5, 0); this.ctx.lineTo(3, -4); this.ctx.lineTo(3, 4); this.ctx.closePath(); this.ctx.fill();
                } else if (event.tag === 'othp') {
                    for (let i = 0; i < 5; i++) {
                        const penAngle = i * (Math.PI * 2) / 5;
                        if (i === 0) this.ctx.moveTo(Math.cos(penAngle) * 5, Math.sin(penAngle) * 5);
                        else this.ctx.lineTo(Math.cos(penAngle) * 5, Math.sin(penAngle) * 5);
                    }
                    this.ctx.closePath(); this.ctx.stroke();
                }
                
                this.ctx.restore();

            } else {
                if (currentTime < event.startTime) return; 

                const noteColor = event.color || 'white';
                let baseNoteRadius = 16;
                if (event.tag === 'sml') baseNoteRadius = 8;
                else if (event.tag === 'lrg') baseNoteRadius = 24;
                else if (event.tag === 'tri') baseNoteRadius = 20;

                baseNoteRadius *= VISUAL_SETTINGS.dotRadiusScale;

                const isPoly = ['tri', 'sqr', 'pnt', 'hex'].includes(event.tag);
                const isGhost = currentTime > event.endTime;
                
                let ghostProgress = 0;
                if (isGhost && VISUAL_SETTINGS.decayTime > 0) {
                    ghostProgress = Math.min(1, (currentTime - event.endTime) / VISUAL_SETTINGS.decayTime); 
                } else if (isGhost) {
                    ghostProgress = 1; 
                }

                const currentAlpha = isGhost ? 1 - ghostProgress : 1;
                const currentLineWidth = isGhost ? 2 * (1 - ghostProgress) : 2;
                const currentRadius = isGhost ? baseNoteRadius + (ghostProgress * 8) : baseNoteRadius;

                const reversedLayerIndex = (songData.renderedChannelCount - event.layerIndex) + 1;

                const ringRadius = VISUAL_SETTINGS.useFixedOrbitalSpacing 
                    ? reversedLayerIndex * VISUAL_SETTINGS.fixedOrbitalSpacing 
                    : (maxRadius / songData.renderedChannelCount) * reversedLayerIndex;

                event.pitches.forEach(pitch => {
                    const c_rpc = pitch + currentBend; 
                    const angle = (c_rpc * 7 * (Math.PI * 2) / 12) - (Math.PI / 2);
                    
                    const x = centerX + Math.cos(angle) * ringRadius;
                    const y = centerY + Math.sin(angle) * ringRadius;

                    this.ctx.save();
                    this.ctx.globalAlpha = currentAlpha;

                    if (isPoly) {
                        let sides = 3; 
                        if (event.tag === 'sqr') sides = 4;
                        if (event.tag === 'pnt') sides = 5;
                        if (event.tag === 'hex') sides = 6;

                        this.ctx.translate(x, y);
                        this.ctx.rotate(angle);
                        
                        this.ctx.beginPath();
                        for (let i = 0; i < sides; i++) {
                            const polyAngle = Math.PI + (i * Math.PI * 2 / sides);
                            const px = Math.cos(polyAngle) * currentRadius;
                            const py = Math.sin(polyAngle) * currentRadius;
                            if (i === 0) this.ctx.moveTo(px, py);
                            else this.ctx.lineTo(px, py);
                        }
                        this.ctx.closePath();
                        
                        this.ctx.fillStyle = 'black';
                        this.ctx.fill();
                        
                        if (currentLineWidth > 0) {
                            this.ctx.lineWidth = currentLineWidth;
                            this.ctx.strokeStyle = noteColor;
                            this.ctx.stroke();
                        }
                        
                    } else {
                        this.ctx.beginPath();
                        this.ctx.arc(x, y, currentRadius, 0, Math.PI * 2); 
                        this.ctx.fillStyle = 'black';
                        this.ctx.fill();
                        
                        if (currentLineWidth > 0) {
                            this.ctx.lineWidth = currentLineWidth;
                            this.ctx.strokeStyle = noteColor;
                            this.ctx.stroke();
                        }
                    }
                    
                    this.ctx.restore();
                    
                    if (!isGhost) {
                        const soundingPitch = pitch + currentBend + songData.tonic;
                        const rawPitchClass = Math.round(soundingPitch); 
                        const wrappedPitchClass = ((rawPitchClass % 12) + 12) % 12;
                        const textImg = this._getNoteImage(noteNames[wrappedPitchClass], noteColor, VISUAL_SETTINGS.textSize);
                        
                        this.ctx.drawImage(
                            textImg, 
                            x - (textImg.logicalSize / 2), 
                            (y + 1) - (textImg.logicalSize / 2),
                            textImg.logicalSize,
                            textImg.logicalSize
                        );
                    }
                });
            }
        });
    }
}