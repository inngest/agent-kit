// Fake data store
export const ticketsDB = [
  {
    id: "T123",
    title: "Cannot login",
    status: "open",
    priority: "medium",
    notes: "",
  },
  {
    id: "T124",
    title: "How can I upvote an item?",
    status: "open",
    priority: "low",
    notes: "",
  },
  {
    id: "T125",
    title: "API is not working and crashes my app",
    status: "open",
    priority: "critical",
    notes: "",
  },
];

export const knowledgeBaseDB = [
  {
    id: "KB1",
    title: "Login troubleshooting",
    content: "Common login issues and solutions...",
  },
  {
    id: "KB2",
    title: "API Documentation",
    content: "Complete API reference and examples...",
  },
  {
    id: "KB3",
    title: "System Requirements",
    content: "Minimum system requirements...",
  },
];

export const releaseNotesDB = [
  { id: "RN1", title: "v1.1.3", content: "Migration of the login service" },
  { id: "RN2", title: "v1.1.2", content: "Remove the upvote feature" },
  {
    id: "RN2",
    title: "v1.0.0",
    content: "Introduced the user management service",
  },
];
