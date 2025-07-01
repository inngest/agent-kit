import http from 'http';
import { exec } from 'child_process';
import type { AgentCLI } from '../types.ts';

function playStream(stream: ReadableStream<Uint8Array>) {
    return new Promise<void>((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
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

        server.on('listening', () => {
            // console.debug('Audio streaming server listening on http://localhost:8080');
            // console.debug("Playing audio... (using ffplay)");
            const player = exec('ffplay -autoexit -nodisp -loglevel warning http://localhost:8080');

            player.stdout?.on('data', data => console.log(`ffplay(stdout): ${data}`));
            player.stderr?.on('data', data => console.error(`ffplay(stderr): ${data}`));

            player.on('close', (code) => {
                console.log(`Playback finished (ffplay exited with code ${code}).`);
                server.close();
            });
            player.on('error', (err: Error) => {
                console.error("Failed to start ffplay. Make sure ffmpeg is installed (`brew install ffmpeg`).", err);
                server.close();
                reject(err);
            });
        });

        server.on('close', () => {
            console.log('Audio streaming server closed.');
            resolve();
        });

        server.on('error', (err) => {
            console.error('Audio streaming server error:', err);
            server.close();
            reject(err);
        });
    });
}

export class ElevenLabsAdapter implements AgentCLI.TextToSpeechPlayer {
    private apiKey: string;
    private voiceId: string;

    constructor(options?: AgentCLI.ElevenLabsVoiceOptions) {
        this.apiKey = process.env.ELEVENLABS_API_KEY!;
        this.voiceId = options?.voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
        
        if (!this.apiKey) {
            throw new Error("ELEVENLABS_API_KEY is not set in the environment.");
        }
    }

    async play(text: string): Promise<void> {
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

        await playStream(response.body);
    }
} 