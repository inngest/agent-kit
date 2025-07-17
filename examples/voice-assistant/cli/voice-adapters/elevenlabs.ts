import http from 'http';
import { exec, ChildProcess } from 'child_process';
import type { AgentCLI } from '../types.ts';

export class ElevenLabsAdapter implements AgentCLI.TextToSpeechPlayer {
    private apiKey: string;
    private voiceId: string;
    private playerProcess: ChildProcess | null = null;
    private server: http.Server | null = null;

    constructor(options?: AgentCLI.ElevenLabsVoiceOptions) {
        this.apiKey = process.env.ELEVENLABS_API_KEY!;
        this.voiceId = options?.voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
        
        if (!this.apiKey) {
            throw new Error("ELEVENLABS_API_KEY is not set in the environment.");
        }
    }

    private _playStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
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

            this.server = http.createServer(async (req, res) => {
            try {
                res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
                const reader = stream.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
                }
                res.end();
            } catch (error) {
                console.error('Error in audio streaming server:', error);
                if (!res.headersSent) {
                    res.writeHead(500);
                }
                res.end();
            }
        }).listen(8080);

            this.server.on('listening', () => {
                if (aborted) return this.server?.close();
                this.playerProcess = exec('ffplay -autoexit -nodisp -loglevel warning http://localhost:8080');
                this.playerProcess.stdout?.on('data', data => console.log(`ffplay(stdout): ${data}`));
                this.playerProcess.stderr?.on('data', data => console.error(`ffplay(stderr): ${data}`));
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
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`;
        const headers = {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
        };
        const data = {
            text: text,
            model_id: 'eleven_monolingual_v1',
        };

        console.log("Streaming TTS from ElevenLabs...");

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data),
        });

        if (!response.ok || !response.body) {
            throw new Error(`ElevenLabs API Error: ${response.statusText}`);
        }

        await this._playStream(response.body, signal);
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
} 