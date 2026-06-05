export default class VideoRecorder {
    constructor(canvas, audioEl, onExportComplete) {
        this.canvas = canvas;
        this.audioEl = audioEl;
        this.onExportComplete = onExportComplete;
        
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.fileName = 'Export';
    }

    start(fileName) {
        this.isRecording = true;
        this.recordedChunks = [];
        this.fileName = fileName || 'Export';
        
        const canvasStream = this.canvas.captureStream(60);
        
        const audioStream = this.audioEl.captureStream 
            ? this.audioEl.captureStream() 
            : this.audioEl.mozCaptureStream();

        const combinedStream = new MediaStream([
            ...canvasStream.getTracks(),
            ...audioStream.getTracks()
        ]);

        const options = { mimeType: 'video/webm; codecs=vp9' };
        
        try {
            this.mediaRecorder = new MediaRecorder(combinedStream, options);
        } catch (e) {
            this.mediaRecorder = new MediaRecorder(combinedStream);
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.recordedChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
            this._exportVideo();
            if (this.onExportComplete) this.onExportComplete();
        };

        this.mediaRecorder.start();
    }

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.isRecording = false;
    }

    _exportVideo() {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = `${this.fileName}_Export.webm`;
        a.click();

        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
}