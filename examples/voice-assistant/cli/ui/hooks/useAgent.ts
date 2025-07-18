import { useState, useEffect, useCallback, useRef } from 'react';
import crypto from 'crypto';
import { AgentKitConfig } from '../../config/schema.js';
import { VoiceAdapters } from '../../voice-adapters/index.js';
import { subscribe } from '@inngest/realtime';
import { createState, type Message } from '@inngest/agent-kit';
import { PostgresHistoryAdapter } from '../../../db';
import type { VoiceAssistantNetworkState } from '../../../index';

export type AgentStatus = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'AWAITING_RESPONSE' | 'AWAITING_APPROVAL';
export type Interaction = { type: 'user' | 'agent'; text: string };

// New event types for enriched stream
export interface ThoughtEvent {
	type: 'thought';
	agentName: string;
	content: string;
	timestamp: Date;
}

export interface ToolCallEvent {
	type: 'tool_call';
	agentName: string;
	toolName: string;
	input: any;
	timestamp: Date;
}

export interface ToolResultEvent {
	type: 'tool_result';
	agentName: string;
	toolName: string;
	result: any;
	timestamp: Date;
}

export interface HITLRequestEvent {
	type: 'hitl_request';
	messageId: string;
	agentName: string;
	request: string;
	details?: string;
	options?: string[];
	expiresAt: Date;
	timestamp: Date;
	toolCalls?: Array<{
		toolName: string;
		toolInput: any;
	}>;
}

export type StreamEvent = ThoughtEvent | ToolCallEvent | ToolResultEvent | HITLRequestEvent;

// Helper function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Converts the client-side `Interaction[]` array to the `Message[]` array
 * that AgentKit expects for client-authoritative history.
 * @param interactions The array of user and agent interactions.
 * @returns An array of `Message` objects.
 */
function interactionsToMessages(interactions: Interaction[]): Message[] {
	return interactions.map(interaction => {
		return {
			type: 'text',
			role: interaction.type === 'agent' ? 'assistant' : 'user',
			content: interaction.text,
		};
	});
}

export function useAgent(config: AgentKitConfig, adapters: VoiceAdapters) {
	const [status, setStatus] = useState<AgentStatus>('IDLE');
	const [logs, setLogs] = useState<string[]>([]);
	const [interactions, setInteractions] = useState<Interaction[]>([]);
	const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
	const [pendingHITL, setPendingHITL] = useState<HITLRequestEvent | null>(null);
	const [currentThreadId, setCurrentThreadId] = useState<string | undefined>();
	const abortControllerRef = useRef<AbortController | null>(null);
	const speechInterruptedRef = useRef(false);
	const historyAdapterRef = useRef<PostgresHistoryAdapter<VoiceAssistantNetworkState> | null>(null);

	// Initialize history adapter
	useEffect(() => {
		const historyConfig = {
			connectionString: process.env.POSTGRES_URL || "postgresql://localhost:5432/agentkit_chat",
			tablePrefix: "agentkit_",
			schema: "public",
			maxTokens: 8000,
			verbose: false, // Disable verbose logging for CLI use
		};
		historyAdapterRef.current = new PostgresHistoryAdapter(historyConfig);
		
		// Initialize tables
		historyAdapterRef.current.initializeTables().catch(error => {
			console.error('Failed to initialize database tables:', error);
		});

		return () => {
			// Cleanup history adapter on unmount
			if (historyAdapterRef.current) {
				historyAdapterRef.current.close().catch(error => {
					console.error('Error closing database connection:', error);
				});
			}
		};
	}, []);

	const addLog = useCallback((log: string) => setLogs(prev => [...prev, log]), []);
	const addInteraction = useCallback((interaction: Interaction) => setInteractions(prev => [...prev, interaction]), []);
	const addStreamEvent = useCallback((event: StreamEvent) => setStreamEvents(prev => [...prev, event]), []);

	const cleanup = useCallback(async () => {
		// If there's an active query, abort it.
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		// Release the wake word engine and its recorder
		if (adapters.wakeWord && adapters.wakeWord.release) {
			adapters.wakeWord.release();
		}
		// Stop any active TTS
		if (adapters.tts && adapters.tts.stop) {
			await adapters.tts.stop();
		}
		// Close database connection
		if (historyAdapterRef.current) {
			try {
				await historyAdapterRef.current.close();
				historyAdapterRef.current = null;
			} catch (error) {
				console.error('Error closing database connection during cleanup:', error);
			}
		}
	}, [adapters]);

	// Thread management functions
	const createNewThread = useCallback(async () => {
		if (!historyAdapterRef.current) {
			throw new Error('History adapter not initialized');
		}

		const state = createState<VoiceAssistantNetworkState>({ 
			sessionId: crypto.randomUUID(),
			userInput: '',
			userId: 'default-user' // Add default user ID for thread management
		});
		
		const { threadId } = await historyAdapterRef.current.createThread({ 
			state, 
			input: 'New conversation' 
		});
		
		setCurrentThreadId(threadId);
		// Clear existing conversation when creating new thread
		setInteractions([]);
		setLogs([]);
		
		return threadId;
	}, []);

	const loadThread = useCallback(async (threadId: string) => {
		if (!historyAdapterRef.current) {
			throw new Error('History adapter not initialized');
		}

		setCurrentThreadId(threadId);
		
		// Load thread history and convert to interactions
		const history = await historyAdapterRef.current.getCompleteHistory(threadId);
		
		const loadedInteractions: Interaction[] = [];
		history.forEach(item => {
			if (item.type === 'user' && item.content) {
				loadedInteractions.push({ type: 'user', text: item.content });
			} else if (item.type === 'agent' && item.data) {
				// Extract assistant response from agent data
				const assistantMessage = item.data.output?.find((msg: any) => 
					msg.type === 'text' && msg.role === 'assistant'
				);
				if (assistantMessage?.content) {
					loadedInteractions.push({ type: 'agent', text: assistantMessage.content });
				}
			}
		});
		
		setInteractions(loadedInteractions);
		setLogs([]); // Clear logs when loading a thread
	}, []);

	const listThreads = useCallback(async () => {
		if (!historyAdapterRef.current) {
			throw new Error('History adapter not initialized');
		}

		// For now, we'll list all threads without filtering by user
		// In a real app, you'd want to filter by the current user
		const threads = await historyAdapterRef.current.listThreads('default-user', 20);
		
		// Add preview text from the first message if available
		const threadsWithPreview = await Promise.all(threads.map(async (thread) => {
			try {
				const history = await historyAdapterRef.current!.getCompleteHistory(thread.thread_id);
				const firstUserMessage = history.find(item => item.type === 'user' && item.content);
				return {
					threadId: thread.thread_id,
					metadata: thread.metadata,
					createdAt: thread.created_at,
					updatedAt: thread.updated_at,
					preview: firstUserMessage?.content?.substring(0, 50) + (firstUserMessage?.content && firstUserMessage.content.length > 50 ? '...' : '')
				};
			} catch {
				return {
					threadId: thread.thread_id,
					metadata: thread.metadata,
					createdAt: thread.created_at,
					updatedAt: thread.updated_at,
					preview: undefined
				};
			}
		}));
		
		return threadsWithPreview;
	}, []);

	// Effect to initialize adapters on startup.
	useEffect(() => {
		let isMounted = true;
		async function initialize() {
			if (adapters.wakeWord && adapters.wakeWord.initialize) {
				try {
					await adapters.wakeWord.initialize();
					if (isMounted) addLog('🎤 Wake word engine initialized.');
				} catch (e) {
					if (isMounted) addLog(`❌ Error initializing wake word: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
		}
		
		initialize();

		// No longer need to call cleanup here, as the App component handles it.
		return () => {
			isMounted = false;
		};
	}, [adapters, addLog]);

	// Function to process a query (from text or voice)
	const processQuery = useCallback(async (text: string) => {
		speechInterruptedRef.current = false; // Reset flag on new query
		if (!text.trim()) return;

		// Create new thread if none exists
		let threadId = currentThreadId;
		if (!threadId && historyAdapterRef.current) {
			threadId = await createNewThread();
		}

		// Add the new user message to the interactions before sending
		const newInteractions: Interaction[] = [...interactions, { type: 'user', text }];
		setInteractions(newInteractions);

		setStatus('THINKING');
		// Note: we use setInteractions above which updates the conversation UI
		// addInteraction({ type: 'user', text }); // This would be redundant

		const sessionId = crypto.randomUUID();
		
		const controller = new AbortController();
		abortControllerRef.current = controller;

		let finalAnswer = '';

		try {
			const subscription = await subscribe({
				app: adapters.inngest,
				channel: `voice-assistant.${sessionId}`,
				topics: ["agent_status", "tool_usage", "message", "debug", "system", "speak", 
				         "thought", "tool_call", "tool_result", "final_message", "hitl_request", "hitl_response", "hitl_timeout"],
			});

			// Determine what to send based on history mode configuration
			const requestData: any = { 
				input: text, 
				sessionId, 
				threadId,
			};

			// Handle different history modes
			const historyMode = config.history?.mode || 'hybrid';
			
			if (historyMode === 'client-authoritative' || historyMode === 'hybrid') {
				// In hybrid or client-auth mode, send the full conversation history as `messages`.
				// AgentKit will use this instead of fetching from the DB.
				if (newInteractions.length > 0) {
					requestData.messages = interactionsToMessages(newInteractions);
				}
			}
			// In server-authoritative mode, we send only the threadId and let the server fetch history.

			await adapters.inngest.send({
				name: 'app/voice.request',
				data: requestData,
			});

			const reader = subscription.getReader();
			while (true) {
				// If the exit signal has been given, break the loop
				if (controller.signal.aborted) {
					throw new DOMException('Query was aborted by the user', 'AbortError');
				}
				
				const { done, value: event } = await reader.read();
				if (done) break;

				console.log('[DEBUG] Received event:', event.topic, event.data);

				// Handle new event types
				if (event.topic === 'thought') {
					const data = event.data as ThoughtEvent;
					addStreamEvent(data);
					addLog(`💭 ${data.agentName}: ${data.content.substring(0, 100)}...`);
				} else if (event.topic === 'tool_call') {
					const data = event.data as ToolCallEvent;
					addStreamEvent(data);
					addLog(`🔧 ${data.agentName} calling ${data.toolName}`);
				} else if (event.topic === 'tool_result') {
					const data = event.data as ToolResultEvent;
					addStreamEvent(data);
					addLog(`✅ ${data.toolName} completed`);
				} else if (event.topic === 'final_message') {
					const data = event.data as { content: string; timestamp: Date };
					finalAnswer = data.content;
					setStatus('SPEAKING');
					addInteraction({ type: 'agent', text: finalAnswer });
					await adapters.tts.play(finalAnswer, controller.signal);

					if (controller.signal.aborted) { break; }
					
					// Apply a consistent 2-second delay
					await delay(2000); 

					setStatus('AWAITING_RESPONSE');
				} else if (event.topic === 'hitl_request') {
					const data = event.data as any; // Use any to handle the full data structure
					console.log('[DEBUG] Received HITL request event:', JSON.stringify(data, null, 2));
					setPendingHITL(data);
					addLog(`🤝 Human approval requested: ${data.request}`);
					addStreamEvent(data); // Remove the spread operator since type is already in data
				} else if (event.topic === 'hitl_response') {
					const data = event.data as { messageId: string; approved: boolean; response?: string };
					addLog(`🤝 Human ${data.approved ? 'approved' : 'denied'}: ${data.response || 'No reason'}`);
					setPendingHITL(null);
					setStatus('THINKING');
				} else if (event.topic === 'hitl_timeout') {
					const data = event.data as { messageId: string };
					addLog(`⏰ Human approval timed out`);
					setPendingHITL(null);
					setStatus('IDLE');
				} else if (event.topic === 'agent_status') {
					const data = event.data as { agentName: string; status: 'thinking' | 'completed' | 'error'; message?: string };
					if (data.status === 'thinking') {
						addLog(`${data.agentName} thinking...`);
					} else if (data.status === 'completed') {
						addLog(`${data.agentName} completed`);
					}
				} else if (event.topic === 'tool_usage') {
					const data = event.data as { agentName: string; toolName: string; status: 'using' | 'completed' | 'error'; error?: string };
					if (data.status === 'using') {
						addLog(`Using ${data.toolName}`);
					} else if (data.status === 'completed') {
						addLog(`Used ${data.toolName}`);
					} else if (data.status === 'error') {
						addLog(`Error using ${data.toolName}: ${data.error || 'Unknown error'}`);
					}
				} else if (event.topic === 'system') {
					const data = event.data as { event: string; message: string };
					addLog(data.message);
				} else if (event.topic === 'debug') {
					const data = event.data as { level: 'info' | 'warn' | 'error'; message: string; details?: any };
					// Only show debug logs in debug mode (we can add this later)
					// For now, skip debug logs in normal mode
				} else if (event.topic === 'speak') {
					finalAnswer = event.data as string;
					setStatus('SPEAKING');
					addInteraction({ type: 'agent', text: finalAnswer });
					await adapters.tts.play(finalAnswer, controller.signal);

					if (controller.signal.aborted) { break; }
					
					// Apply a consistent 2-second delay
					await delay(2000); 

					setStatus('AWAITING_RESPONSE');
				}
			}
		} catch (error) {
			// Gracefully handle the abort error on exit
			if (error instanceof Error && error.name === 'AbortError') {
				addLog('Query cancelled.');
				return;
			}
			const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
			addLog(`❌ Error: ${errorMessage}`);
			addInteraction({ type: 'agent', text: `I'm sorry, I encountered an error.` });
		} finally {
			// Don't set to IDLE here anymore if we are awaiting a response
			if (status !== 'AWAITING_RESPONSE') {
				setStatus('IDLE');
			}
		}
	}, [adapters, addLog, addInteraction, status, currentThreadId, createNewThread, interactions, config, setInteractions, addStreamEvent]);

	// Function to start the wake word detection loop
	const startWakeWordDetection = useCallback(async () => {
		addLog('Listening for wake word...');
		await adapters.wakeWord.waitForWakeWord();

		setStatus('LISTENING');
		const audioData = await adapters.wakeWord.record();
		
		if (audioData.length <= 44) {
			addLog("Did not hear a command.");
			// The App's useEffect will now handle setting status back to IDLE
			setStatus('IDLE');
			return;
		}
		
		setStatus('THINKING');
		addLog("Transcribing command...");
		const transcript = await adapters.stt.transcribe(audioData);
		
		if (transcript) {
			await processQuery(transcript);
		} else {
			addLog("Could not understand command.");
			setStatus('IDLE');
		}
	}, [adapters, processQuery, addLog]);

	const listenForResponse = useCallback(async (): Promise<boolean> => {
		addLog('Listening for response...');
		// Listen for 3 seconds as requested
		const audioData = await adapters.wakeWord.listenForSpeech(3); 

		if (!audioData) {
			addLog('No response detected, returning to wake word detection.');
			setStatus('IDLE');
			return false;
		}

		setStatus('THINKING');
		addLog("Transcribing response...");
		const transcript = await adapters.stt.transcribe(audioData);

		if (transcript) {
			await processQuery(transcript);
			return true;
		} else {
			addLog("Could not understand response.");
			setStatus('IDLE');
			return false;
		}
	}, [adapters, processQuery, addLog]);

	const interruptSpeech = useCallback(() => {
		if (status === 'SPEAKING') {
			speechInterruptedRef.current = true;
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
			adapters.tts.stop();
			addLog('Speech interrupted by user.');
			setStatus('IDLE');
		}
	}, [status, adapters, addLog]);

	// Function to send HITL response
	const sendHITLResponse = useCallback(async (messageId: string, approved: boolean, response?: string) => {
		if (!adapters.inngest) {
			throw new Error('Inngest adapter not configured');
		}

		// This now sends the event that the agent is actually waiting for
		await adapters.inngest.send({
			name: 'app/cli.approval',
			data: {
				messageId,
				approved,
				response,
				userId: "cli-user",
			}
		});

		// Clear pending HITL and reset status
		setPendingHITL(null);
		setStatus('THINKING');
	}, [adapters]);

	// Function to approve HITL (alternative method for backwards compatibility)
	const approveHITL = useCallback(async (approved: boolean, response?: string) => {
		if (pendingHITL) {
			await sendHITLResponse(pendingHITL.messageId, approved, response);
		}
	}, [pendingHITL, sendHITLResponse]);

	return {
		status,
		logs,
		interactions,
		streamEvents,
		pendingHITL,
		startWakeWordDetection,
		listenForResponse,
		interruptSpeech,
		submitTextQuery: processQuery,
		sendHITLResponse,
		cleanup,
		currentThreadId,
		createNewThread,
		loadThread,
		listThreads,
		hitlRequest: pendingHITL, // Alias for backwards compatibility
		approveHITL,
	};
} 