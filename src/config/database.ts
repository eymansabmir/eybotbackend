import mongoose from "mongoose";
import { prisma } from "../repositories/prisma/client";

const USE_MONGO = true;
const USE_POSTGRES = false;


export async function connectDatabase(mongoUri?: string): Promise<void> {
  try {

    if (USE_MONGO && mongoUri) {
      await mongoose.connect(mongoUri);
      console.log("✓ MongoDB connected successfully");
    }

    if (USE_POSTGRES) {
      await prisma.$connect();
      console.log("✓ PostgreSQL (Prisma) connected successfully");
    }

  } catch (error) {
    console.error("✗ Database connection error:", error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {

  if (USE_MONGO) {
    await mongoose.disconnect();
    console.log("✓ MongoDB disconnected");
  }

  if (USE_POSTGRES) {
    await prisma.$disconnect();
    console.log("✓ PostgreSQL (Prisma) disconnected");
  }
}

if (USE_MONGO) {
  mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection error:", error);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("MongoDB disconnected");
  });
}