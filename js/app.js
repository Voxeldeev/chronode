import { parseBeepboxData } from './parser.js';
import Visualizer from './visualizer.js';
import VideoRecorder from './recorder.js';
import UIManager from './ui.js';
import TutorialManager from './tutorial.js';

class ChronodeApp {
    constructor() {
        this.DEFAULT_SETTINGS = {
            exportRes: '720',
            textSize: 16,                  
            dotRadiusScale: 1.0,           
            useFixedOrbitalSpacing: false, 
            fixedOrbitalSpacing: 50,       
            decayTime: 0.30,               
            lineShotTime: 0.1,
            lineThickness: 2,
            decayRadius: 120
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
        this.recorder = null;

        this.audioEl = document.getElementById('audio');
        this.visualizer = new Visualizer(document.getElementById('visualizer'));

        window.addEventListener('resize', () => {
            if (this.recorder && !this.recorder.isRecording) {
                this.visualizer.resize();
            }
        });
        
        this.ui = new UIManager(this.settings, this.DEFAULT_SETTINGS, {
            onPlayToggle: () => this._handlePlayToggle(),
            onScrub: (val) => this._handleScrub(val),
            onFilesDrop: (files) => this._processFiles(files),
            onDemoLoad: () => this._loadDemoSong()
        });

        const tutorialPages = [
            {
                title: "CHRONODE BY VOXEL",
                content: "Chronode is a music visualizer built for UltraBox and its derivative boxes (like Abyssbox and Slarmoo's Box).<br><br>It reads the JSON and maps notes onto a Circle of Fifths. The visualizer reacts to song tempo, time signature, pitch bends, and master volume. <br><br> For an example, take a look at the demo song accessible from the bottom of the settings (in the hamburger menu).<br><br> You can exit this menu at anytime by clicking outside the window."
            },
            {
                title: "CHANNEL FORMATTING",
                content: "You can customize how individual instruments look by renaming their channels in UltraBox using the format: <b>tag.#hexcolor</b> (e.g., <i>hex.#ff0000</i>).<br><br><b>SHAPE TAGS:</b> sml (Small), lrg (Large), tri (Triangle), sqr (Square), pnt (Pentagon), hex (Hexagon).<br><br><b>DRUM TAGS:</b> kick, snare, chh (Closed Hat), ohh (Open Hat), othp (Other Perc).<br><br><b>SPECIAL TAGS:</b> Name a channel <i>omit</i> to hide it entirely from the visualizer. Alternatively, name it <i>norm</i> to create the default circle."
            },
            {
                title: "UPLOADING SONGS",
                content: "To visualize your song, you must provide two files:<br><br>1. An audio file (.mp3 or .wav)<br>2. The project data (.json)<br><br>Drag and drop both files simultaneously anywhere on the screen, or click the dropzone in the bottom right to browse your computer."
            },
            {
                title: "SONG NAVIGATION",
                content: "Once loaded, use the Transport bar at the bottom to control playback. You can click anywhere on the timeline to scrub to a specific part of the song.<br><br>Shortcuts:<br>- [Spacebar] Play / Pause<br>- [Left Arrow] Rewind 5 seconds<br>- [Right Arrow] Skip forward 5 seconds"
            },
            {
                title: "EXPORTING VIDEO",
                content: "Hold [Shift] to reveal the Record button in the transport bar. Clicking it will automatically restart your track and begin capturing the visualizer in the background.<br><br>You can set your desired export resolution in the right-hand settings panel. WebM video files will automatically download to your computer when the song finishes."
            },
            {
                title: "SPACING SETTINGS",
                content: "TEXT SIZE: Adjusts the font size of the note names on the perimeter.<br><br>ORBITAL SPACING: Switches between a dynamic layout that fits your screen, or a strict fixed distance between instrumental layers.<br><br>DOT SCALE: Universally scales the size of the note shapes and percussion symbols."
            },
            {
                title: "LINE SETTINGS",
                content: "LINE THICKNESS: Adjusts the stroke width of melodic connections and polygonal shape outlines. Set to 0px to hide connecting lines entirely.<br><br>LINE SHOT TIME: Controls the speed at which melodic lines \"shoot\" from the center toward the perimeter before a note strikes. Lower values are faster."
            },
            {
                title: "DECAY SETTINGS",
                content: "DECAY RADIUS: Determines the final size of a note after it finishes playing. Set below 100% to shrink notes into nothing, or above 100% to create expanding ripples.<br><br>DECAY TIME: Determines how long (in seconds) the ghost note remains on screen, fading out gracefully based on the radius setting."
            }
        ];
        
        this.tutorial = new TutorialManager(tutorialPages);

        this._bindGlobalShortcuts();
        this._startRenderLoop();
    }

    _bindGlobalShortcuts() {
        const handleKey = (e) => {
            if (e.key === 'Shift') {
                this.isShiftDown = (e.type === 'keydown');
                this.ui.updateTransportIcon(!this.audioEl.paused, this.isShiftDown, this.recorder ? this.recorder.isRecording : false);
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
            if (this.recorder && this.recorder.isRecording) {
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
        if (!this.recorder) {
            this.recorder = new VideoRecorder(
                this.visualizer.canvas, 
                this.audioEl, 
                () => this._evaluateUploadState()
            );
        }

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
            if (this.recorder && this.recorder.isRecording) {
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
            const nameAudio = state.audioName.split('.').slice(0, -1).join('.');
            
            this.ui.setDropZoneStatus(
                nameJson === nameAudio ? nameJson : `[${state.jsonName}] & [${state.audioName}]`, 
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