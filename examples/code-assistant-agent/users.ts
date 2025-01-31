import { Request, Response, NextFunction } from 'express';
import express from 'express';

const router = express.Router();

// Ensure the route handler has the correct parameter signature
router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Safely access req.body after verifying it exists
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is missing' });
    }

    // Your logic here using req.body
    const userData = req.body;
    
    // ... rest of your handler logic

    return res.status(200).json({ success: true, data: userData });
  } catch (error) {
    next(error); // Proper error handling
  }
});

export default router;