/* eslint-disable */
import { readFileSync } from "fs";
import { join } from "path";
import { anthropic, createAgent } from "@inngest/agent-kit";

// Create the code assistant agent
const codeAssistant = createAgent({
  name: "code_assistant",
  system:
    "An AI assistant that helps answer questions about code by reading and analyzing files",
  model: anthropic({
    model: "claude-3-5-sonnet-latest",
    defaultParameters: {
      max_tokens: 4096,
    },
  }),
});

async function main() {
  // First step: Retrieval
  const filePath = join(process.cwd(), `files/example.ts`);
  const code = readFileSync(filePath, "utf-8");
  // Second step: Generation
  const { output } = await codeAssistant.run(`What the following code does?

  ${code}
  `);
  const lastMessage = output[output.length - 1];
  const content =
    lastMessage?.type === "text" ? (lastMessage?.content as string) : "";
  console.log(content);
}

main();

// This code is a collection of type-safe sorting utility functions written in TypeScript. Here's a breakdown of each function:

// 1. `sortNumbers(numbers: number[], descending = false)`
// - Sorts an array of numbers in ascending (default) or descending order
// - Returns a new sorted array without modifying the original

// 2. `sortStrings(strings: string[], options)`
// - Sorts an array of strings alphabetically
// - Accepts options for case sensitivity and sort direction
// - Default behavior is case-insensitive ascending order
// - Returns a new sorted array

// 3. `sortByKey<T>(items: T[], key: keyof T, descending = false)`
// - Sorts an array of objects by a specific key
// - Handles both number and string values
// - Generic type T ensures type safety
// - Returns a new sorted array

// 4. `sortByMultipleKeys<T>(items: T[], sortKeys: Array<...>)`
// - Sorts an array of objects by multiple keys in order
// - Each key can have its own sort configuration (descending, case sensitivity)
// - Continues to next key if values are equal
// - Returns a new sorted array

// 5. `sortDates(dates: (Date | string)[], descending = false)`
// - Sorts an array of dates (either Date objects or date strings)
// - Converts string dates to Date objects
// - Sorts by timestamp in ascending (default) or descending order
// - Returns a new sorted array of Date objects

// Key features of all functions:
// - They are pure functions (don't modify input arrays)
// - Type-safe with TypeScript
// - Support both ascending and descending order
// - Return new sorted arrays
// - Handle different data types appropriately

// Usage example:
// ```typescript
// // Sort numbers
// sortNumbers([3, 1, 4, 1, 5], true); // [5, 4, 3, 1, 1]

// // Sort strings
// sortStrings(['banana', 'Apple', 'cherry'], { caseSensitive: false }); // ['Apple', 'banana', 'cherry']

// // Sort objects by key
// sortByKey([{age: 30}, {age: 25}], 'age'); // [{age: 25}, {age: 30}]

// // Sort by multiple keys
// sortByMultipleKeys([
//   {name: 'John', age: 30},
//   {name: 'John', age: 25}
// ], [
//   {key: 'name'},
//   {key: 'age'}
// ]);

// // Sort dates
// sortDates(['2023-01-01', '2022-12-31']); // [Date(2022-12-31), Date(2023-01-01)]
// ```
