import 'dotenv/config';
import crypto from 'crypto';
import { subscribe } from '@inngest/realtime';
import type { AgentCLI } from './types.ts';
const { default: spinners } = await import('cli-spinners');

let spinnerInterval: NodeJS.Timeout | undefined;

// Set console to debug mode
// console.debug = console.log;

const startSpinner = (text: string) => {
	stopSpinner(); // Stop any existing spinner
	const spinner = spinners.dots;
	let i = 0;
	spinnerInterval = setInterval(() => {
		process.stdout.write(`\r${spinner.frames[i++ % spinner.frames.length]} ${text}`);
	}, spinner.interval);
};

const stopSpinner = () => {
	if (spinnerInterval) {
		clearInterval(spinnerInterval);
		spinnerInterval = undefined;
		process.stdout.write('\r' + ' '.repeat(process.stdout.columns - 1) + '\r');
	}
};

async function processRequest({ text, config }: { text: string; config: AgentCLI.Config; }) {
    
    const sessionId = crypto.randomUUID();
    let finalAnswerReceived = false;


    const subscription = await subscribe({
        app: config.inngest,
        channel: `voice-assistant.${sessionId}`,
        topics: ["agent_status", "tool_usage", "message", "debug", "system", "speak"],
    });

    await config.inngest.send({
        name: 'app/voice.request',
        data: { input: text, sessionId },
    });
    startSpinner("Thinking...");

    const reader = subscription.getReader();
    while (true) {
        const { done, value: event } = await reader.read();
        if (done) break;

        if (event.topic === 'agent_status') {
            const data = event.data as { agentName: string; status: 'thinking' | 'completed' | 'error'; message?: string };
            stopSpinner();
            if (data.status === 'thinking') {
                console.log(`\n🤖 ${data.agentName} thinking...`);
                startSpinner(`${data.agentName} thinking...`);
            } else if (data.status === 'completed') {
                console.log(`${data.agentName} completed`);
            }
        } else if (event.topic === 'tool_usage') {
            const data = event.data as { agentName: string; toolName: string; status: 'using' | 'completed' | 'error'; error?: string };
            stopSpinner();
            if (data.status === 'using') {
                console.log(`🔧 Using ${data.toolName}`);
                startSpinner(`Using ${data.toolName}...`);
            } else if (data.status === 'completed') {
                console.log(`Used ${data.toolName}`);
            } else if (data.status === 'error') {
                console.log(`Error using ${data.toolName}: ${data.error || 'Unknown error'}`);
            }
        } else if (event.topic === 'system') {
            const data = event.data as { event: string; message: string };
            stopSpinner();
            console.log(`\n⚙️ ${data.message}`);
            if (data.event === 'workflow_complete') {
                stopSpinner();
                await reader.cancel();
                break;
            }
            startSpinner(`${data.message}...`);
        } else if (event.topic === 'debug') {
            // Skip debug logs in normal mode
        } else if (event.topic === 'speak') {
            stopSpinner();
            startSpinner(`Speaking...`);
            console.debug(`\n[ASSISTANT] ${event.data}\n`);
            finalAnswerReceived = true;
            await config.tts.play(event.data as string, new AbortController().signal);
            stopSpinner();
        }
    }

    if (!finalAnswerReceived) {
        stopSpinner();
        console.log("Workflow finished without a final answer.");
    }
}

/**
 * Runs the voice assistant CLI with the given configuration.
 * This function handles all initialization, the main run loop,
 * and process cleanup.
 * @param config The CLI configuration object.
 */
export async function runAgentCLI(config: AgentCLI.Config) {
    const cleanup = () => {
        if (config.wakeWord.release) {
            config.wakeWord.release();
        }
        process.exit();
    };

    process.on('SIGINT', cleanup);

    try {
        // console.debug("Initializing voice assistant with provided config...");
        
        if (config.wakeWord.initialize) {
            await config.wakeWord.initialize();
        }

        // Main Loop
        while (true) {
            startSpinner(`Listening for wake word "Jarvis"... (Press Ctrl+C to exit)`);
            await config.wakeWord.waitForWakeWord();

            startSpinner(`Wake word detected! Listening for command...`);
            const audioData = await config.wakeWord.record();

            if (audioData.length <= 44) {
                stopSpinner();
                console.log("\nDid not hear a command, listening for wake word again.\n");
                continue;
            }
            
            startSpinner(`Transcribing command...`);
            const transcript = await config.stt.transcribe(audioData);
            stopSpinner();
            
            if (transcript && transcript.trim().length > 0) {
                console.log(`\n\n> "${transcript}"\n`);
                await processRequest({ text: transcript, config });
            } else {
                console.log("\nCould not understand, listening for wake word again.\n");
            }
        }
    } catch (err) {
        console.error("An error occurred:", err);
        cleanup();
    }
} 