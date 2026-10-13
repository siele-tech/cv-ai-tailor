/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public details?: string[],
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: string[]) =>
  new HttpError(400, message, 'bad_request', details);
export const notFound = (message = 'Not found') => new HttpError(404, message, 'not_found');
