export default class MediaRecorderManager {
    constructor(updateTimerCallback) {
        this.stream = null;
        this.recorder = null;
        this.chunks = [];
        this.timerId = null;
        this.seconds = 0;
        this.updateTimerCallback = updateTimerCallback;
    }

    async start() {
        this.chunks = [];
        this.seconds = 0;
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.recorder = new MediaRecorder(this.stream);

        this.recorder.addEventListener('dataavailable', (e) => {
            if (e.data && e.data.size > 0) this.chunks.push(e.data);
        });

        this.recorder.start();
        this.timerId = setInterval(() => {
            this.seconds += 1;
            const m = String(Math.floor(this.seconds / 60)).padStart(2, '0');
            const s = String(this.seconds % 60).padStart(2, '0');
            this.updateTimerCallback(`${m}:${s}`);
        }, 1000);
    }

    stop(save = true) {
        return new Promise((resolve) => {
            clearInterval(this.timerId);
            if (!this.recorder || this.recorder.state === 'inactive') {
                this.cleanup();
                resolve(null);
                return;
            }

            this.recorder.addEventListener('stop', () => {
                const blob = save ? new Blob(this.chunks, { type: 'audio/ogg' }) : null;
                this.cleanup();
                resolve(blob);
            });
            this.recorder.stop();
        });
    }

    cleanup() {
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
        this.recorder = null;
        clearInterval(this.timerId);
    }
}
