import { parseBeepboxData } from './parser.js';
import Visualizer from './visualizer.js';
import VideoRecorder from './recorder.js';
import UIManager from './ui.js';

class ChronodeApp {
    constructor() {
        this.DEFAULT_SETTINGS = {
            exportRes: '720',
            textSize: 16,                  
            dotRadiusScale: 1.0,           
            useFixedOrbitalSpacing: false, 
            fixedOrbitalSpacing: 50,       
            decayTime: 0.30,               
            lineShotTime: 0.1             
        };
        
        this.settings = { ...this.DEFAULT_SETTINGS };
        this.allEvents = [];
        this.songData = {}; 
        
        this.uploadState = {
            isJsonLoaded: false,
            isAudioLoaded: false,
            jsonRaw: null,
            jsonName: "None",
            audioName: "None"
        };

        this.isShiftDown = false;

        this.audioEl = document.getElementById('audio');
        this.visualizer = new Visualizer(document.getElementById('visualizer'));

        window.addEventListener('resize', () => {
            if (!this.recorder.isRecording) {
                this.visualizer.resize();
            }
        });
        
        this.recorder = new VideoRecorder(
            this.visualizer.canvas, 
            this.audioEl, 
            () => this._evaluateUploadState()
        );

        this.ui = new UIManager(this.settings, this.DEFAULT_SETTINGS, {
            onPlayToggle: () => this._handlePlayToggle(),
            onScrub: (val) => this._handleScrub(val),
            onFilesDrop: (files) => this._processFiles(files),
            onDemoLoad: () => this._loadDemoSong()
        });

        this._bindGlobalShortcuts();
        this._startRenderLoop();
    }

    _bindGlobalShortcuts() {
        const handleKey = (e) => {
            if (e.key === 'Shift') {
                this.isShiftDown = (e.type === 'keydown');
                this.ui.updateTransportIcon(!this.audioEl.paused, this.isShiftDown, this.recorder.isRecording);
                return;
            }

            if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) return;

            if (e.type === 'keyup') return;
            if (!this.uploadState.isAudioLoaded || !this.audioEl.duration) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this._handlePlayToggle();
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
        };

        document.addEventListener('keydown', handleKey);
        document.addEventListener('keyup', handleKey);
        
        this.audioEl.addEventListener('ended', () => {
            if (this.recorder.isRecording) {
                this.ui.setDropZoneStatus("Finalizing Video...", "default");
                const paddingMs = (this.settings.decayTime * 1000) + 1000; 
                
                setTimeout(() => {
                    if (this.recorder.isRecording) {
                        this.recorder.stop();
                        this.visualizer.resize();
                    }
                    this.ui.resetTransportUI();
                }, paddingMs);
            } else {
                this.ui.resetTransportUI();
            }
        });
    }

    _handlePlayToggle() {
        if (this.isShiftDown && this.audioEl.paused && !this.recorder.isRecording) {
            this.audioEl.currentTime = 0;
            const cleanName = this.uploadState.jsonName.split('.').slice(0, -1).join('.');
            
            this.ui.updateTransportIcon(true, this.isShiftDown, true);
            this.ui.setDropZoneStatus("Initializing Encoder...", "default");
            
            if (this.settings.exportRes !== 'viewport') {
                this.visualizer.resize(parseInt(this.settings.exportRes));
            }

            this.recorder.start(cleanName);

            setTimeout(() => {
                if (this.recorder.isRecording) {
                    this.audioEl.play();
                    this.ui.setDropZoneStatus("Recording Video...", "ready");
                }
            }, 1000);

        } else {
            if (this.recorder.isRecording) {
                this.recorder.stop();
                this.visualizer.resize();
                this.ui.setDropZoneStatus("Encoding Video...", "default");
            }
            
            this.audioEl.paused ? this.audioEl.play() : this.audioEl.pause();
            this.ui.updateTransportIcon(!this.audioEl.paused, this.isShiftDown, this.recorder.isRecording);
        }
    }

    _handleScrub(percentage) {
        if (this.audioEl.duration) {
            this.audioEl.currentTime = (percentage / 100) * this.audioEl.duration;
        }
    }

    async _loadDemoSong() {
        try {
            this.ui.setDropZoneStatus("Downloading Demo...", "default");
            
            const resJson = await fetch('demos/Voxel - Aether Repression.json');
            if (!resJson.ok) throw new Error("JSON not found");
            this.uploadState.jsonRaw = await resJson.json();
            this.uploadState.jsonName = "Voxel - Aether Repression.json";
            this.uploadState.isJsonLoaded = true;

            const resAudio = await fetch('demos/Voxel - Aether Repression.mp3');
            if (!resAudio.ok) throw new Error("MP3 not found");
            const audioBlob = await resAudio.blob();
            this.audioEl.src = URL.createObjectURL(audioBlob);
            this.uploadState.audioName = "Voxel - Aether Repression.mp3";
            this.uploadState.isAudioLoaded = true;

            this._evaluateUploadState();
        } catch (error) {
            console.error("Demo load failed:", error);
            this.ui.setDropZoneStatus("Demo missing! Requires /demos folder.", "error");
            setTimeout(() => this.ui.setDropZoneStatus("Drop .json & .wav or .mp3", "default"), 3000);
        }
    }

    _processFiles(files) {
        if (this.uploadState.isJsonLoaded && this.uploadState.isAudioLoaded) {
            if (this.recorder.isRecording) {
                this.recorder.stop();
                this.visualizer.resize();
            }
            this.uploadState.isJsonLoaded = false;
            this.uploadState.isAudioLoaded = false;
            this.uploadState.jsonRaw = null;
            this.audioEl.pause();
            this.audioEl.src = '';
            this.allEvents = [];
            
            this.ui.clearAtlas();
            this.ui.setControlsEnabled(false);
            this.ui.resetTransportUI();
        }

        let isParsingJson = false;

        for (let file of files) {
            if (file.name.endsWith('.json')) {
                this.uploadState.jsonName = file.name;
                isParsingJson = true;
                this.ui.setDropZoneStatus("Parsing JSON...", "default");
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.uploadState.jsonRaw = JSON.parse(event.target.result);
                    this.uploadState.isJsonLoaded = true;
                    this._evaluateUploadState();
                };
                reader.readAsText(file);
            } 
            else if (file.name.endsWith('.wav') || file.name.endsWith('.mp3')) {
                this.uploadState.audioName = file.name;
                this.audioEl.src = URL.createObjectURL(file);
                this.uploadState.isAudioLoaded = true;
                this._evaluateUploadState();
            }
        }
        
        if (!isParsingJson) this._evaluateUploadState();
    }

    _evaluateUploadState() {
        const state = this.uploadState;

        if (state.isJsonLoaded && state.isAudioLoaded) {
            const nameJson = state.jsonName.split('.').slice(0, -1).join('.');
            const nameWav = state.audioName.split('.').slice(0, -1).join('.');
            
            this.ui.setDropZoneStatus(
                nameJson === nameWav ? nameJson : `[${state.jsonName}] & [${state.audioName}]`, 
                "ready"
            );
            
            const parsedData = parseBeepboxData(state.jsonRaw);
            this.allEvents = parsedData.events;
            
            this.songData = {
                tonic: parsedData.tonic,
                tpb: parsedData.tpb,
                bpb: parsedData.bpb,
                renderedChannelCount: parsedData.renderedChannelCount,
                segments: parsedData.segments,
                barLengths: parsedData.barLengths,
                channelMetadata: parsedData.channelMetadata,
                volumeAtTick: parsedData.volumeAtTick
            };
            
            this.ui.buildChannelAtlas(this.songData.channelMetadata);
            this.ui.updateTransportIcon(false, this.isShiftDown, false);
            this.ui.setControlsEnabled(true);
        } 
        else if (state.isJsonLoaded && !state.isAudioLoaded) {
            this.ui.setDropZoneStatus("JSON Loaded. Waiting for audio...", "default");
            this.ui.setControlsEnabled(false);
        } 
        else if (!state.isJsonLoaded && state.isAudioLoaded) {
            this.ui.setDropZoneStatus("Audio Loaded. Waiting for JSON...", "default");
            this.ui.setControlsEnabled(false);
        }
    }

    _startRenderLoop() {
        const loop = () => {
            requestAnimationFrame(loop);
            
            if (!this.audioEl.paused && this.audioEl.duration) {
                this.ui.setScrubberValue((this.audioEl.currentTime / this.audioEl.duration) * 100);
            }

            const currentTime = this.audioEl.currentTime;
            
            const activeEvents = this.allEvents.filter(e => 
                currentTime >= e.startTime - this.settings.lineShotTime && 
                currentTime <= e.endTime + this.settings.decayTime
            );

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