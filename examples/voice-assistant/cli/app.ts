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
        topics: ["log", "speak"],
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

        if (event.topic === 'log') {
            const logMessage = event.data as string;
            
            // Stop spinner before logging, restart after
            stopSpinner();
            
            // Categorize log messages for better display
            if (logMessage.includes('🔧 Called tool:')) {
                console.log(`\n${logMessage}`);
            } else if (logMessage.includes('✅ Tool') && logMessage.includes('completed')) {
                console.log(`${logMessage}`);
            } else if (logMessage.includes('📥 Input:') || logMessage.includes('📤 Result:')) {
                console.log(`  ${logMessage}`);
            } else if (logMessage.includes('📊 Agent') && logMessage.includes('execution summary:')) {
                console.log(`\n${logMessage}`);
            } else if (logMessage.includes('🚀') || logMessage.includes('🤖') || logMessage.includes('📋') || logMessage.includes('💾') || logMessage.includes('💭') || logMessage.includes('🔍')) {
                console.log(`\n${logMessage}`);
            }
            
            startSpinner(`${logMessage}...`);
            
            // console.debug(`[AGENT LOG] ${logMessage}`);
            if (logMessage.includes("Workflow complete.")) {
                // console.debug("Workflow finished, returning to wake word detection.");
                stopSpinner();
                await reader.cancel();
                break;
            }
        } else if (event.topic === 'speak') {
            stopSpinner();
            startSpinner(`Speaking...`);
            console.debug(`\n[ASSISTANT] ${event.data}\n`);
            finalAnswerReceived = true;
            await config.tts.play(event.data as string);
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