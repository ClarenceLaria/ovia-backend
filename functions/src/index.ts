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

    const cycleLength = parseInt(data?.cycleLength) || 28;
    const periodDuration = parseInt(data?.periodDuration) || 5;

    const today = new Date();
    // const todayStr = today.toISOString().split("T")[0];

    const numberOfCyclesToGenerate = 12;
    const periodDays: string[] = [];
    const fertileWindow: string[] = [];
    const ovulationDays: string[] = [];

    let currentPhase = "Unknown";
    let currentDay = null;

    for (let cycle = 0; cycle < numberOfCyclesToGenerate; cycle++) {
      const cycleStart = new Date(lastPeriodDate);
      cycleStart.setDate(cycleStart.getDate() + cycle * cycleLength);

      const cycleEnd = new Date(cycleStart);
      cycleEnd.setDate(cycleStart.getDate() + cycleLength - 1);

      if (today >= cycleStart && today <= cycleEnd) {
        currentDay = Math.floor(
          (today.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;

        if (currentDay <= periodDuration) {
          currentPhase = "Menstrual Phase";
        } else if (
          currentDay >= cycleLength - 14 - 2 &&
          currentDay <= cycleLength - 14 + 2
        ) {
          currentPhase = "Fertile Window";
        } else if (currentDay === cycleLength - 14) {
          currentPhase = "Ovulation Phase";
        } else if (currentDay > cycleLength - 14 + 2) {
          currentPhase = "Luteal Phase";
        } else {
          currentPhase = "Follicular Phase";
        }
      }

      // Period days
      for (let i = 0; i < periodDuration; i++) {
        const periodDate = new Date(cycleStart);
        periodDate.setDate(periodDate.getDate() + i);
        periodDays.push(periodDate.toISOString().split("T")[0]);
      }

      // Ovulation day
      const ovulationDate = new Date(cycleStart);
      ovulationDate.setDate(cycleStart.getDate() + (cycleLength - 14));
      ovulationDays.push(ovulationDate.toISOString().split("T")[0]);

      // Fertile window
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
      currentPhase,
      currentDay,
      cycleLength,
    });
  } catch (error) {
    console.error("Error getting cycle data:", error);
    return res.status(500).json({message: "Internal server error"});
  }
});

app.post("/save-pregnancy-info", async (req, res) => {
  try {
    const {userId, isPregnant, weeksPregnant, dueDate, lmp} = req.body;

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
      isPregnant: isPregnant,
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

app.get("/track-pregnancy", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({message: "Missing or invalid userId."});
    }

    const pregnancyDoc = await db.collection("pregnancyData").doc(userId).get();

    if (!pregnancyDoc.exists) {
      return res.status(404).json({message: "Pregnancy data not found."});
    }

    const pregnancyData = pregnancyDoc.data();
    const now = new Date();
    const isPregnant = pregnancyData?.isPregnant || false;
    const lmpDate = pregnancyData?.lmp ? new Date(pregnancyData.lmp) : null;
    const dueDate = pregnancyData?.dueDate ? new Date(pregnancyData.dueDate) : null;

    // Calculate weeks pregnant
    const diffMs = now.getTime() - (lmpDate ? lmpDate.getTime() : 0); // Difference in milliseconds
    const weeksPregnant = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));

    // Total duration of pregnancy in days (around 280 days)
    const totalPregnancyDays = 280;
    const daysPregnant = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, totalPregnancyDays - daysPregnant);
    const percentageProgress = Math.min(100, Math.round((daysPregnant / totalPregnancyDays) * 100));

    // Determine current trimester
    let trimester = "";
    if (weeksPregnant < 13) {
      trimester = "First Trimester";
    } else if (weeksPregnant < 27) {
      trimester = "Second Trimester";
    } else {
      trimester = "Third Trimester";
    }

    return res.status(200).json({
      userId,
      isPregnant,
      weeksPregnant,
      daysRemaining,
      dueDate: dueDate ? dueDate.toISOString().split("T")[0] : null,
      lmp: lmpDate ? lmpDate.toISOString().split("T")[0] : null,
      percentageProgress,
      trimester,
    });
  } catch (error) {
    console.error("Error tracking pregnancy:", error);
    return res.status(500).json({message: "Internal server error"});
  }
});

export const api = functions.onRequest(app);
