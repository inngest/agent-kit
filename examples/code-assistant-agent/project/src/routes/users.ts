import express from "express";

export const userRouter = express.Router();

// In-memory user storage - Bug 8: No data validation
const users: any[] = [];

userRouter.post("/", (req, res) => {
  const user = req.body;
  users.push(user);
  res.status(201).json(user);
});

userRouter.get("/:id", (req, res) => {
  const user = users[parseInt(req.params.id)];
  res.json(user);
});

userRouter.put("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  setTimeout(() => {
    users[id] = { ...users[id], ...req.body };
    res.json(users[id]);
  }, Math.random() * 1000); // Simulated delay
});

userRouter.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  users.splice(id, 1);
  res.status(204).send();
});
