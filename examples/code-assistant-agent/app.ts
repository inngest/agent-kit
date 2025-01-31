import express from 'express';
import usersRouter from './routes/users';

const app = express();

// Add body-parser middleware before routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount the routes after middleware
app.use('/api', usersRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;