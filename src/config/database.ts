import { prisma } from '../repositories/prisma/client';

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✓ Database (Prisma) connected successfully');
  } catch (error) {
    console.error('✗ Database (Prisma) connection error:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('✓ Database (Prisma) disconnected');
}

