import { BuiltinKeyword, Porcupine } from '@picovoice/porcupine-node';
import { Cobra } from '@picovoice/cobra-node';
import { PvRecorder } from '@picovoice/pvrecorder-node';
import wavefilePkg from 'wavefile';
import type { AgentCLI } from '../types.ts';

const { WaveFile } = wavefilePkg;

export class PicovoiceAdapter implements AgentCLI.WakeWordAndRecorder {
    private accessKey: string;
    private recorder: PvRecorder | null = null;
    private porcupine: Porcupine | null = null;
    private cobra: Cobra | null = null;
    private frameLength: number = 0;
    private sampleRate: number = 0;

    private get bufferSizeSeconds(): number {
        return 2.5;
    }

    private get framesPerSecond(): number {
        if (!this.sampleRate || !this.frameLength) return 30; // a reasonable default
        return this.sampleRate / this.frameLength;
    }

    private get bufferFrameCount(): number {
        return Math.ceil(this.bufferSizeSeconds * this.framesPerSecond);
    }

    constructor() {
        this.accessKey = process.env.PICOVOICE_ACCESS_KEY!;
        if (!this.accessKey) {
            throw new Error("PICOVOICE_ACCESS_KEY is not set in the environment.");
        }
    }

    public async initialize() {
        // --- Initialize Porcupine Wake Word Engine ---
        this.porcupine = new Porcupine(this.accessKey, [BuiltinKeyword.JARVIS], [0.65]);
        this.frameLength = this.porcupine.frameLength;
        this.sampleRate = this.porcupine.sampleRate;

        // --- Initialize Cobra VAD Engine ---
        this.cobra = new Cobra(this.accessKey);

        // --- Initialize PvRecorder ---
        const devices = PvRecorder.getAvailableDevices();
        // console.debug("Available audio devices:", devices);

        // -1 for default device
        this.recorder = new PvRecorder(this.frameLength, -1);
        this.recorder.start();
        // console.debug(`Using device: ${this.recorder.getSelectedDevice()}`);
    }

    async waitForWakeWord(): Promise<void> {
        if (!this.recorder || !this.porcupine) {
            throw new Error("Picovoice components not initialized.");
        }

        while (true) {
            const pcm = await this.recorder.read();
            const keywordIndex = this.porcupine.process(pcm);
            if (keywordIndex !== -1) {
                return;
            }
        }
    }

    async record(): Promise<Buffer> {
        if (!this.recorder || !this.cobra || !this.frameLength || !this.sampleRate) {
            throw new Error("Picovoice components not initialized for recording.");
        }
        
        // console.log("Recording... Speak your command.");
        const allFrames: Int16Array[] = [];
        
        const startThreshold = 0.7; 
        const endThreshold = 0.15; // Lowered threshold for less sensitivity to silence
        const silenceLimit = this.bufferFrameCount;
        const preBufferSize = this.bufferFrameCount;
        const recordingTimeoutFrames = this.framesPerSecond * 60; // ~60 seconds

        let isRecording = false;
        let silenceFrames = 0;
        const preBuffer: Int16Array[] = [];
        let frameCount = 0;

        // console.log("Waiting for speech...");

        while (frameCount < recordingTimeoutFrames) {
            frameCount++;
            const pcm = await this.recorder.read();
            const voiceProbability = this.cobra.process(pcm);

            if (isRecording) {
                allFrames.push(pcm);

                if (voiceProbability < endThreshold) {
                    silenceFrames++;
                    if (silenceFrames > silenceLimit) {
                        // console.log("Silence detected, stopping recording.");
                        break;
                    }
                } else {
                    silenceFrames = 0;
                }
            } else {
                preBuffer.push(pcm);
                if (preBuffer.length > preBufferSize) {
                    preBuffer.shift(); 
                }

                if (voiceProbability > startThreshold) {
                    // console.log("Voice activity detected, starting recording.");
                    isRecording = true;
                    allFrames.push(...preBuffer);
                }
            }
        }

        if (allFrames.length === 0) {
            // console.log("No speech detected before timeout.");
            const waveFile = new WaveFile();
            waveFile.fromScratch(1, this.sampleRate, '16', new Int16Array(0));
            return Buffer.from(waveFile.toBuffer());
        }

        const allPcm = new Int16Array(allFrames.length * this.frameLength);
        for (let i = 0; i < allFrames.length; i++) {
            allPcm.set(allFrames[i]!, i * this.frameLength);
        }

        const waveFile = new WaveFile();
        waveFile.fromScratch(1, this.sampleRate, '16', allPcm);
        return Buffer.from(waveFile.toBuffer());
    }

    async listenForSpeech(timeoutSeconds: number): Promise<Buffer | null> {
        if (!this.recorder || !this.cobra || !this.frameLength || !this.sampleRate) {
            throw new Error("Picovoice components not initialized for recording.");
        }

        const frameLimit = Math.ceil(timeoutSeconds * this.framesPerSecond);
        const endThreshold = 0.15; // Lowered threshold for less sensitivity
        const silenceLimit = this.bufferFrameCount;
        const startThreshold = 0.7;

        const allFrames: Int16Array[] = [];
        let isRecording = false;
        let silenceFrames = 0;
        let frameCount = 0;

        while (frameCount < frameLimit) {
            frameCount++;
            const pcm = await this.recorder.read();
            const voiceProbability = this.cobra.process(pcm);

            if (isRecording) {
                allFrames.push(pcm);
                if (voiceProbability < endThreshold) {
                    silenceFrames++;
                    if (silenceFrames > silenceLimit) {
                        break; // End of speech detected
                    }
                } else {
                    silenceFrames = 0;
                }
            } else if (voiceProbability > startThreshold) {
                isRecording = true;
                allFrames.push(pcm); // Start recording
            }
        }

        if (allFrames.length === 0) {
            return null; // Timeout, no speech detected
        }

        const allPcm = new Int16Array(allFrames.length * this.frameLength);
        for (let i = 0; i < allFrames.length; i++) {
            allPcm.set(allFrames[i]!, i * this.frameLength);
        }

        const waveFile = new WaveFile();
        waveFile.fromScratch(1, this.sampleRate, '16', allPcm);
        return Buffer.from(waveFile.toBuffer());
    }

    public release() {
        if (this.recorder) {
            this.recorder.stop();
            this.recorder.release();
            // console.log("Recorder released.");
        }
        if (this.porcupine) {
            this.porcupine.release();
            // console.log("Porcupine released.");
        }
        if (this.cobra) {
            this.cobra.release();
            // console.log("Cobra released.");
        }
    }
} 