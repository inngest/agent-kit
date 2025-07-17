import http from 'http';
import { exec, ChildProcess } from 'child_process';
import OpenAI from 'openai';
import type { AgentCLI } from '../types.ts';

export class OpenAIVoiceAdapter implements AgentCLI.TextToSpeechPlayer, AgentCLI.Transcriber {
    private openai: OpenAI;
    private ttsModel: string;
    private ttsVoice: OpenAI.Audio.Speech.SpeechCreateParams['voice'];
    private playerProcess: ChildProcess | null = null;
    private server: http.Server | null = null;

    constructor(options?: AgentCLI.OpenAIVoiceOptions) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is not set in the environment.");
        }
        
        this.openai = new OpenAI({ apiKey });
        this.ttsModel = options?.tts?.model || 'tts-1';
        this.ttsVoice = options?.tts?.voice || 'alloy';
    }

    private _playBuffer(buffer: Buffer, signal: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let aborted = false;
            const onAbort = () => {
                if (aborted) return;
                aborted = true;
                this.stop();
                reject(new DOMException('Playback aborted', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort);

            if (signal.aborted) return onAbort();

            this.server = http.createServer((req, res) => {
                try {
                    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
                    res.write(buffer);
                    res.end();
                } catch (error) {
                    console.error('Error in audio streaming server:', error);
                    if (!res.headersSent) {
                        res.writeHead(500);
                    }
                    res.end();
                }
            }).listen(8081);

            this.server.on('listening', () => {
                if (aborted) return this.server?.close();
                this.playerProcess = exec('ffplay -autoexit -nodisp -loglevel warning http://localhost:8081');
                this.playerProcess.on('close', () => this.server?.close());
                this.playerProcess.on('error', (err) => {
                    if (!aborted) reject(err);
                });
            });

            this.server.on('close', () => {
                signal.removeEventListener('abort', onAbort);
                if (!aborted) resolve();
            });

            this.server.on('error', (err) => {
                signal.removeEventListener('abort', onAbort);
                if (!aborted) reject(err);
            });
        });
    }

    async play(text: string, signal: AbortSignal): Promise<void> {
        const response = await this.openai.audio.speech.create({
            model: this.ttsModel,
            voice: this.ttsVoice,
            input: text,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        await this._playBuffer(buffer, signal);
    }

    async stop(): Promise<void> {
        if (this.playerProcess) {
            this.playerProcess.kill();
            this.playerProcess = null;
        }
        if (this.server) {
            const serverToClose = this.server;
            this.server = null;
            await new Promise<void>(resolve => serverToClose.close(() => resolve()));
        }
    }

    // Implements Transcriber interface
    async transcribe(audioBuffer: Buffer): Promise<string | null> {
        if (audioBuffer.length <= 44) { // WAV header is 44 bytes
            // console.log("Skipping transcription for empty audio buffer.");
            return null;
        }
        try {
            const response = await this.openai.audio.transcriptions.create({
                file: new File([audioBuffer], "input.wav", { type: "audio/wav" }),
                model: 'whisper-1',
            });
            return response.text;
        } catch (error) {
            console.error("Error during transcription:", error);
            return null;
        }
    }
} 