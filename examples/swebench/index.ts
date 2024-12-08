import express from "express";
import { serve } from "inngest/express";
import { fn, inngest } from "./inngest";

const app = express();
const port = 3001;

// Important:  ensure you add JSON middleware to process incoming JSON POST payloads.
app.use(express.json());

app.use(
  // Expose the middleware on our recommended path at `/api/inngest`.
  "/api/inngest",
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  serve({
    client: inngest,
    functions: [fn],
  }),
);

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
