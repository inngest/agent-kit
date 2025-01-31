import express from "express";

export const taskRouter = express.Router();

const tasks = [];
let taskIdCounter = 0;

taskRouter.post("/", async (req, res) => {
  const task = {
    id: taskIdCounter++,
    title: req.body.title,
    completed: false,
    createdAt: new Date(),
  };

  // Simulated async operation
  await new Promise((resolve) => setTimeout(resolve, 100));
  tasks.push(task);
  res.json(task);
});

taskRouter.get("/", (req, res) => {
  const completed = req.query.completed;
  const filteredTasks =
    completed !== undefined
      ? tasks.filter((task) => task.completed === completed)
      : tasks;
  res.json(filteredTasks);
});

taskRouter.patch("/:id/toggle", (req, res) => {
  const taskId = parseInt(req.params.id);
  const task = tasks.find((t) => t.id === taskId);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  // Simulated delay to make race condition more likely
  setTimeout(() => {
    task.completed = !task.completed;
    res.json(task);
  }, Math.random() * 500);
});

taskRouter.delete("/completed", (req, res) => {
  const remainingTasks = tasks.filter((task) => !task.completed);
  tasks.length = 0;
  tasks.push(...remainingTasks);
  res.status(200).json({ message: "Completed tasks deleted" });
});
