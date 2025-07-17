import React from 'react';
import { Box, Text } from 'ink';

interface LogPanelProps {
	logs: string[];
}

const LogPanel = ({ logs }: LogPanelProps) => {
	return (
		<Box flexDirection="column" borderStyle="single" padding={1} flexGrow={1}>
			<Text color="gray">--- Agent Logs ---</Text>
			{logs.slice(-10).map((log, index) => (
				<Text key={index}>{log}</Text>
			))}
		</Box>
	);
};

export default LogPanel; 