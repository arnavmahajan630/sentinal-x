import { ToolError } from '../tools/errors';
import type { ToolErrorCode } from '../tools/errors';

/** Knowledge-layer error (playbook not found, invalid playbook file …). */
export class KnowledgeError extends ToolError {
  constructor(
    code: ToolErrorCode | 'invalid_playbook',
    message: string,
    suggestions: string[] = [],
  ) {
    super(code === 'invalid_playbook' ? 'invalid_argument' : code, message, suggestions);
    this.name = 'KnowledgeError';
  }
}
