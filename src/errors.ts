import { IDoggyHoleError } from './types';

export class DoggyHoleError extends Error implements IDoggyHoleError {
  public code: string;
  public details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'DoggyHoleError';
    this.code = code;
    this.details = details;
  }
}

export class AuthenticationError extends DoggyHoleError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class ConnectionError extends DoggyHoleError {
  constructor(message: string = 'Connection failed', details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends DoggyHoleError {
  constructor(message: string = 'Request timeout', details?: any) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends DoggyHoleError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class HandlerNotFoundError extends DoggyHoleError {
  constructor(functionName: string, details?: any) {
    super(`Handler not found: ${functionName}`, 'HANDLER_NOT_FOUND', details);
    this.name = 'HandlerNotFoundError';
  }
}

export class ClientNotFoundError extends DoggyHoleError {
  constructor(clientName: string, details?: any) {
    super(`Client not found: ${clientName}`, 'CLIENT_NOT_FOUND', details);
    this.name = 'ClientNotFoundError';
  }
}

export class NetworkError extends DoggyHoleError {
  constructor(message: string = 'Network error', details?: any) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}