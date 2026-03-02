export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: any) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class UnknownNodeTypeError extends AppError {
  constructor(nodeType: string) {
    super(`Unknown node type: ${nodeType}`, 500);
  }
}

export class MaxStepsExceededError extends AppError {
  constructor(stepType: 'total' | 'consecutive', limit: number) {
    const message = stepType === 'total'
      ? `Maximum total steps (${limit}) exceeded`
      : `Maximum consecutive logic steps (${limit}) exceeded`;
    super(message, 500);
  }
}

export class FlowExecutionError extends AppError {
  constructor(message: string, public readonly nodeId?: string) {
    super(message, 500);
  }
}

export class WhatsAppAPIError extends AppError {
  constructor(message: string, public readonly originalError?: any) {
    super(message, 502);
  }
}
