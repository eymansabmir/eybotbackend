import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../utils/errors';

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    console.error('Validation Error Details:', JSON.stringify(error.errors, null, 2));
    res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.errors,
    });
    return;
  }

  if (error instanceof AppError) {
    console.error(`[${error.constructor.name}] ${error.message}`);
    res.status(error.statusCode).json({
      error: error.constructor.name,
      message: error.message,
      ...(error instanceof ValidationError && error.details ? { details: error.details } : {}),
    });
    return;
  }

  console.error('Unhandled error:', error);

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message,
  });
}
