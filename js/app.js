import { parseBeepboxData } from './parser.js';
import Visualizer from './visualizer.js';

class ChronodeApp {
    constructor() {
        // --- VISUAL SETTINGS (State) ---
        this.DEFAULT_SETTINGS = {
            textSize: 12,                  
            dotRadiusScale: 1.0,           
            useFixedOrbitalSpacing: false, 
            fixedOrbitalSpacing: 40,       
            decayTime: 0.20,               
            lineShotTime: 0.05             
        };
        this.settings = { ...this.DEFAULT_SETTINGS };

        // --- APPLICATION STATE ---
        this.allEvents = [];
        this.songData = {}; 
        this.isJsonLoaded = false;
        this.isAudioLoaded = false;
        this.uploadedJsonRaw = null;
        this.loadedJsonName = "None";
        this.loadedWavName = "None";

        // --- DEPENDENCIES ---
        this.audioEl = document.getElementById('audio');
        this.visualizer = new Visualizer(document.getElementById('visualizer'));

        // --- DOM ELEMENTS ---
        this.ui = {
            playPauseBtn: document.getElementById('play-pause'),
            scrubber: document.getElementById('scrubber'),
            dropZone: document.getElementById('drop-zone'),
            menuToggle: document.getElementById('menu-toggle'),
            sidebar: document.getElementById('sidebar'),
            resetBtn: document.getElementById('btn-reset'),
            atlasContainer: document.getElementById('channel-atlas')
        };

        this.ui.playPauseBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" id="play-icon" />
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" id="pause-icon" style="display:none" />
            </svg>`;

        this._bindEvents();
        this._startRenderLoop();
    }

    _bindEvents() {
        // Transport Controls
        this.ui.playPauseBtn.addEventListener('click', () => this._togglePlayPause());
        this.audioEl.addEventListener('ended', () => this._onAudioEnded());
        this.ui.scrubber.addEventListener('input', (e) => this._onScrubberInput(e));
        
        // Menu
        this.ui.menuToggle.addEventListener('click', () => this.ui.sidebar.classList.toggle('open'));
        this.ui.resetBtn.addEventListener('click', () => this._resetSettings());

        // File Dropping
        this.ui.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.ui.dropZone.classList.add('hover');
        });
        this.ui.dropZone.addEventListener('dragleave', () => this.ui.dropZone.classList.remove('hover'));
        this.ui.dropZone.addEventListener('drop', (e) => this._handleFileDrop(e));

        // Settings Data Binding
        this._bindSetting('set-textSize', 'val-textSize', 'textSize');
        this._bindSetting('set-dotScale', 'val-dotScale', 'dotRadiusScale', true);
        this._bindSetting('set-fixedSpace', 'val-fixedSpace', 'fixedOrbitalSpacing');
        this._bindSetting('set-decay', 'val-decay', 'decayTime', true);
        this._bindSetting('set-shot', 'val-shot', 'lineShotTime', true);

        document.getElementById('set-useFixed').addEventListener('change', (e) => {
            this.settings.useFixedOrbitalSpacing = e.target.checked;
        });

        // Global Keyboard Shortcuts
        document.addEventListener('keydown', (e) => this._handleKeyboardShortcuts(e));
    }

    // Keyboard Transport Logic ---
    _handleKeyboardShortcuts(e) {
        if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) return;

        // Do nothing if audio hasn't been loaded yet
        if (!this.isAudioLoaded || !this.audioEl.duration) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this._togglePlayPause();
                break;
                
            case 'ArrowRight':
                e.preventDefault();
                this.audioEl.currentTime = Math.min(this.audioEl.currentTime + 5, this.audioEl.duration);
                break;

            case 'ArrowLeft':
                e.preventDefault();
                this.audioEl.currentTime = Math.max(this.audioEl.currentTime - 5, 0);
                break;
        }
    }

    _bindSetting(inputId, displayId, settingKey, isFloat = false) {
        document.getElementById(inputId).addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            this.settings[settingKey] = val;
            
            let displayStr = val.toString();
            if (settingKey === 'textSize' || settingKey === 'fixedOrbitalSpacing') displayStr += 'px';
            else if (settingKey === 'dotRadiusScale') displayStr += 'x';
            else if (settingKey === 'decayTime' || settingKey === 'lineShotTime') displayStr += 's';
            
            document.getElementById(displayId).textContent = displayStr;
        });
    }

    _resetSettings() {
        Object.assign(this.settings, this.DEFAULT_SETTINGS);

        const updates = [
            { id: 'set-textSize', valId: 'val-textSize', val: this.settings.textSize, suffix: 'px' },
            { id: 'set-dotScale', valId: 'val-dotScale', val: this.settings.dotRadiusScale.toFixed(1), suffix: 'x' },
            { id: 'set-fixedSpace', valId: 'val-fixedSpace', val: this.settings.fixedOrbitalSpacing, suffix: 'px' },
            { id: 'set-decay', valId: 'val-decay', val: this.settings.decayTime, suffix: 's' },
            { id: 'set-shot', valId: 'val-shot', val: this.settings.lineShotTime, suffix: 's' }
        ];

        updates.forEach(({ id, valId, val, suffix }) => {
            document.getElementById(id).value = typeof this.DEFAULT_SETTINGS[id.split('-')[1]] === 'number' ? this.DEFAULT_SETTINGS[id.split('-')[1]] : val;
            document.getElementById(valId).textContent = val + suffix;
        });

        document.getElementById('set-useFixed').checked = this.settings.useFixedOrbitalSpacing;
    }

    _togglePlayPause() {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');

        if (this.audioEl.paused) {
            this.audioEl.play();
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            this.audioEl.pause();
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }

    _onAudioEnded() {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        
        if (playIcon && pauseIcon) {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
        
        this.ui.playPauseBtn.setAttribute('aria-label', 'Play');
        this.ui.scrubber.value = 0;
    }

    _onScrubberInput(e) {
        if (this.audioEl.duration) {
            this.audioEl.currentTime = (e.target.value / 100) * this.audioEl.duration;
        }
    }

    _handleFileDrop(e) {
        e.preventDefault();
        this.ui.dropZone.classList.remove('hover');
        
        let loadedCount = 0;

        for (let file of e.dataTransfer.files) {
            if (file.name.endsWith('.json')) {
                this.loadedJsonName = file.name;
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.uploadedJsonRaw = JSON.parse(event.target.result);
                    this.isJsonLoaded = true;
                    this._checkReadyState();
                };
                reader.readAsText(file);
                loadedCount++;
            } 
            else if (file.name.endsWith('.wav') || file.name.endsWith('.mp3')) {
                this.loadedWavName = file.name;
                this.audioEl.src = URL.createObjectURL(file);
                this.isAudioLoaded = true;
                this._checkReadyState();
                loadedCount++;
            }
        }
        
        if (loadedCount > 0) this.ui.dropZone.textContent = "Processing...";
    }

    _checkReadyState() {
        if (this.isJsonLoaded && this.isAudioLoaded) {
            const nameJson = this.loadedJsonName.split('.').slice(0, -1).join('.');
            const nameWav = this.loadedWavName.split('.').slice(0, -1).join('.');

            if (nameJson === nameWav) {
                this.ui.dropZone.textContent = nameJson;
            } else {
                this.ui.dropZone.textContent = `[${this.loadedJsonName}] & [${this.loadedWavName}]`;
            }
            
            this.ui.dropZone.style.borderColor = "#4caf50";
            this.ui.dropZone.style.color = "#4caf50";
            
            const parsedData = parseBeepboxData(this.uploadedJsonRaw);
            this.allEvents = parsedData.events;
            
            this.songData = {
                tonic: parsedData.tonic,
                tpb: parsedData.tpb,
                bpb: parsedData.bpb,
                renderedChannelCount: parsedData.renderedChannelCount,
                segments: parsedData.segments,
                barLengths: parsedData.barLengths,
                channelMetadata: parsedData.channelMetadata
            };
            
            console.log(`Parsed ${this.allEvents.length} events. Map segments: ${this.songData.segments.length}`);
            
            this._buildChannelAtlas();

            this.ui.playPauseBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z" id="play-icon" />
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" id="pause-icon" style="display:none" />
                </svg>`;

            this.ui.playPauseBtn.disabled = false;
            this.ui.scrubber.disabled = false;
        }
    }

    // --- Channel Atlas UI ---
    _buildChannelAtlas() {
        if (!this.ui.atlasContainer) return;
        this.ui.atlasContainer.innerHTML = ''; 

        if (!this.songData.channelMetadata || this.songData.channelMetadata.length === 0) return;

        this.songData.channelMetadata.forEach(meta => {
            const item = document.createElement('div');
            item.className = 'atlas-item';
            
            let svgShape = `<circle cx="16" cy="16" r="13" />`;
            let textY = 17;

            if (meta.tag === 'sqr') {
                svgShape = `<rect x="3" y="3" width="26" height="26" />`;
            } else if (meta.tag === 'tri') {
                svgShape = `<polygon points="16,2 31,28 1,28" />`;
                textY = 20;
            } else if (meta.tag === 'pnt') {
                svgShape = `<polygon points="16,2 30,12 25,28 7,28 2,12" />`;
            } else if (meta.tag === 'hex') {
                svgShape = `<polygon points="8,2 24,2 31,16 24,30 8,30 1,16" />`;
            }

            item.innerHTML = `
                <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                    <g stroke="${meta.color}" stroke-width="2" fill="#000000">
                        ${svgShape}
                    </g>
                    <text x="16" y="${textY}" 
                          fill="${meta.color}" 
                          font-family="monospace" 
                          font-size="12px" 
                          font-weight="bold" 
                          text-anchor="middle" 
                          dominant-baseline="middle">
                        ${meta.id}
                    </text>
                </svg>
            `;
            
            this.ui.atlasContainer.appendChild(item);
        });
    }

    _startRenderLoop() {
        const loop = () => {
            requestAnimationFrame(loop);
            
            if (!this.audioEl.paused && this.audioEl.duration) {
                this.ui.scrubber.value = (this.audioEl.currentTime / this.audioEl.duration) * 100;
            }

            const currentTime = this.audioEl.currentTime;
            
            const activeEvents = this.allEvents.filter(e => 
                currentTime >= e.startTime - this.settings.lineShotTime && 
                currentTime <= e.endTime + this.settings.decayTime
            );

            // Sort in-place to avoid GC allocation
            activeEvents.sort((a, b) => {
                if (a.isPerc && !b.isPerc) return -1;
                if (!a.isPerc && b.isPerc) return 1;
                return a.layerIndex - b.layerIndex;
            });

            if (this.songData.segments) {
                this.visualizer.draw(activeEvents, currentTime, this.songData, this.settings); 
            }
        };

        requestAnimationFrame(loop);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChronodeApp();
});