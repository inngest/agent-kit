import React from 'react';
import { Box, Text } from 'ink';
import { Interaction } from '../hooks/useAgent';

interface InteractionsListProps {
	interactions: Interaction[];
}

const InteractionsList = ({ interactions }: InteractionsListProps) => {
	return (
		<Box flexDirection="column" padding={1} flexGrow={2}>
			{interactions.map((interaction, index) => (
				<Text key={index}>
					{interaction.type === 'user' ? 'User: ' : 'Agent: '}
					{interaction.text}
				</Text>
			))}
		</Box>
	);
};

export default InteractionsList; 