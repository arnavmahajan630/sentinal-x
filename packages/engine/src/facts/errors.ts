export type FactErrorCode = 'not_found' | 'ambiguous' | 'invalid_argument';

/** Typed error so the tool layer can turn it into a structured, self-correctable answer for the LLM. */
export class FactError extends Error {
  constructor(
    readonly code: FactErrorCode,
    message: string,
    readonly suggestions: string[] = [],
  ) {
    super(message);
    this.name = 'FactError';
  }
}
