export type ToolErrorCode = 'not_found' | 'ambiguous' | 'invalid_argument';

/** Typed error so any tool layer can turn it into a structured, self-correctable answer for the LLM. */
export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly suggestions: string[] = [],
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
