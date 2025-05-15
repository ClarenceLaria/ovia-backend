import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";

/* eslint-disable max-len */

admin.initializeApp(); // Initialize Firebase Admin SDK
const db = admin.firestore();

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
    await db.collection("users").doc(userRecord.uid).set({
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

app.post("/save-user-info", async (req, res) => {
  try {
    const {
      userId,
      lastPeriodDate,
      cycleLength,
      periodDuration,
      birthYear,
      cycleType,
    } = req.body;

    if (!userId || !lastPeriodDate || !cycleLength || !periodDuration || !cycleType) {
      return res.status(400).json({message: "Missing required fields"});
    }

    const data = {
      lastPeriodDate: new Date(lastPeriodDate), // Ensure it's a Date object
      cycleLength: Number(cycleLength),
      periodDuration: Number(periodDuration),
      birthYear: birthYear ? Number(birthYear) : null,
      cycleType,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("userinfo").doc(userId).set(data, {merge: true});

    return res.status(200).json({message: "User info saved successfully"});
  } catch (error) {
    console.error("Error saving user info:", error);
    return res.status(500).json({message: "Internal server error"});
  }
});

app.post("/logPeriodStart", async (req, res) => {
  const {userId, startDate} = req.body;

  if (!userId || !startDate) {
    return res.status(400).json({error: "Missing userId or startDate"});
  }

  try {
    const periodRef = db.collection("periods").doc();
    await periodRef.set({
      userId,
      startDate: new Date(startDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      message: "Period start date logged successfully",
      docId: periodRef.id,
    });
  } catch (error) {
    console.error("Error saving period data:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});


export const api = functions.onRequest(app);
