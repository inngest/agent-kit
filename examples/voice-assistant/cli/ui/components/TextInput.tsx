import React, {useState} from 'react';
import {Text} from 'ink';
import TextInput from 'ink-text-input';

interface QueryInputProps {
	onSubmit: (text: string) => void;
}

const QueryInput = ({ onSubmit }: QueryInputProps) => {
	const [query, setQuery] = useState('');

	const handleSubmit = () => {
		onSubmit(query);
		setQuery(''); // Clear the input after submission
	};

	return (
		<>
			<Text>Enter your query: </Text>
			<TextInput
				value={query}
				onChange={setQuery}
				onSubmit={handleSubmit}
			/>
		</>
	);
};

export default QueryInput; 