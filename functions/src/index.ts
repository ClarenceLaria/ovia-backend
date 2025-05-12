import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";

/* eslint-disable max-len */

admin.initializeApp(); // Initialize Firebase Admin SDK

const app = express();
app.use(cors());
app.use(express.json());

// Root Route
app.get("/", (req, res) => {
  logger.info("Root route hit");
  res.send("Hello from Express inside Firebase!");
});

// Route to check the status of the server
app.get("/status", (req, res) => {
  res.json({status: "Ovia backend running 🚀"});
});


app.post("/register", async (req, res) => {
  try {
    const {email, password, name} = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({message: "All fields are required"});
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // Save extra data in Firestore
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      name,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      message: "User registered successfully",
      uid: userRecord.uid,
    });
  } catch (error: unknown) {
    console.error("Error registering user:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return res.status(500).json({message: errorMessage});
  }
});


export const api = functions.onRequest(app);
