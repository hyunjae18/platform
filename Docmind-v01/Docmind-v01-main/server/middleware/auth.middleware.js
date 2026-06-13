import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
  // 1. Get the token from the request headers
  const authHeader = req.headers['authorization'];
  
  // The header usually looks like: "Bearer abc123def456..."
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(403).json({ message: "Access denied. No token provided." });
  }

  // 2. Verify the token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to the request
    next(); // Move on to the next function
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." });
  }
};