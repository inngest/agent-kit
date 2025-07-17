import React from 'react';
import { Box, Text } from 'ink';
import { AgentStatus } from '../hooks/useAgent.js';

interface StatusBarProps {
	status: AgentStatus;
}

const StatusBar = ({ status }: StatusBarProps) => {
	const getStatusInfo = (): { color: string; text: string } => {
		switch (status) {
			case 'LISTENING': return { color: 'yellow', text: 'LISTENING FOR COMMAND...' };
			case 'AWAITING_RESPONSE': return { color: 'yellow', text: 'LISTENING FOR RESPONSE...' };
			case 'THINKING': return { color: 'blue', text: 'THINKING...' };
			case 'SPEAKING': return { color: 'magenta', text: 'SPEAKING...' };
			case 'IDLE':
			default:
				return { color: 'green', text: 'IDLE (Listening for wake word)' };
		}
	};

	const { color, text } = getStatusInfo();

	return (
		<Box borderStyle="round" paddingX={2}>
			<Text color={color}>STATUS: {text}</Text>
			<Box flexGrow={1} />
			<Text color="gray">Press 'i' to type | 'm' to mute | 'q' to quit</Text>
		</Box>
	);
};

export default StatusBar; 