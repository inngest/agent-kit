import React from 'react';
import { Box, Text } from 'ink';
import { AgentStatus } from '../hooks/useAgent.js';

interface HeaderProps {
	status: AgentStatus;
}

const Header = ({ status }: HeaderProps) => {
	return (
		<Box borderStyle="round" paddingX={2}>
			<Text color="cyan">AgentKit Assistant</Text>
			<Box flexGrow={1} />
			<Text color="yellow">[{status}]</Text>
		</Box>
	);
};

export default Header; 