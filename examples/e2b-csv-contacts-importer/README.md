# CSV Contacts Importer with AgentKit and E2B

This Next.js project demonstrates how to build an AI-powered CSV contacts importer using [AgentKit](https://agentkit.inngest.com) and [E2B](https://e2b.dev). The agent automatically maps CSV contact data to a standardized format and ranks contacts based on customizable criteria.

## Features

- 🤖 AI-powered contact field mapping
- 📊 Automatic contact ranking based on criteria (e.g., job title)
- 🔒 Secure code execution using E2B sandboxes

## How It Works

The project uses an AgentKit network with a specialized agent (`contactsMapperAgent`) that:

1. Takes raw CSV contact data with arbitrary fields
2. Maps the fields to standardized properties: `${MAP_FIELDS.join(", ")}`
3. Ranks contacts based on provided criteria
4. Returns the transformed and ranked contacts

The agent uses E2B's secure sandbox to safely execute the generated JavaScript code for contact transformation.

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Required for AgentKit
INNGEST_API_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

# Required for OpenAI (used by the contacts mapper agent)
OPENAI_API_KEY=your_openai_api_key

# Required for E2B sandbox
E2B_API_KEY=your_e2b_api_key
```

### 3. Start the Development Servers

1. Start the Next.js development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

2. Start the Inngest development server (in a separate terminal):

```bash
npx inngest-cli@latest dev
```

Open [http://localhost:3000](http://localhost:3000) to see your application and [http://localhost:8288](http://localhost:8288) to access the Inngest Dev Server UI.

## Usage

To import contacts, open the Next.js application at [http://localhost:3000](http://localhost:3000) and upload a CSV file. You will find sample CSV files in the example directory: `contacts.csv` and `contacts_2.csv`.

The agent will process the contacts and return them in the standardized format with rankings.

## Learn More

- [AgentKit Documentation](https://agentkit.inngest.com/overview)
- [E2B Documentation](https://e2b.dev/docs)
- [Inngest Documentation](https://www.inngest.com/docs)
