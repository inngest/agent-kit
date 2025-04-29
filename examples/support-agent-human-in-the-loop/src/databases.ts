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
    title: "the /api/v1/users endpoint is not working and crashes my app",
    status: "open",
    priority: "critical",
    notes: "",
  },
];

export const knowledgeBaseDB = [
  {
    id: "KB1",
    title: "Login troubleshooting",
    content:
      "If you're having trouble logging in, try clearing your browser cache and cookies. If the problem persists, contact support.",
  },
  {
    id: "KB2",
    title: "API Documentation",
    content:
      "The API can be found here: https://api.example.com/docs",
  },
  {
    id: "KB3",
    title: "System Requirements",
    content:
      "Using the app requires Chrome or Edge browsers with a fast internet connection.",
  },
  {
    id: "KB4",
    title: "How to upvote an item",
    content:
      "To upvote an item, click the upvote button next to the item. You can only upvote an item once.",
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
