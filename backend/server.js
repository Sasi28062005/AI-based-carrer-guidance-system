import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// --- Database + API Config ---
const { DB_HOST, DB_USER, DB_PASS, DB_NAME, GEMINI_API_KEY, PORT } = process.env;

if (!DB_HOST || !DB_USER || !DB_PASS || !DB_NAME || !GEMINI_API_KEY) {
  console.error("❌ ERROR: Missing required environment variables. Please check your .env file.");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// ✅ MySQL Connection
let db;
(async () => {
  try {
    db = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
    });
    console.log("✅ Connected to MySQL Database");
    await createTables();
  } catch (err) {
    console.error("❌ MySQL Connection Failed:", err.message);
    process.exit(1);
  }
})();

// ✅ Create Tables
async function createTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ Users table ready");

  await db.query(`
    CREATE TABLE IF NOT EXISTS skills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      skill VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ Skills table ready");
}

// ✅ Gemini AI setup (correct usage)
const genAI = new GoogleGenerativeAI("AIzaSyD_UrX4EUOBgNyuQCQptDy0xLxhbjvKoEg");

// ✅ Signup
app.post("/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: "All fields are required" });

  try {
    const [existingUsers] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (existingUsers.length > 0) return res.status(400).json({ success: false, message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hashedPassword]);

    res.json({ success: true, user: { id: result.insertId, name, email } });
  } catch (error) {
    console.error("❌ Signup error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Login
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "All fields are required" });

  try {
    const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (results.length === 0) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const user = results[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(400).json({ success: false, message: "Invalid credentials" });

    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Recommendation API (correct Gemini usage)
app.post("/recommendation", async (req, res) => {
  const { skill } = req.body;
  if (!skill) return res.status(400).json({ recommendation: "Skill is required." });

  try {
    // Save skill to DB
    await db.query("INSERT INTO skills (skill) VALUES (?)", [skill]);

    // Generate AI recommendation
    const prompt = `Suggest 3 career paths for someone skilled in ${skill}. Explain why these careers are suitable in one short sentence each.`;

    // Correct Gemini API usage
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([prompt]);

    // Extract text from response
    const aiRecommendation =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No recommendation generated.";

    res.json({ recommendation: aiRecommendation });

  } catch (error) {
    console.error("🔥 Gemini AI Error:", error.message);
    res.status(500).json({ recommendation: "AI error" });
  }
});

// ✅ Start server
const serverPort = PORT || 5000;
app.listen(serverPort, () => {
  console.log(`✅ Backend running on http://localhost:${serverPort}`);
});