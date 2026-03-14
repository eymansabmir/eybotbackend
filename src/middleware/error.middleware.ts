import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../utils/errors';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    logger.warn({ path: req.path, errors: error.errors }, 'Request validation failed');
    res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.errors,
    });
    return;
  }

  if (error instanceof AppError) {
    const level = error.statusCode >= 500 ? 'error' : 'warn';
    logger[level](
      { path: req.path, statusCode: error.statusCode, error: error.constructor.name },
      error.message,
    );
    res.status(error.statusCode).json({
      error: error.constructor.name,
      message: error.message,
      ...(error instanceof ValidationError && error.details ? { details: error.details } : {}),
    });
    return;
  }

  logger.error({ path: req.path, err: error }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message,
  });
}
