import { ToolError } from '../tools/errors';
import type { ToolErrorCode } from '../tools/errors';

export type FactErrorCode = ToolErrorCode;

/** Fact-layer error (kept as its own class for callers; handled generically by `runTool`). */
export class FactError extends ToolError {
  constructor(code: FactErrorCode, message: string, suggestions: string[] = []) {
    super(code, message, suggestions);
    this.name = 'FactError';
  }
}
