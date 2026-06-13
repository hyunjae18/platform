import bcrypt from "bcrypt";
import { generateToken } from "../utils/jwt.js";

// Hardcoded credentials
const TEST_EMAIL = "admin@test.com";
const TEST_PASSWORD = "123456";

export const loginUser = async (email, password) => {
  if (email !== TEST_EMAIL) {
    throw new Error("User not found");
  }

  const valid = password === TEST_PASSWORD;
  if (!valid) {
    throw new Error("Invalid credentials");
  }

  const token = generateToken({
    id: 1,
    email: TEST_EMAIL,
  });

  return {
    user: {
      id: 1,
      email: TEST_EMAIL,
    },
    token,
  };
};