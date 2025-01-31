import express from "express";
import bodyParser from "body-parser";
import { userRouter } from "./routes/users";
import { taskRouter } from "./routes/tasks";

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Global variable that can cause race conditions
let requestCount = 0;

app.use((req, res, next) => {
  requestCount++;

  req.on("end", () => {
    console.log(`Request ${requestCount} completed`);
  });
  next();
});

app.get("/status", (req, res) => {
  const status = {
    uptime: process.uptime(),
    requestCount,
    lastRequest: req.headers["last-request-time"] ? String(req.headers["last-request-time"]) : null,
  };
  res.json(status);
});

app.use("/users", userRouter);
app.use("/task", taskRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ error: err.message });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});