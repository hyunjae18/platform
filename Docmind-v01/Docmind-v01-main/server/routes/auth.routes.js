import express from 'express';
import { login, register } from '../controllers/auth.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// Example of a protected route using the middleware
router.get('/dashboard-data', verifyToken, (req, res) => {
  // Only users with a valid token can see this!
  res.status(200).json({ 
    message: "Welcome to the secret dashboard!", 
    user: req.user // The decoded info from the token
  });
});

export default router;