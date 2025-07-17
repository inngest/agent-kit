import React, { useState, useEffect } from 'react';
import { Box, useApp, useInput, Text } from 'ink';
import { useAgent } from './hooks/useAgent.js';
import { AgentKitConfig } from '../config/schema.js';
import { VoiceAdapters } from '../voice-adapters/index.js';
import type { StreamEvent, HITLRequestEvent } from './hooks/useAgent.js';

type Mode = 'VOICE' | 'TEXT_INPUT' | 'COMMAND_MENU' | 'THREAD_HISTORY' | 'HITL_APPROVAL' | 'DEBUG_VIEW';

interface AppProps {
	config: AgentKitConfig;
	adapters: VoiceAdapters;
}

interface ConversationItem {
	type: 'user' | 'assistant' | 'log' | 'thought' | 'tool_call' | 'tool_result' | 'hitl_request';
	content: string;
	timestamp: Date;
	isDebugLog?: boolean; // Flag to identify debug-only logs
	metadata?: any; // Additional metadata for events
}

interface Command {
	id: string;
	label: string;
	description: string;
	shortcut?: string;
	action: () => void;
}

interface Thread {
	threadId: string;
	metadata: any;
	createdAt: Date;
	updatedAt: Date;
	preview?: string;
}

export default function App({ config, adapters }: AppProps) {
	const { exit } = useApp();
	const [mode, setMode] = useState<Mode>('VOICE');
	const [textInput, setTextInput] = useState('');
	const [conversation, setConversation] = useState<ConversationItem[]>([]);
	const [scrollOffset, setScrollOffset] = useState(0);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [debugMode, setDebugMode] = useState(false);
	const [currentStatus, setCurrentStatus] = useState<string>(''); // Single dynamic status line
	const [spinnerFrame, setSpinnerFrame] = useState(0);
	const [commandMenuQuery, setCommandMenuQuery] = useState('');
	const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
	const [threads, setThreads] = useState<Thread[]>([]);
	const [selectedThreadIndex, setSelectedThreadIndex] = useState(0);
	const [isLoadingThreads, setIsLoadingThreads] = useState(false);
	const [hitlApprovalInput, setHitlApprovalInput] = useState('');
	const [selectedHitlOption, setSelectedHitlOption] = useState(0);
	const {
		status,
		logs,
		interactions,
		streamEvents,
		pendingHITL,
		startWakeWordDetection,
		listenForResponse,
		interruptSpeech,
		submitTextQuery,
		sendHITLResponse,
		cleanup,
		currentThreadId,
		createNewThread,
		loadThread,
		listThreads,
	} = useAgent(config, adapters);

	// Spinner animation frames
	const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

	// Note: We don't clear console here as it interferes with Ink's rendering
	// Ink automatically manages the terminal display

	// Get current working directory
	const currentDir = process.cwd();
	const shortDir = currentDir
		.replace(process.env.HOME || '', '~')
		.split('/')
		.slice(-3)
		.join('/');

	// Custom exit handler
	const handleExit = async () => {
		await cleanup();
		exit();
	};

	// Define available commands
	const commands: Command[] = [
		{
			id: 'mute',
			label: 'Mute',
			description: 'Interrupt current speech',
			shortcut: 'm',
			action: () => {
				interruptSpeech();
				setMode('VOICE');
			}
		},
		{
			id: 'quit',
			label: 'Quit',
			description: 'Exit the application',
			shortcut: 'q',
			action: handleExit
		},
		{
			id: 'debug',
			label: 'Debug Mode',
			description: `Turn debug mode ${debugMode ? 'off' : 'on'}`,
			shortcut: 'd',
			action: () => {
				setDebugMode(prev => !prev);
				setMode('VOICE');
			}
		},
		{
			id: 'debug-view',
			label: 'Debug View',
			description: 'Show detailed event stream',
			shortcut: 'v',
			action: () => {
				setMode('DEBUG_VIEW');
			}
		},
		{
			id: 'history',
			label: 'History',
			description: 'View conversation threads',
			shortcut: 'h',
			action: async () => {
				setMode('THREAD_HISTORY');
				setIsLoadingThreads(true);
				try {
					const threadList = await listThreads();
					setThreads(threadList);
				} catch (error) {
					addLog(`Error loading threads: ${error instanceof Error ? error.message : String(error)}`);
				} finally {
					setIsLoadingThreads(false);
				}
			}
		},
		{
			id: 'new-thread',
			label: 'New Thread',
			description: 'Start a new conversation thread',
			shortcut: 'n',
			action: async () => {
				try {
					await createNewThread();
					// Clear conversation and interactions when starting a new thread
					setConversation([]);
					setInteractions([]);
					addLog('Created new conversation thread');
					setMode('VOICE');
				} catch (error) {
					addLog(`Error creating new thread: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}
	];

	const addLog = (log: string) => {
		setConversation(prev => [...prev, {
			type: 'log',
			content: log,
			timestamp: new Date()
		}]);
	};

	const setInteractions = (newInteractions: Array<{ type: 'user' | 'agent'; text: string }>) => {
		// Update conversation based on new interactions
		const items: ConversationItem[] = newInteractions.map(interaction => ({
			type: interaction.type === 'user' ? 'user' : 'assistant',
			content: interaction.text,
			timestamp: new Date()
		}));
		setConversation(items);
	};

	// Filter commands based on query
	const filteredCommands = commands.filter(cmd => 
		cmd.label.toLowerCase().includes(commandMenuQuery.toLowerCase()) ||
		cmd.description.toLowerCase().includes(commandMenuQuery.toLowerCase())
	);

	// Reset selected index when filtered commands change
	useEffect(() => {
		setSelectedCommandIndex(0);
	}, [commandMenuQuery]);

	// Spinner animation effect
	useEffect(() => {
		if (currentStatus) {
			const interval = setInterval(() => {
				setSpinnerFrame(prev => (prev + 1) % spinnerFrames.length);
			}, 100); // Update every 100ms for smooth animation

			return () => clearInterval(interval);
		}
	}, [currentStatus, spinnerFrames.length]);

	// Handle HITL approval mode
	useEffect(() => {
		if (pendingHITL && mode !== 'HITL_APPROVAL') {
			setMode('HITL_APPROVAL');
			setSelectedHitlOption(0);
			setHitlApprovalInput('');
		}
	}, [pendingHITL, mode]);

	// Helper function to capitalize first letter
	const capitalizeFirstLetter = (str: string): string => {
		if (!str) return str;
		return str.charAt(0).toUpperCase() + str.slice(1);
	};

	// Calculate visible area height (terminal height minus UI elements)
	const getVisibleHeight = () => {
		return Math.max(10, process.stdout.rows - 6); // Reserve space for input, status bar, etc.
	};

	// Auto-scroll to bottom when new messages arrive (only if already at bottom)
	useEffect(() => {
		if (isAtBottom && conversation.length > 0) {
			const visibleHeight = getVisibleHeight();
			const maxOffset = Math.max(0, conversation.length - visibleHeight);
			setScrollOffset(maxOffset);
		}
	}, [conversation, isAtBottom]);

	// Update current status based on latest logs
	useEffect(() => {
		if (logs.length > 0) {
			const latestLog = logs[logs.length - 1];
			
			// Update the current status with the latest relevant log
			if (latestLog && (latestLog.includes('thinking...') || 
				latestLog.includes('Using ') || 
				latestLog.includes('Used ') ||
				latestLog.includes('completed'))) {
				setCurrentStatus(latestLog);
			}
		}
	}, [logs]);

	// Clear status when assistant response arrives
	useEffect(() => {
		if (interactions.length > 0) {
			const latestInteraction = interactions[interactions.length - 1];
			if (latestInteraction && latestInteraction.type === 'agent') {
				setCurrentStatus(''); // Clear status when response arrives
			}
		}
	}, [interactions]);

	// Handle key inputs
	useInput((input, key) => {
		// HITL approval mode handling
		if (mode === 'HITL_APPROVAL' && pendingHITL) {
			if (key.escape) {
				// Deny on escape
				sendHITLResponse(pendingHITL.messageId, false, 'User cancelled');
				setMode('VOICE');
				return;
			}
			if (pendingHITL.options && pendingHITL.options.length > 0) {
				// Handle option selection
				if (key.upArrow) {
					setSelectedHitlOption(prev => 
						prev > 0 ? prev - 1 : pendingHITL.options!.length - 1
					);
					return;
				}
				if (key.downArrow) {
					setSelectedHitlOption(prev => 
						prev < pendingHITL.options!.length - 1 ? prev + 1 : 0
					);
					return;
				}
				if (key.return) {
					const selectedOption = pendingHITL.options[selectedHitlOption];
					sendHITLResponse(pendingHITL.messageId, true, selectedOption);
					setMode('VOICE');
					return;
				}
			} else {
				// Handle text input for approval/denial
				if (key.return) {
					const approved = hitlApprovalInput.toLowerCase().includes('y') || 
					                hitlApprovalInput.toLowerCase().includes('approve');
					sendHITLResponse(pendingHITL.messageId, approved, hitlApprovalInput);
					setMode('VOICE');
					return;
				}
				if (key.backspace || key.delete) {
					setHitlApprovalInput(prev => prev.slice(0, -1));
					return;
				}
				if (input && !key.ctrl && !key.meta) {
					setHitlApprovalInput(prev => prev + input);
					return;
				}
			}
			return;
		}

		// Debug view mode handling
		if (mode === 'DEBUG_VIEW') {
			if (key.escape) {
				setMode('VOICE');
				return;
			}
			// Allow scrolling in debug view
			const visibleHeight = getVisibleHeight();
			const maxOffset = Math.max(0, streamEvents.length - visibleHeight);
			
			if (key.upArrow) {
				setScrollOffset(prev => Math.max(0, prev - 1));
				return;
			}
			if (key.downArrow) {
				setScrollOffset(prev => Math.min(maxOffset, prev + 1));
				return;
			}
			return;
		}

		// Thread history mode handling
		if (mode === 'THREAD_HISTORY') {
			if (key.escape) {
				setMode('VOICE');
				return;
			}
			if (key.upArrow) {
				setSelectedThreadIndex(prev => 
					prev > 0 ? prev - 1 : threads.length - 1
				);
				return;
			}
			if (key.downArrow) {
				setSelectedThreadIndex(prev => 
					prev < threads.length - 1 ? prev + 1 : 0
				);
				return;
			}
			if (key.return && threads.length > 0) {
				const selectedThread = threads[selectedThreadIndex];
				if (selectedThread) {
					loadThread(selectedThread.threadId).then(() => {
						addLog(`Loaded thread: ${selectedThread.threadId}`);
						setMode('VOICE');
					}).catch(error => {
						addLog(`Error loading thread: ${error instanceof Error ? error.message : String(error)}`);
					});
				}
				return;
			}
			return;
		}

		// Command menu mode handling
		if (mode === 'COMMAND_MENU') {
			if (key.escape) {
				setMode('VOICE');
				setCommandMenuQuery('');
				return;
			}
			if (key.upArrow) {
				setSelectedCommandIndex(prev => 
					prev > 0 ? prev - 1 : filteredCommands.length - 1
				);
				return;
			}
			if (key.downArrow) {
				setSelectedCommandIndex(prev => 
					prev < filteredCommands.length - 1 ? prev + 1 : 0
				);
				return;
			}
			if (key.return && filteredCommands.length > 0) {
				const selectedCommand = filteredCommands[selectedCommandIndex];
				if (selectedCommand) {
					selectedCommand.action();
					setCommandMenuQuery('');
				}
				return;
			}
			if (key.backspace || key.delete) {
				setCommandMenuQuery(prev => prev.slice(0, -1));
				return;
			}
			if (input && !key.ctrl && !key.meta) {
				setCommandMenuQuery(prev => prev + input);
				return;
			}
			return;
		}

		// Global shortcuts
		if (key.ctrl && input === 'c') {
			handleExit();
			return;
		}
		
		// Open command menu with slash
		if (input === '/' && mode !== 'TEXT_INPUT') {
			setMode('COMMAND_MENU');
			setCommandMenuQuery('');
			setSelectedCommandIndex(0);
			return;
		}
		
		if (input === 'q' && mode !== 'TEXT_INPUT') {
			handleExit();
			return;
		}
		if (key.escape) {
			setMode('VOICE');
			setTextInput('');
		}
		if (input === 'i' && mode !== 'TEXT_INPUT') {
			setMode('TEXT_INPUT');
		}
		if (input === 'm') {
			interruptSpeech();
		}
		// Toggle debug mode with 'D' key
		if (input === 'd' && mode !== 'TEXT_INPUT') {
			setDebugMode(prev => !prev);
			return;
		}

		// Handle scrolling (only when not in text input mode)
		if (mode !== 'TEXT_INPUT') {
			const visibleHeight = getVisibleHeight();
			const maxOffset = Math.max(0, conversation.length - visibleHeight);
			
			if (key.upArrow) {
				const scrollAmount = key.shift ? 5 : 1; // Shift+Up = 5 lines, Up = 1 line
				setScrollOffset(prev => {
					const newOffset = Math.max(0, prev - scrollAmount);
					setIsAtBottom(newOffset === maxOffset);
					return newOffset;
				});
				return;
			}
			if (key.downArrow) {
				const scrollAmount = key.shift ? 5 : 1; // Shift+Down = 5 lines, Down = 1 line
				setScrollOffset(prev => {
					const newOffset = Math.min(maxOffset, prev + scrollAmount);
					setIsAtBottom(newOffset === maxOffset);
					return newOffset;
				});
				return;
			}
			if (key.pageUp) {
				setScrollOffset(prev => {
					const newOffset = Math.max(0, prev - Math.floor(visibleHeight / 2));
					setIsAtBottom(newOffset === maxOffset);
					return newOffset;
				});
				return;
			}
			if (key.pageDown) {
				setScrollOffset(prev => {
					const newOffset = Math.min(maxOffset, prev + Math.floor(visibleHeight / 2));
					setIsAtBottom(newOffset === maxOffset);
					return newOffset;
				});
				return;
			}
			// Ctrl+Home - go to top
			if (key.ctrl && input === 'h') {
				setScrollOffset(0);
				setIsAtBottom(false);
				return;
			}
			// Ctrl+End - go to bottom
			if (key.ctrl && input === 'e') {
				setScrollOffset(maxOffset);
				setIsAtBottom(true);
				return;
			}
		}
		
		// Handle text input
		if (mode === 'TEXT_INPUT') {
			if (key.return) {
				if (textInput.trim()) {
					submitTextQuery(textInput.trim());
					setTextInput('');
				}
				setMode('VOICE');
			} else if (key.backspace || key.delete) {
				setTextInput(prev => prev.slice(0, -1));
			} else if (input && !key.ctrl && !key.meta) {
				setTextInput(prev => prev + input);
			}
		}
	});

	// Helper function to determine if a log is debug-only
	const isDebugOnlyLog = (log: string): boolean => {
		// These are debug-only logs that should be hidden in normal mode
		const debugPatterns = [
			// Workflow logs
			'Starting voice assistant workflow',
			'Checking memories',
			'No relevant memories found',
			'Found \\d+ memories',
			'Memory management step complete',
			'Workflow complete',
			'Updating memories',
			// Agent completion logs
			'memory-retriever thinking',
			'memory-manager thinking',
			'memory-retriever completed',
			'memory-manager completed',
			// Initial setup logs
			'🎤 Wake word engine initialized',
			'Listening for wake word',
			'Transcribing command',
			'Did not hear a command',
			'Could not understand command',
			'Listening for response',
			'No response detected, returning to wake word detection',
			'Speech interrupted by user'
		];
		
		return debugPatterns.some(pattern => new RegExp(pattern).test(log));
	};

	// Update conversation when interactions and stream events change
	useEffect(() => {
		const newConversation: ConversationItem[] = [];
		
		// Add interactions
		interactions.forEach((interaction) => {
			if (interaction.type === 'user') {
				newConversation.push({
					type: 'user',
					content: interaction.text,
					timestamp: new Date()
				});
			} else if (interaction.type === 'agent') {
				newConversation.push({
					type: 'assistant',
					content: interaction.text,
					timestamp: new Date()
				});
			}
		});
		
		// Add stream events in debug mode
		if (debugMode) {
			streamEvents.forEach(event => {
				switch (event.type) {
					case 'thought':
						newConversation.push({
							type: 'thought',
							content: `[${event.agentName}] ${event.content}`,
							timestamp: event.timestamp,
							metadata: event
						});
						break;
					case 'tool_call':
						newConversation.push({
							type: 'tool_call',
							content: `[${event.agentName}] Calling ${event.toolName}`,
							timestamp: event.timestamp,
							metadata: event
						});
						break;
					case 'tool_result':
						newConversation.push({
							type: 'tool_result',
							content: `[${event.agentName}] ${event.toolName} completed`,
							timestamp: event.timestamp,
							metadata: event
						});
						break;
					case 'hitl_request':
						newConversation.push({
							type: 'hitl_request',
							content: `[${event.agentName}] Approval needed: ${event.request}`,
							timestamp: event.timestamp,
							metadata: event
						});
						break;
				}
			});
		}
		
		// Sort by timestamp
		newConversation.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
		
		setConversation(newConversation);
	}, [interactions, streamEvents, debugMode]);

	// This single effect now manages the entire agent lifecycle
	useEffect(() => {
		let isCancelled = false;
		
		async function agentLifecycle() {
			if (isCancelled || mode !== 'VOICE') return;

			try {
				if (status === 'IDLE') {
					await startWakeWordDetection();
				} else if (status === 'AWAITING_RESPONSE') {
					await listenForResponse();
				}
			} catch (error) {
				if (!isCancelled) {
					// Handle errors silently during cleanup
				}
			}
		}

		agentLifecycle();
		return () => {
			isCancelled = true;
		};
	}, [mode, status, startWakeWordDetection, listenForResponse]);

	const getStatusText = () => {
		switch (status) {
			case 'IDLE': return 'idle';
			case 'LISTENING': return 'listening';
			case 'THINKING': return 'thinking';
			case 'SPEAKING': return 'speaking';
			case 'AWAITING_RESPONSE': return 'awaiting';
			case 'AWAITING_APPROVAL': return 'approval';
			default: return 'ready';
		}
	};

	const getStatusColor = () => {
		switch (status) {
			case 'LISTENING': return 'green';
			case 'THINKING': return 'yellow';
			case 'SPEAKING': return 'blue';
			case 'AWAITING_RESPONSE': return 'cyan';
			case 'AWAITING_APPROVAL': return 'red';
			default: return 'gray';
		}
	};

	// In normal mode, only show user/assistant messages
	// In debug mode, show everything
	const filteredConversation = debugMode 
		? conversation 
		: conversation.filter(item => item.type === 'user' || item.type === 'assistant');

	// Calculate visible conversation items
	const visibleHeight = getVisibleHeight();
	const visibleConversation = filteredConversation.slice(scrollOffset, scrollOffset + visibleHeight);
	const hasMoreAbove = scrollOffset > 0;
	const hasMoreBelow = scrollOffset + visibleHeight < filteredConversation.length;

	return (
		<Box flexDirection="column" width="100%" height="100%">
			{/* HITL Approval Mode */}
			{mode === 'HITL_APPROVAL' && pendingHITL ? (
				<Box flexDirection="column" width="100%" height="100%">
					<Box borderStyle="single" borderColor="yellow" paddingX={1} paddingY={0} marginBottom={1}>
						<Text color="yellow" bold>⚠️  Human Approval Required</Text>
					</Box>
					
					<Box flexGrow={1} flexDirection="column" paddingX={2}>
						<Box marginBottom={2}>
							<Text color="white" bold>{pendingHITL.request}</Text>
						</Box>
						
						{pendingHITL.details && (
							<Box marginBottom={2}>
								<Text color="gray">{pendingHITL.details}</Text>
							</Box>
						)}
						
						<Box marginBottom={1}>
							<Text color="gray" dimColor>
								Expires at: {new Date(pendingHITL.expiresAt).toLocaleTimeString()}
							</Text>
						</Box>
						
						{pendingHITL.options && pendingHITL.options.length > 0 ? (
							<Box flexDirection="column">
								<Box marginBottom={1}>
									<Text color="cyan">Select an option:</Text>
								</Box>
								{pendingHITL.options.map((option, index) => (
									<Box key={index} marginBottom={0}>
										<Text color={index === selectedHitlOption ? 'green' : 'white'}>
											{index === selectedHitlOption ? '▸ ' : '  '}
											{option}
										</Text>
									</Box>
								))}
							</Box>
						) : (
							<Box>
								<Text color="cyan">Type your response: </Text>
								<Text color="white">{hitlApprovalInput}</Text>
								<Text color="cyan">█</Text>
							</Box>
						)}
					</Box>
					
					<Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
						<Text color="gray">
							{pendingHITL.options ? '↑/↓ Select • Enter to approve • Esc to deny' : 'Type response • Enter to submit • Esc to cancel'}
						</Text>
					</Box>
				</Box>
			) : mode === 'DEBUG_VIEW' ? (
				// Debug View Mode
				<Box flexDirection="column" width="100%" height="100%">
					<Box borderStyle="single" borderColor="magenta" paddingX={1} paddingY={0} marginBottom={1}>
						<Text color="magenta" bold>Debug Event Stream</Text>
					</Box>
					
					<Box flexGrow={1} flexDirection="column" paddingX={2}>
						{streamEvents.length === 0 ? (
							<Text color="gray">No events yet...</Text>
						) : (
							streamEvents.slice(scrollOffset, scrollOffset + getVisibleHeight()).map((event, index) => (
								<Box key={scrollOffset + index} marginBottom={1}>
									<Text color="gray" dimColor>
										[{new Date(event.timestamp).toLocaleTimeString()}]
									</Text>
									<Text> </Text>
									{event.type === 'thought' && (
										<Text color="blue">
											💭 {event.agentName}: {event.content.substring(0, 80)}...
										</Text>
									)}
									{event.type === 'tool_call' && (
										<Text color="yellow">
											🔧 {event.agentName} → {event.toolName}
										</Text>
									)}
									{event.type === 'tool_result' && (
										<Text color="green">
											✅ {event.toolName} completed
										</Text>
									)}
									{event.type === 'hitl_request' && (
										<Text color="red">
											🤝 Approval: {event.request}
										</Text>
									)}
								</Box>
							))
						)}
					</Box>
					
					<Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
						<Text color="gray">↑/↓ Scroll • Esc to return</Text>
					</Box>
				</Box>
			) : (
				<>
					{/* Main conversation area */}
					<Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
						{filteredConversation.length === 0 && !currentStatus ? (
							<Box justifyContent="center" alignItems="center" flexGrow={1}>
								<Text color="gray">Welcome to AgentKit CLI - Say "Hey Jarvis" to get started</Text>
							</Box>
						) : (
							<Box flexDirection="column">
								{hasMoreAbove && (
									<Box justifyContent="center">
										<Text color="gray" dimColor>↑ Scroll up for more messages (↑/↓ arrows, Shift+↑/↓ fast, PgUp/PgDn, Ctrl+H/E)</Text>
									</Box>
								)}
								{visibleConversation.map((item, index) => (
									<Box key={scrollOffset + index} marginBottom={item.type === 'log' ? 0 : 1}>
										{item.type === 'user' && (
											<Text color="cyan">
												<Text bold>{"> "}</Text>
												{item.content}
											</Text>
										)}
										{item.type === 'assistant' && (
											<Text color="green">
												<Text bold>Assistant: </Text>
												{item.content}
											</Text>
										)}
										{item.type === 'log' && (
											<Text color="gray" dimColor>
												  {item.content}
											</Text>
										)}
										{item.type === 'thought' && (
											<Text color="blue" dimColor>
												  💭 {item.content}
											</Text>
										)}
										{item.type === 'tool_call' && (
											<Text color="yellow" dimColor>
												  🔧 {item.content}
											</Text>
										)}
										{item.type === 'tool_result' && (
											<Text color="green" dimColor>
												  ✅ {item.content}
											</Text>
										)}
										{item.type === 'hitl_request' && (
											<Text color="red">
												  🤝 {item.content}
											</Text>
										)}
									</Box>
								))}
								{/* Show current status line in normal mode (only when processing) */}
								{!debugMode && currentStatus && (
									<Box marginTop={1}>
										<Text color="gray" dimColor>
											<Text color="cyan">{spinnerFrames[spinnerFrame]}</Text>
											<Text> {capitalizeFirstLetter(currentStatus)}</Text>
										</Text>
									</Box>
								)}
								{hasMoreBelow && (
									<Box justifyContent="center">
										<Text color="gray" dimColor>↓ Scroll down for more messages</Text>
									</Box>
								)}
							</Box>
						)}
					</Box>

					{/* Input area with command menu */}
					<Box marginBottom={2} paddingX={2} flexDirection="column">
						{/* Command menu dropdown */}
						{mode === 'COMMAND_MENU' && (
							<Box marginBottom={1} flexDirection="column">
								<Box borderStyle="single" borderColor="cyan" paddingX={1} paddingY={0}>
									<Box flexDirection="column">
										<Box marginBottom={1}>
											<Text color="cyan">Command Menu</Text>
											{commandMenuQuery && (
												<>
													<Text color="gray"> - </Text>
													<Text color="white">{commandMenuQuery}</Text>
												</>
											)}
										</Box>
										{filteredCommands.length === 0 ? (
											<Text color="gray" dimColor>No commands found</Text>
										) : (
											filteredCommands.map((cmd, index) => (
												<Box key={cmd.id} paddingLeft={1}>
													<Text color={index === selectedCommandIndex ? 'cyan' : 'white'}>
														{index === selectedCommandIndex ? '▸ ' : '  '}
														{cmd.label}
													</Text>
													{cmd.shortcut && (
														<>
															<Text color="gray"> (</Text>
															<Text color="yellow">{cmd.shortcut}</Text>
															<Text color="gray">)</Text>
														</>
													)}
													<Text color="gray" dimColor> - {cmd.description}</Text>
												</Box>
											))
										)}
									</Box>
								</Box>
							</Box>
						)}
						
						{/* Regular input box */}
						<Box justifyContent="center">
							<Box borderStyle="single" borderColor="gray" paddingX={1}>
								<Text color="cyan">{'>'}</Text>
								<Text> </Text>
								{mode === 'TEXT_INPUT' ? (
									<>
										<Text>{textInput}</Text>
										<Text color="cyan">█</Text>
									</>
								) : mode === 'COMMAND_MENU' ? (
									<Text color="gray" dimColor>Type to filter commands, ↑/↓ to navigate, Enter to select, Esc to cancel</Text>
								) : (
									<Text color="gray" dimColor>Press 'i' to type, '/' for commands, 'm' to mute, 'h' for history, 'n' for new thread</Text>
								)}
							</Box>
						</Box>
					</Box>

					{/* Bottom status bar */}
					<Box justifyContent="space-between" paddingX={2} paddingBottom={1}>
						<Box>
							<Text color="white">AgentKit CLI </Text>
							<Text color="gray">v0.1.0</Text>
							<Text color="gray"> • </Text>
							<Text color="gray">/{shortDir}</Text>
							{/* {currentThreadId && (
								<>
									<Text color="gray"> • </Text>
									<Text color="gray">Thread: {currentThreadId.substring(0, 8)}...</Text>
								</>
							)} */}
						</Box>
						<Box>
							<Text color={getStatusColor()}>{getStatusText()}</Text>
							{debugMode && (
								<>
									<Text color="gray"> • </Text>
									<Text color="yellow">DEBUG</Text>
								</>
							)}
							<Text color="gray"> • </Text>
							<Text color="gray">powered by inngest</Text>
							{filteredConversation.length > 0 && (
								<>
									<Text color="gray"> • </Text>
									<Text color="gray">{scrollOffset + 1}-{Math.min(scrollOffset + visibleHeight, filteredConversation.length)}/{filteredConversation.length}</Text>
								</>
							)}
						</Box>
					</Box>
				</>
			)}
		</Box>
	);
} 