Phase 1 (UI Cleanup):

- [x] Move branch button to start at end
- Remove message background for tool use
- When initial message part is created, don't immediately render message card background, avatar, etc - instead only show a loading indicator with text to the right of it saying Thinking...
- Remove connected header / whitespace at the top of the page
- Only show mock reasoning / thoughts + mocked sources only after all message parts for a given message have arrived
- Make the chat UI full screen with little padding on left/right around the input field

Phase 2:

- Make save-results step happen at the end
- Make the router always go back to the agent after using a tool
- Check to see what the history sequence looks like - I have a feeling that message may be getting sent to the LLM out of order (new messages being sent as messages in the beginning of the conversation)
- Add support for sources in message events
- Add support for reasoning parts
- Make streaming simulated reasoning and LLM tokens configurable (for testing)
- Test with single agent setup (no network involved)

Phase 3:

- Review the spec and add additional tasks here

Phase 4:

- Move use-agent hook to agentkit package and test
- Add automated testing
