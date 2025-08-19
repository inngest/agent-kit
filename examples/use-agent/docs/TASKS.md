1/

- Add support for agent in message part events
- Make save-results step happen at the end
- Make the router always go back to the agent after using a tool
- Check to see what the history sequence looks like - I have a feeling that message may be getting sent to the LLM out of order (new messages being sent as messages in the beginning of the conversation)
- Make streaming simulated reasoning and LLM tokens configurable (for testing)
- Test with single agent setup (no network involved)

2/

- Review the spec and add additional tasks here

3/

- Move use-agent hook to agentkit package and test
- Add automated testing

4/

- Add support for sources in message events
- Integrate llm + reasoning token streaming
- Add support for reasoning parts
