import { describe, expect, it } from 'vitest';
import { buildGraphModel } from '../../src/graph/model';
import { linkFiles } from '../indexer/helpers';
import { Q } from './helpers';
import type { FileRow } from '../../src/indexer';

/** build a graph from in-memory files */
function graphOf(files: Record<string, string>) {
  const { irs, res } = linkFiles(files);
  const rows: FileRow[] = irs.map((ir) => ({
    path: ir.path,
    kind: ir.kind,
    status: 'indexed',
    ir,
    linked: res.files[ir.path] ?? null,
  }));
  return new Q(buildGraphModel({ projectId: 'p', files: rows }));
}

const APP = `
  const express = require('express'); const app = express();
  const { optionalAuth, strictAuth } = require('./mw');
  app.get('/soft', optionalAuth, (req, res) => res.json({}));
  app.get('/hard', strictAuth, (req, res) => res.json({}));
  app.get('/none', (req, res) => res.json({}));
`;
const MW = `
  const jwt = require('jsonwebtoken');
  exports.optionalAuth = (req, res, next) => { try { req.user = jwt.verify(req.headers.authorization, process.env.S); } catch (e) {} next(); };
  exports.strictAuth = (req, res, next) => { try { req.user = jwt.verify(req.headers.authorization, process.env.S); next(); } catch (e) { res.status(401).end(); } };
`;

describe('graph model: synthetic cases', () => {
  it('authEnforcement is evidence-based: enforcing / weak / none', () => {
    const q = graphOf({ 'app.js': APP, 'mw.js': MW });
    expect(q.node('Route:GET /hard').props).toMatchObject({
      protected: true,
      authEnforcement: 'enforcing',
    });
    expect(q.node('Route:GET /soft').props).toMatchObject({
      protected: true,
      authEnforcement: 'weak',
    });
    expect(q.node('Route:GET /none').props).toMatchObject({
      protected: false,
      authEnforcement: 'none',
    });
  });

  it('conditional (dynamic-path) auth middleware does not count as protection', () => {
    const q = graphOf({
      'app.js': `const express = require('express'); const app = express(); app.use('/' + base, strictAuth); app.get('/x', h); function h(req,res){} function strictAuth(req,res,next){ jwt.verify(req.headers.authorization); res.status(401); req.user = 1; }`,
    });
    expect(q.node('Route:GET /x').props.protected).toBe(false);
    expect(q.out('Route:GET /x', 'PROTECTED_BY')[0]!.props).toMatchObject({ conditional: true });
  });

  it('external services: CALLS Dependency + USES ExternalService for known packages', () => {
    const q = graphOf({
      'mail.js': `const nodemailer = require('nodemailer'); const fs = require('fs'); exports.send = async () => { const t = nodemailer.createTransport({}); await t.sendMail({}); fs.readFileSync('x'); };`,
      'package.json': '{"dependencies":{"nodemailer":"^6.0.0"}}',
    });
    expect(q.node('ExternalService:Nodemailer').props).toMatchObject({
      category: 'email',
      packages: ['nodemailer'],
    });
    expect(q.edge('USES', 'Function:mail.js#send', 'ExternalService:Nodemailer')).toBeDefined();
    expect(
      q.edge('CALLS', 'Function:mail.js#send', 'Dependency:nodemailer')!.props!.calls[0].name,
    ).toBe('createTransport');
    expect(q.node('Dependency:fs').props.builtin).toBe(true);
    expect(q.edge('CALLS', 'Function:mail.js#send', 'Dependency:fs')).toBeDefined();
    expect(q.node('Dependency:nodemailer').props).toMatchObject({ declared: true });
  });

  it('module-level ops/secrets attach to the File, not a missing function', () => {
    const q = graphOf({
      'boot.js': `const User = require('./User'); User.find({}); const cfg = { apiKey: 'sk-abcdefghijklmnopqrstuvwx' };`,
      'User.js': `const m = require('mongoose'); module.exports = m.model('User', new m.Schema({ name: String }));`,
    });
    expect(q.edge('ACCESSES', 'File:boot.js', 'Model:User')).toBeDefined();
    const sec = q.ofType('Secret')[0]!;
    expect(q.in(sec.id, 'CONTAINS')[0]!.from).toBe('File:boot.js');
  });

  it('unparsed and test files do not break the graph', () => {
    const { irs, res } = linkFiles({ 'a.js': 'exports.x = () => 1;' });
    const rows: FileRow[] = [
      { path: 'a.js', kind: 'server', status: 'indexed', ir: irs[0]!, linked: res.files['a.js']! },
      { path: 'bad.js', kind: 'server', status: 'unparsed', ir: null, linked: null },
      { path: 't.test.js', kind: 'test', status: 'recorded', ir: null, linked: null },
    ];
    const q = new Q(buildGraphModel({ projectId: 'p', files: rows }));
    expect(q.has('File:bad.js')).toBe(true);
    expect(q.has('File:t.test.js')).toBe(false);
  });
});
