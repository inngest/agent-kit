# Voice Assistant Example

This example demonstrates a powerful voice-activated AI assistant that integrates deeply with your macOS and various web services. It's built using AgentKit to orchestrate multiple tools and agents, providing a conversational interface to control your Mac, get information, and interact with services like Google Maps and Notion.

## Features

This assistant comes packed with a wide range of capabilities, allowing you to manage your daily tasks, communications, and information retrieval seamlessly through voice or text commands.

###  macOS Native Integrations

Control your Mac's core applications using natural language.

#### 🎙️ Voice Transcription

- **Start Transcription**: Activates your default voice-to-text application (like Superwhisper) to transcribe your speech in any text field.
  - _"start transcribing"_
  - _"begin dictation"_

#### 📅 Calendar Management

- **View Today's Events**: Get a quick overview of your schedule for the day.
  - _"What's on my calendar today?"_
  - _"Show me my events for today."_
- **Search for Events**: Find specific events by keyword, with an optional date range.
  - _"Search my calendar for "project sync" in the next two weeks."_
  - _"Find the meeting with Sarah."_
- **Create New Events**: Schedule new appointments in your default calendar.
  - _"Create a calendar event for a "Dentist Appointment" tomorrow at 3 PM."_
  - _"Schedule a meeting with the team for Friday at 10 AM to discuss the quarterly report."_

#### ✅ Reminders & Notes

- **Create Reminders**: Quickly add tasks to your Reminders app.
  - _"Remind me to buy milk when I leave work."_
  - _"Create a reminder to call the bank tomorrow morning."_
- **View Reminders**: Fetch tasks from specific lists or all your reminders.
  - _"Show me my reminders in the 'Work' list."_
  - _"What are all my reminders?"_
- **Create Notes**: Jot down thoughts and ideas directly into Apple Notes.
  - _"Create a note titled 'Meeting Ideas' with the body 'Brainstorm a new feature for the app'."_
  - _"Make a new note with my travel plans."_
- **Search and Retrieve Notes**: Find existing notes by content or title.
  - _"Search my notes for 'Q3 planning'."_
  - _"Find the note about the new project."_

#### F Communication Suite

- **Check Unread Emails**: Get a summary of your unread emails from the Mail app.
  - _"Do I have any new emails?"_
  - _"Check my unread emails."_
- **Send Emails**: Compose and send emails without leaving your current context.
  - _"Send an email to john.doe@example.com with the subject 'Project Update' and the body 'Just a quick update, everything is on track for the deadline.'"_
- **Send Messages**: Send iMessages or SMS messages to your contacts.
  - _"Send a message to Jane saying 'I'm running 5 minutes late'."_
  - _"Tell my wife I'll be home soon."_
- **Find Contacts**: Look up phone numbers, emails, and other details for your contacts.
  - _"What's Sarah's phone number?"_
  - _"Find John Smith's contact info."_

### 🗺️ Google Maps Integration

- **Geocoding**: Get coordinates for an address.
  - _"What are the coordinates for the Eiffel Tower?"_
- **Reverse Geocoding**: Find an address from coordinates.
- **Place Search**: Find restaurants, parks, or any business.
  - _"Find a coffee shop near me."_
- **Place Details**: Get more information about a specific place.
- **Distance & Travel Time**: Calculate travel distance and time.
  - _"How long will it take to drive from San Francisco to Los Angeles?"_
- **Directions**: Get step-by-step directions.
  - _"Give me directions to the nearest airport."_

### 📝 Notion Integration

- **Document Management**: Create, read, and update documents in your personal Notion account.
  - _"Create a new page in Notion titled 'My new project'."_
  - _"Find the document about AgentKit in Notion."_

### 🌐 Web Search

- **General Knowledge**: Use Exa to search the web for up-to-date information on any topic.
  - _"What was the score of the last Lakers game?"_
  - _"Search for the latest news on AI."_

## Setup and Installation

1.  **Clone the Repository**:

    ```sh
    git clone https://github.com/inngest/agent-kit.git
    cd agent-kit/examples/voice-assistant
    ```

2.  **Install Dependencies**:
    This project uses `pnpm` for package management.

    ```sh
    pnpm install
    ```

3.  **Set Up Environment Variables**:
    Create a `.env` file in the `examples/voice-assistant` directory by copying the example file:

    ```sh
    cp .env.example .env
    ```

    Now, open the `.env` file and add your API keys for the services you want to use:

    ```env
    # Your Anthropic API Key for the core LLM
    ANTHROPIC_API_KEY=sk-ant-xxx

    # Your Google Maps API Key
    GOOGLE_MAPS_API_KEY=AIzaSy...

    # Your Notion API Key and any other required config
    NOTION_API_KEY=secret_...

    # Your Exa API Key for web searches
    EXA_API_KEY=...
    ```

## Running the Assistant

1.  **Start the AgentKit Server**:
    This command starts the local server that hosts your agent network.

    ```sh
    npm run dev
    ```

2.  **Start the Inngest Dev Server**:
    Open a new terminal window and run the Inngest dev server. This provides a UI to interact with your agent, view logs, and see the step-by-step execution traces.

    ```sh
    npx inngest-cli@latest dev -u http://localhost:3010/api/inngest
    ```

3.  **Interact with Your Assistant**:
    - Open your browser to the Inngest Dev Server URL (usually `http://127.0.0.1:8288`).
    - Go to the "Functions" tab.
    - Find the `network-personal-assistant-agent` function and click "Invoke".
    - In the "Data" field, provide your query in a JSON format:
      ```json
      {
        "input": "What's on my calendar for today?"
      }
      ```
    - Click "Invoke function" and watch your assistant go to work!
