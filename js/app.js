import { parseBeepboxData } from './parser.js';
import Visualizer from './visualizer.js';

// --- VISUAL SETTINGS (State) ---
const DEFAULT_SETTINGS = {
    textSize: 12,                  
    dotRadiusScale: 1.0,           
    useFixedOrbitalSpacing: false, 
    fixedOrbitalSpacing: 40,       
    decayTime: 0.20,               
    lineShotTime: 0.05             
};

const VISUAL_SETTINGS = { ...DEFAULT_SETTINGS };

let allEvents = [];
let songData = {}; 

const audioEl = document.getElementById('audio');
const visualizer = new Visualizer(document.getElementById('visualizer'));

// UI Elements
const uiPlayPauseBtn = document.getElementById('play-pause');
const uiScrubber = document.getElementById('scrubber');
const uiDropZone = document.getElementById('drop-zone');
const uiMenuToggle = document.getElementById('menu-toggle');
const uiSidebar = document.getElementById('sidebar');

// State
let isJsonLoaded = false;
let isAudioLoaded = false;
let uploadedJsonRaw = null;

// Track filenames for display
let loadedJsonName = "None";
let loadedWavName = "None";

function renderLoop() {
    requestAnimationFrame(renderLoop);
    
    if (!audioEl.paused && audioEl.duration) {
        uiScrubber.value = (audioEl.currentTime / audioEl.duration) * 100;
    }

    const currentTime = audioEl.currentTime;
    
    const activeEvents = allEvents.filter(e => 
        currentTime >= e.startTime - VISUAL_SETTINGS.lineShotTime && 
        currentTime <= e.endTime + VISUAL_SETTINGS.decayTime
    );

    if (songData.segments) {
        // We pass VISUAL_SETTINGS into the draw method explicitly now
        visualizer.draw(activeEvents, currentTime, songData, VISUAL_SETTINGS); 
    }
}
// Start idle render loop to draw background immediately
requestAnimationFrame(renderLoop);

// --- APP CONTROLS & EVENTS ---

uiPlayPauseBtn.addEventListener('click', () => {
    if (audioEl.paused) {
        audioEl.play();
        uiPlayPauseBtn.textContent = '⏸';
    } else {
        audioEl.pause();
        uiPlayPauseBtn.textContent = '▶';
    }
});

audioEl.addEventListener('ended', () => {
    uiPlayPauseBtn.textContent = '▶';
    uiScrubber.value = 0;
});

uiScrubber.addEventListener('input', (e) => {
    if (audioEl.duration) {
        audioEl.currentTime = (e.target.value / 100) * audioEl.duration;
    }
});

uiMenuToggle.addEventListener('click', () => {
    uiSidebar.classList.toggle('open');
});

// Settings Data Binding
const bindSetting = (inputId, displayId, settingKey, isFloat = false) => {
    document.getElementById(inputId).addEventListener('input', (e) => {
        const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
        VISUAL_SETTINGS[settingKey] = val;
        
        let displayStr = val.toString();
        if (settingKey === 'textSize' || settingKey === 'fixedOrbitalSpacing') displayStr += 'px';
        else if (settingKey === 'dotRadiusScale') displayStr += 'x';
        else if (settingKey === 'decayTime' || settingKey === 'lineShotTime') displayStr += 's';
        
        document.getElementById(displayId).textContent = displayStr;
    });
};

bindSetting('set-textSize', 'val-textSize', 'textSize');
bindSetting('set-dotScale', 'val-dotScale', 'dotRadiusScale', true);
bindSetting('set-fixedSpace', 'val-fixedSpace', 'fixedOrbitalSpacing');
bindSetting('set-decay', 'val-decay', 'decayTime', true);
bindSetting('set-shot', 'val-shot', 'lineShotTime', true);

document.getElementById('set-useFixed').addEventListener('change', (e) => {
    VISUAL_SETTINGS.useFixedOrbitalSpacing = e.target.checked;
});

// Reset Settings Button
document.getElementById('btn-reset').addEventListener('click', () => {
    Object.assign(VISUAL_SETTINGS, DEFAULT_SETTINGS);

    document.getElementById('set-textSize').value = VISUAL_SETTINGS.textSize;
    document.getElementById('val-textSize').textContent = VISUAL_SETTINGS.textSize + 'px';

    document.getElementById('set-dotScale').value = VISUAL_SETTINGS.dotRadiusScale;
    document.getElementById('val-dotScale').textContent = VISUAL_SETTINGS.dotRadiusScale.toFixed(1) + 'x';

    document.getElementById('set-useFixed').checked = VISUAL_SETTINGS.useFixedOrbitalSpacing;

    document.getElementById('set-fixedSpace').value = VISUAL_SETTINGS.fixedOrbitalSpacing;
    document.getElementById('val-fixedSpace').textContent = VISUAL_SETTINGS.fixedOrbitalSpacing + 'px';

    document.getElementById('set-decay').value = VISUAL_SETTINGS.decayTime;
    document.getElementById('val-decay').textContent = VISUAL_SETTINGS.decayTime + 's';

    document.getElementById('set-shot').value = VISUAL_SETTINGS.lineShotTime;
    document.getElementById('val-shot').textContent = VISUAL_SETTINGS.lineShotTime + 's';
});

// Drag & Drop Upload with Dynamic Text
uiDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uiDropZone.classList.add('hover');
});

uiDropZone.addEventListener('dragleave', () => {
    uiDropZone.classList.remove('hover');
});

uiDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uiDropZone.classList.remove('hover');
    
    let loadedCount = 0;

    for (let file of e.dataTransfer.files) {
        if (file.name.endsWith('.json')) {
            loadedJsonName = file.name;
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedJsonRaw = JSON.parse(e.target.result);
                isJsonLoaded = true;
                checkReadyState();
            };
            reader.readAsText(file);
            loadedCount++;
        } 
        else if (file.name.endsWith('.wav') || file.name.endsWith('.mp3')) {
            loadedWavName = file.name;
            const audioUrl = URL.createObjectURL(file);
            audioEl.src = audioUrl;
            isAudioLoaded = true;
            checkReadyState();
            loadedCount++;
        }
    }
    
    if (loadedCount > 0) uiDropZone.textContent = "Processing...";
});

function checkReadyState() {
    if (isJsonLoaded && isAudioLoaded) {
        uiDropZone.textContent = `[${loadedJsonName}] & [${loadedWavName}]`;
        uiDropZone.style.borderColor = "#4caf50";
        uiDropZone.style.color = "#4caf50";
        
        const parsedData = parseBeepboxData(uploadedJsonRaw);
        allEvents = parsedData.events;
        
        songData.tonic = parsedData.tonic;
        songData.tpb = parsedData.tpb;
        songData.bpb = parsedData.bpb;
        songData.renderedChannelCount = parsedData.renderedChannelCount;
        songData.segments = parsedData.segments;
        songData.barLengths = parsedData.barLengths;
        
        console.log(`Parsed ${allEvents.length} events. Map segments: ${songData.segments.length}`);
        
        uiPlayPauseBtn.disabled = false;
        uiScrubber.disabled = false;
    }
}