import http from 'http';
import { exec } from 'child_process';
import OpenAI from 'openai';
import type { AgentCLI } from '../types.ts';

function playBuffer(buffer: Buffer) {
    return new Promise<void>((resolve, reject) => {
        const server = http.createServer((req, res) => {
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

        server.on('listening', () => {
            // console.log('Audio streaming server listening on http://localhost:8081');
            // console.log("Playing audio... (using ffplay)");
            const player = exec('ffplay -autoexit -nodisp -loglevel warning http://localhost:8081');

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

export class OpenAIVoiceAdapter implements AgentCLI.TextToSpeechPlayer, AgentCLI.Transcriber {
    private openai: OpenAI;
    private ttsModel: string;
    private ttsVoice: OpenAI.Audio.Speech.SpeechCreateParams['voice'];

    constructor(options?: AgentCLI.OpenAIVoiceOptions) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is not set in the environment.");
        }
        
        this.openai = new OpenAI({ apiKey });
        this.ttsModel = options?.tts?.model || 'tts-1';
        this.ttsVoice = options?.tts?.voice || 'alloy';
    }

    // Implements TextToSpeechPlayer interface
    async play(text: string): Promise<void> {
        // console.log("Generating TTS with OpenAI...");

        const response = await this.openai.audio.speech.create({
            model: this.ttsModel,
            voice: this.ttsVoice,
            input: text,
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        await playBuffer(buffer);
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