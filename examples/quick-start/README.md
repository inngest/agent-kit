# Quick start example

This is the code created by following the [quick start guide](https://agentkit.inngest.com/getting-started/quick-start) in the AgentKit docs.

## Setup

To run this code locally you will need:

- An Anthropic API key to call the [Claude 3.5 Haiku model](https://docs.anthropic.com/en/docs/about-claude/models)
- Node + npm installed

Install all npm dependencies:

```shell
npm install
```

Set your API key:

```shell
export ANTHROPIC_API_KEY=sk-ant-api03-XXXXXX....
```

Run the AgentKit server:

```shell
npm start
```

Run the Inngest dev server to test and debug your agents and networks:

```shell
npm run inngest-dev
# or run it directly
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open the Inngest dev server's functions tab (`http://localhost:8288/functions`) and click the Invoke button for any of your agents or networks. Write your input prompt and click "Invoke function:"

```json
{
  "data": {
    "input": "I am building a Finance application. Help me answer the following 2 questions: \n - How can I scale my application to millions of request per second? \n - How should I design my schema to ensure the safety of each organization's data?"
  }
}
```

That's all! Use this minimal quick start repo to experiment and learn AgentKit concepts. Head over to the [AgentKit docs](https://agentkit.inngest.com/) for more information on agents, networks, tools, routers and more!
