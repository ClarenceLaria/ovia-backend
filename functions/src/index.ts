import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import express from "express";

// Initialize Express app
const app = express();

// Example route
app.get("/", (req, res) => {
  logger.info("Root route hit");
  res.send("Hello from Express inside Firebase!");
});

// Example route for your app
app.get("/status", (req, res) => {
  res.json({status: "Ovia backend running 🚀"});
});

// Export the Express app as a Firebase Function
export const api = functions.onRequest(app);
