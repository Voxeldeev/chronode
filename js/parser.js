// --- HELPER: KEYFRAME TIMELINE MATH ---
export function tickToTime(tick, segments, tpb) {
    if (tick <= 0) return 0;
    const lastSeg = segments[segments.length - 1];
    if (tick >= lastSeg.endTick) return lastSeg.startTimeSeconds + lastSeg.durationSeconds;

    for (let seg of segments) {
        if (tick >= seg.startTick && tick <= seg.endTick) {
            if (seg.durationSeconds === 0) return seg.startTimeSeconds;
            
            const tickOffset = tick - seg.startTick;
            const b1 = seg.startBpm;
            
            if (Math.abs(seg.slope) < 0.001) {
                return seg.startTimeSeconds + (tickOffset * 60 / (b1 * tpb));
            } else {
                const bCurrent = b1 + seg.slope * tickOffset;
                return seg.startTimeSeconds + ((60 / tpb) * (Math.log(bCurrent) - Math.log(b1)) / seg.slope);
            }
        }
    }
    return 0;
}

export function timeToTick(time, segments, tpb) {
    if (time <= 0) return 0;
    const lastSeg = segments[segments.length - 1];
    if (time >= lastSeg.startTimeSeconds + lastSeg.durationSeconds) return lastSeg.endTick;

    for (let seg of segments) {
        if (time >= seg.startTimeSeconds && time <= seg.startTimeSeconds + seg.durationSeconds) {
            if (seg.durationSeconds === 0) return seg.startTick; 
            
            const timeOffset = time - seg.startTimeSeconds;
            const b1 = seg.startBpm;
            
            if (Math.abs(seg.slope) < 0.001) {
                return seg.startTick + (timeOffset * b1 * tpb / 60);
            } else {
                const K = timeOffset * seg.slope * tpb / 60;
                return seg.startTick + (b1 / seg.slope) * (Math.exp(K) - 1);
            }
        }
    }
    return 0;
}

// --- 1. THE PARSER ---
export function parseBeepboxData(json) {
    const defaultBpm = json.beatsPerMinute;
    const tpb = json.ticksPerBeat;
    const bpb = json.beatsPerBar;
    
    const standardTicksPerBar = tpb * bpb;

    const keyString = json.key || "C";
    const keyMap = {"C":0, "C#":1, "Db":1, "D":2, "D#":3, "Eb":3, "E":4, "F":5, "F#":6, "Gb":6, "G":7, "G#":8, "Ab":8, "A":9, "A#":10, "Bb":10, "B":11};
    const tonicPitch = keyMap[keyString] !== undefined ? keyMap[keyString] : 0;

    const percTags = ['kick', 'snare', 'chh', 'ohh', 'othp'];
    
    const maxBars = json.channels[0].sequence.length; 
    const totalTicks = maxBars * standardTicksPerBar;
    
    let isTickCut = new Array(totalTicks).fill(false);
    let barLengths = new Array(maxBars).fill(standardTicksPerBar);
    let bpmAtTick = new Array(totalTicks).fill(-1); 
    
    let keyframes = new Set();
    keyframes.add(0);
    keyframes.add(totalTicks);
    for (let b = 0; b <= maxBars; b++) keyframes.add(b * standardTicksPerBar);

    json.channels.forEach(channel => {
        if (channel.type === "mod") {
            channel.sequence.forEach((patternIndex, barIndex) => {
                if (patternIndex === 0) return;
                const pattern = channel.patterns[patternIndex - 1];
                if (!pattern || !pattern.notes) return;

                const instrumentIndex = (pattern.instruments && pattern.instruments.length > 0) ? pattern.instruments[0] - 1 : 0;
                const instrument = channel.instruments[instrumentIndex];

                if (!instrument || !instrument.modChannels || !instrument.modSettings) return;

                let nextBarPitch = -1;
                let tempoPitch = -1;

                for (let x = 0; x < instrument.modChannels.length; x++) {
                    if (instrument.modChannels[x] === -1) { 
                        if (instrument.modSettings[x] === 4) nextBarPitch = instrument.modChannels.length - 1 - x;
                        if (instrument.modSettings[x] === 2) tempoPitch = instrument.modChannels.length - 1 - x;
                    }
                }

                const barStartTick = barIndex * standardTicksPerBar;

                pattern.notes.forEach(note => {
                    if (nextBarPitch !== -1 && note.pitches.includes(nextBarPitch)) {
                        const triggerTick = barStartTick + note.points[0].tick;
                        isTickCut[triggerTick] = true; 
                        barLengths[barIndex] = note.points[0].tick;
                        keyframes.add(triggerTick);
                    }

                    if (tempoPitch !== -1 && note.pitches.includes(tempoPitch)) {
                        for (let i = 0; i < note.points.length - 1; i++) {
                            const p1 = note.points[i];
                            const p2 = note.points[i+1];
                            const startGlobalTick = barStartTick + p1.tick;
                            const endGlobalTick = barStartTick + p2.tick;
                            
                            keyframes.add(startGlobalTick);
                            keyframes.add(endGlobalTick);
                            
                            for (let t = startGlobalTick; t < endGlobalTick; t++) {
                                const progress = (t - startGlobalTick) / (endGlobalTick - startGlobalTick);
                                bpmAtTick[t] = (p1.volume + 1) + (p2.volume - p1.volume) * progress;
                            }
                        }
                        
                        const lastPoint = note.points[note.points.length - 1];
                        const lastGlobalTick = barStartTick + lastPoint.tick;
                        keyframes.add(lastGlobalTick);
                        
                        if (lastGlobalTick < totalTicks) bpmAtTick[lastGlobalTick] = lastPoint.volume + 1;
                        for (let t = lastGlobalTick; t < barStartTick + standardTicksPerBar; t++) {
                            bpmAtTick[t] = lastPoint.volume + 1; 
                        }
                    }
                });
            });
        }
    });

    let currentTempo = defaultBpm;
    for (let t = 0; t < totalTicks; t++) {
        if (bpmAtTick[t] !== -1) currentTempo = bpmAtTick[t];
        else bpmAtTick[t] = currentTempo;
    }

    let criticalTicks = Array.from(keyframes).sort((a, b) => a - b);
    let segments = [];
    let currentAbsTime = 0;

    for (let i = 0; i < criticalTicks.length - 1; i++) {
        let tStart = criticalTicks[i];
        let tEnd = criticalTicks[i+1];
        
        let barIndex = Math.floor(tStart / standardTicksPerBar);
        let tickWithinBar = tStart % standardTicksPerBar;
        
        let duration = 0;
        let startBpm = bpmAtTick[tStart];
        let endBpm = startBpm;
        
        if (tickWithinBar >= barLengths[barIndex]) {
            duration = 0;
        } else {
            let slope = 0;
            if (tStart + 1 < totalTicks) slope = bpmAtTick[tStart + 1] - bpmAtTick[tStart];
            endBpm = startBpm + slope * (tEnd - tStart);

            if (Math.abs(endBpm - startBpm) < 0.001) {
                duration = (tEnd - tStart) * 60 / (startBpm * tpb);
            } else {
                duration = (tEnd - tStart) * (60 / tpb) * (Math.log(endBpm) - Math.log(startBpm)) / (endBpm - startBpm);
            }
        }

        segments.push({
            startTick: tStart,
            endTick: tEnd,
            startTimeSeconds: currentAbsTime,
            durationSeconds: duration,
            startBpm: startBpm,
            endBpm: endBpm,
            slope: (tEnd > tStart) ? (endBpm - startBpm) / (tEnd - tStart) : 0
        });

        currentAbsTime += duration;
    }

    let eventList = [];
    let renderedChannelCount = 0;

    json.channels.forEach((channel, channelIndex) => {
        if (channel.type === "mod") return;

        let tag = "default";
        let customColor = null;

        if (channel.name && channel.name.includes('.')) {
            const parts = channel.name.split('.');
            tag = parts[0].toLowerCase().trim();
            if (parts.length > 1 && parts[1].trim().startsWith('#')) {
                customColor = parts[1].trim();
            }
        }

        if (tag === 'omit') return;
        if (!percTags.includes(tag)) renderedChannelCount++;

        channel.sequence.forEach((patternIndex, barIndex) => {
            if (patternIndex === 0) return; 

            const pattern = channel.patterns[patternIndex - 1];
            if (!pattern || !pattern.notes) return;

            const absoluteBarStartTime = tickToTime(barIndex * standardTicksPerBar, segments, tpb);
            const physicalBarEndTick = (barIndex * standardTicksPerBar) + barLengths[barIndex];
            const currentMeasureDuration = tickToTime(physicalBarEndTick, segments, tpb) - absoluteBarStartTime;

            pattern.notes.forEach(note => {
                const globalStartTick = (barIndex * standardTicksPerBar) + note.points[0].tick;
                const globalEndTick = (barIndex * standardTicksPerBar) + Math.min(note.points[note.points.length - 1].tick, barLengths[barIndex]);

                if (globalStartTick >= globalEndTick) return; 

                let startTime = tickToTime(globalStartTick, segments, tpb);
                let endTime = tickToTime(globalEndTick, segments, tpb);
                let duration = endTime - startTime;

                if (percTags.includes(tag)) {
                    endTime = absoluteBarStartTime + currentMeasureDuration;
                    duration = currentMeasureDuration;
                }

                const tickProgress = barLengths[barIndex] > 0 ? (note.points[0].tick / barLengths[barIndex]) : 0;

                const parsedPoints = note.points.map(p => {
                    const pointGlobalTick = (barIndex * standardTicksPerBar) + p.tick;
                    return {
                        timeOffset: tickToTime(pointGlobalTick, segments, tpb) - startTime,
                        pitchBend: p.pitchBend || 0
                    };
                });

                eventList.push({
                    channel: channelIndex,
                    tag: tag,
                    color: customColor, 
                    pitches: note.pitches, 
                    points: parsedPoints,
                    startTime: startTime,      
                    endTime: endTime,          
                    duration: duration,
                    tickProgress: tickProgress 
                });
            });
        });
    });

    renderedChannelCount = Math.max(1, renderedChannelCount); 

    return {
        tonic: tonicPitch,
        tpb: tpb,
        bpb: bpb,
        renderedChannelCount: renderedChannelCount,
        events: eventList.sort((a, b) => a.startTime - b.startTime),
        segments: segments,
        barLengths: barLengths
    };
}