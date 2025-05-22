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

app.get("/get-user-cycle", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({message: "Missing userId"});
    }

    const userDoc = await db.collection("userinfo").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({message: "User not found"});
    }

    const data = userDoc.data();
    const lastPeriodDate = data?.lastPeriodDate.toDate ?
      data.lastPeriodDate.toDate() :
      new Date(data?.lastPeriodDate);

    const cycleLength = parseInt(data?.cycleLength) || 28; // fallback
    const periodDuration = parseInt(data?.periodDuration) || 5;

    const numberOfCyclesToGenerate = 12; // Predict 12 future cycles (~1 year)
    const periodDays: string[] = [];
    const fertileWindow: string[] = [];
    const ovulationDays: string[] = [];

    for (let cycle = 0; cycle < numberOfCyclesToGenerate; cycle++) {
      const cycleStart = new Date(lastPeriodDate);
      cycleStart.setDate(cycleStart.getDate() + cycle * cycleLength);

      // Period days
      for (let i = 0; i < periodDuration; i++) {
        const periodDate = new Date(cycleStart);
        periodDate.setDate(periodDate.getDate() + i);
        periodDays.push(periodDate.toISOString().split("T")[0]);
      }

      // Ovulation day
      const ovulationDate = new Date(cycleStart);
      ovulationDate.setDate(ovulationDate.getDate() + (cycleLength - 14));
      ovulationDays.push(ovulationDate.toISOString().split("T")[0]);

      // Fertile window: 2 days before and after ovulation
      for (let i = -2; i <= 2; i++) {
        const fertileDate = new Date(ovulationDate);
        fertileDate.setDate(fertileDate.getDate() + i);
        fertileWindow.push(fertileDate.toISOString().split("T")[0]);
      }
    }

    return res.status(200).json({
      periodDays,
      fertileWindow,
      ovulationDays,
    });
  } catch (error) {
    console.error("Error getting cycle data:", error);
    return res.status(500).json({message: "Internal server error"});
  }
});

app.post("/save-pregnancy-info", async (req, res) => {
  try {
    const {userId, weeksPregnant, dueDate, lmp} = req.body;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({message: "Missing or invalid userId."});
    }

    // Parse inputs
    const now = new Date();
    let parsedLmp = null;
    let parsedDueDate = null;
    let calculatedWeeks = null;

    if (weeksPregnant) {
      const weeks = parseInt(weeksPregnant);
      parsedLmp = new Date(now);
      parsedLmp.setDate(parsedLmp.getDate() - weeks * 7);
      parsedDueDate = new Date(parsedLmp);
      parsedDueDate.setDate(parsedLmp.getDate() + 280);
      calculatedWeeks = weeks;
    } else if (dueDate) {
      parsedDueDate = new Date(dueDate);
      parsedLmp = new Date(parsedDueDate);
      parsedLmp.setDate(parsedDueDate.getDate() - 280);
      calculatedWeeks = Math.floor((now.getTime() - parsedLmp.getTime()) / (7 * 24 * 60 * 60 * 1000));
    } else if (lmp) {
      parsedLmp = new Date(lmp);
      parsedDueDate = new Date(parsedLmp);
      parsedDueDate.setDate(parsedLmp.getDate() + 280);
      calculatedWeeks = Math.floor((now.getTime() - parsedLmp.getTime()) / (7 * 24 * 60 * 60 * 1000));
    } else {
      return res.status(400).json({
        message: "Provide either weeksPregnant, dueDate, or lmp.",
      });
    }

    const payload = {
      weeksPregnant: calculatedWeeks,
      dueDate: parsedDueDate.toISOString(),
      lmp: parsedLmp.toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("pregnancyData").doc(userId).set(payload, {merge: true});

    return res.status(200).json({message: "Pregnancy data saved.", data: payload});
  } catch (error) {
    console.error("Error saving pregnancy setup:", error);
    return res.status(500).json({message: "Internal server error."});
  }
});

export const api = functions.onRequest(app);
