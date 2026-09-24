import { Project, ts } from 'ts-morph';
import type { SourceFile } from 'ts-morph';

export function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
      noLib: true,
    },
  });
}

export type ParseResult = { sf: SourceFile } | { error: string; line: number; col: number };

/** Parse one file. Any syntactic diagnostic → error (the caller records the file as `unparsed`). */
export function parseSource(project: Project, relPath: string, text: string): ParseResult {
  const sf = project.createSourceFile(`/${relPath}`, text, { overwrite: true });
  const diags = ((sf.compilerNode as any).parseDiagnostics ?? []) as ts.DiagnosticWithLocation[];
  if (diags.length) {
    const d = diags[0]!;
    const pos = sf.getLineAndColumnAtPos(d.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    project.removeSourceFile(sf);
    return { error: message, line: pos.line, col: pos.column };
  }
  return { sf };
}
