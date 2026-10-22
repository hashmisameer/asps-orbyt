// An error with an HTTP status and a message that is safe to show to the user.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wraps async route handlers so thrown errors reach the error handler below.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Last stop for every error. Known errors keep their message; anything else
// is logged on the server and the user gets a plain message, never a stack trace.
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
}
