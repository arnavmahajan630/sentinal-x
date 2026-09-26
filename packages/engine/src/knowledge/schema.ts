import { z } from 'zod';
import { SEVERITIES } from './types';

const slug = z.string().regex(/^[a-z][a-z0-9-]*$/, 'lower-kebab-case');

/** Front-matter contract for every playbook file. */
export const FrontMatter = z
  .object({
    type: slug,
    title: z.string().min(3),
    kind: z.enum(['vulnerability', 'reference']),
    agent: z.enum(['auth', 'dataflow', 'shared']),
    owasp: z.string().regex(/^A(0[1-9]|10):2025$/, 'e.g. A01:2025'),
    apiTop10: z
      .string()
      .regex(/^API([1-9]|10):2023$/, 'e.g. API1:2023')
      .optional(),
    cwe: z.array(z.number().int().positive()).default([]),
    severityBase: z.enum(SEVERITIES),
    verifierTemplate: z.string().nullable().default(null),
    verification: z.enum(['dynamic', 'static', 'undecided', 'none']),
    factQueries: z.array(z.string()).default([]),
    signals: z.array(z.string()).default([]),
    requires: z.array(z.string()).default([]),
    appliesTo: z.array(z.string()).default([]),
    summary: z.string().min(10).max(240),
  })
  .strict()
  .superRefine((v, ctx) => {
    const bad = (m: string) => ctx.addIssue({ code: 'custom', message: m });
    if (v.kind === 'vulnerability') {
      if (!v.factQueries.length) bad('vulnerability playbook needs factQueries');
      if (!v.signals.length) bad('vulnerability playbook needs signals');
      if (v.appliesTo.length) bad('appliesTo is for reference playbooks');
      if (v.verifierTemplate === null && !['undecided', 'none'].includes(v.verification))
        bad('verifierTemplate null requires verification undecided|none');
      if (v.verifierTemplate !== null && !['dynamic', 'static'].includes(v.verification))
        bad('a verifierTemplate requires verification dynamic|static');
    } else {
      if (v.signals.length || v.requires.length) bad('reference playbook has no signals/requires');
      if (v.verifierTemplate !== null || v.verification !== 'none')
        bad('reference playbook has no verifier (verification: none)');
      if (!v.appliesTo.length) bad('reference playbook needs appliesTo');
    }
  });
export type FrontMatterInput = z.infer<typeof FrontMatter>;
