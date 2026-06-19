export default class UIManager {
    constructor(settings, defaultSettings, callbacks) {
        this.settings = settings;
        this.defaultSettings = defaultSettings;
        this.callbacks = callbacks;

        this.elements = {
            exportRes: document.getElementById('set-exportRes'),
            playPauseBtn: document.getElementById('play-pause'),
            scrubber: document.getElementById('scrubber'),
            dropZone: document.getElementById('drop-zone'),
            menuToggle: document.getElementById('menu-toggle'),
            sidebar: document.getElementById('sidebar'),
            resetBtn: document.getElementById('btn-reset'),
            atlasContainer: document.getElementById('channel-atlas'),
            filePicker: document.getElementById('file-picker'),
            btnDemo: document.getElementById('btn-demo')
        };

        this._initializeDOM();
        this._bindEvents();
    }

    _initializeDOM() {
        this.elements.playPauseBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" id="play-icon" />
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" id="pause-icon" style="display:none" />
                <circle cx="12" cy="12" r="8" id="record-icon" style="display:none" fill="white" />
            </svg>`;
    }

    _bindEvents() {
        this.elements.playPauseBtn.addEventListener('click', () => this.callbacks.onPlayToggle());
        this.elements.scrubber.addEventListener('input', (e) => this.callbacks.onScrub(e.target.value));
        this.elements.menuToggle.addEventListener('click', () => this.elements.sidebar.classList.toggle('open'));
        this.elements.resetBtn.addEventListener('click', () => this.resetSettings());
        this.elements.btnDemo.addEventListener('click', () => this.callbacks.onDemoLoad());

        this.elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('hover');
        });
        
        this.elements.dropZone.addEventListener('dragleave', () => this.elements.dropZone.classList.remove('hover'));
        
        this.elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('hover');
            this.callbacks.onFilesDrop(e.dataTransfer.files);
        });

        this.elements.dropZone.addEventListener('click', () => this.elements.filePicker.click());
        this.elements.filePicker.addEventListener('change', (e) => this.callbacks.onFilesDrop(e.target.files));

        this._bindSettingInput('set-textSize', 'val-textSize', 'textSize');
        this._bindSettingInput('set-dotScale', 'val-dotScale', 'dotRadiusScale', true);
        this._bindSettingInput('set-fixedSpace', 'val-fixedSpace', 'fixedOrbitalSpacing');
        this._bindSettingInput('set-decay', 'val-decay', 'decayTime', true);
        this._bindSettingInput('set-shot', 'val-shot', 'lineShotTime', true);

        document.getElementById('set-useFixed').addEventListener('change', (e) => {
            this.settings.useFixedOrbitalSpacing = e.target.checked;
        });

        this.elements.exportRes.addEventListener('change', (e) => {
            this.settings.exportRes = e.target.value;
        });

        const lineThicknessSlider = document.getElementById('set-lineThickness');
        const lineThicknessVal = document.getElementById('val-lineThickness');
        
        if (lineThicknessSlider) {
            lineThicknessSlider.addEventListener('input', (e) => {
                this.settings.lineThickness = parseFloat(e.target.value);
                lineThicknessVal.textContent = `${e.target.value}px`;
            });
        }

        const decayRadiusSlider = document.getElementById('set-decayRadius');
        const decayRadiusVal = document.getElementById('val-decayRadius');
        
        if (decayRadiusSlider) {
            decayRadiusSlider.addEventListener('input', (e) => {
                this.settings.decayRadius = parseInt(e.target.value);
                decayRadiusVal.textContent = `${e.target.value}%`;
            });
        }
    }

    _bindSettingInput(inputId, displayId, settingKey, isFloat = false) {
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

    resetSettings() {
        Object.assign(this.settings, this.defaultSettings);

        const updates = [
            { id: 'set-textSize', valId: 'val-textSize', val: this.settings.textSize, suffix: 'px' },
            { id: 'set-dotScale', valId: 'val-dotScale', val: this.settings.dotRadiusScale.toFixed(1), suffix: 'x' },
            { id: 'set-fixedSpace', valId: 'val-fixedSpace', val: this.settings.fixedOrbitalSpacing, suffix: 'px' },
            { id: 'set-decay', valId: 'val-decay', val: this.settings.decayTime, suffix: 's' },
            { id: 'set-shot', valId: 'val-shot', val: this.settings.lineShotTime, suffix: 's' },
            { id: 'set-lineThickness', valId: 'val-lineThickness', val: this.settings.lineThickness, suffix: 'px' },
            { id: 'set-decayRadius', valId: 'val-decayRadius', val: this.settings.decayRadius, suffix: '%' }
        ];

        updates.forEach(({ id, valId, val, suffix }) => {
            const inputEl = document.getElementById(id);
            const valEl = document.getElementById(valId);
            if (inputEl && valEl) {
                inputEl.value = typeof this.defaultSettings[id.split('-')[1]] === 'number' ? this.defaultSettings[id.split('-')[1]] : val;
                valEl.textContent = val + suffix;
            }
        });

        const useFixedEl = document.getElementById('set-useFixed');
        if (useFixedEl) useFixedEl.checked = this.settings.useFixedOrbitalSpacing;
    }

    updateTransportIcon(isPlaying, isShiftDown, isRecording) {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const recordIcon = document.getElementById('record-icon');

        if (!playIcon || !pauseIcon || !recordIcon) return;

        if (isRecording) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'none';
            recordIcon.style.display = 'block';
            recordIcon.style.fill = '#ff4444';
            return;
        }

        if (isPlaying) {
            playIcon.style.display = 'none';
            recordIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else if (isShiftDown) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'none';
            recordIcon.style.display = 'block';
            recordIcon.style.fill = 'white'; 
        } else {
            pauseIcon.style.display = 'none';
            recordIcon.style.display = 'none';
            playIcon.style.display = 'block';
        }
    }

    setDropZoneStatus(text, statusType = 'default') {
        this.elements.dropZone.textContent = text;
        
        if (statusType === 'ready') {
            this.elements.dropZone.style.borderColor = "#4caf50";
            this.elements.dropZone.style.color = "#4caf50";
        } else if (statusType === 'error') {
            this.elements.dropZone.style.borderColor = "#ff4444";
            this.elements.dropZone.style.color = "#ff4444";
        } else {
            this.elements.dropZone.style.borderColor = "var(--text-muted)";
            this.elements.dropZone.style.color = "var(--text-muted)";
        }
    }

    setControlsEnabled(isEnabled) {
        this.elements.playPauseBtn.disabled = !isEnabled;
        this.elements.scrubber.disabled = !isEnabled;
    }

    setScrubberValue(percentage) {
        this.elements.scrubber.value = percentage;
    }

    clearAtlas() {
        if (this.elements.atlasContainer) {
            this.elements.atlasContainer.innerHTML = '';
        }
    }

    buildChannelAtlas(channelMetadata) {
        this.clearAtlas();
        if (!channelMetadata || channelMetadata.length === 0) return;

        channelMetadata.forEach(meta => {
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
            
            this.elements.atlasContainer.appendChild(item);
        });
    }

    resetTransportUI() {
        this.updateTransportIcon(false, false, false);
        this.elements.playPauseBtn.setAttribute('aria-label', 'Play');
        this.setScrubberValue(0);
    }
}