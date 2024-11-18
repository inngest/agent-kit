import express from 'express';
import { serve } from "inngest/express";
import { client, fn } from "./inngest";

const app = express()
const port = 3001

// Important:  ensure you add JSON middleware to process incoming JSON POST payloads.
app.use(express.json());
app.use(
  // Expose the middleware on our recommended path at `/api/inngest`.
  "/api/inngest",
  serve({
    client,
    functions: [fn]
  })
);

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})

