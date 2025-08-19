Phase 1:

- redesign input area
- integrate ability to create new chat, paginate through a list of past threads, load a selected thread - via db adapter

Phase 2:

- Add support for agent in message part events
- Make save-results step happen at the end
- Make the router always go back to the agent after using a tool
- Check to see what the history sequence looks like - I have a feeling that message may be getting sent to the LLM out of order (new messages being sent as messages in the beginning of the conversation)
- Make streaming simulated reasoning and LLM tokens configurable (for testing)
- Test with single agent setup (no network involved)

Phase 3:

- Review the spec and add additional tasks here

Phase 4:

- Move use-agent hook to agentkit package and test
- Add automated testing

Phase 5 (later later):

- Add support for sources in message events
- Add support for reasoning parts
