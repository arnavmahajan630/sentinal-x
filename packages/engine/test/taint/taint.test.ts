import { describe, expect, it } from 'vitest';
import { FactEngine } from '../../src/facts/engine';
import { InMemoryGraphStore } from '../../src/graph/memoryStore';
import { buildGraphModel } from '../../src/graph/model';
import type { FileRow } from '../../src/indexer';
import { linkFiles } from '../indexer/helpers';

function buildEngineFromFiles(files: Record<string, string>) {
  const { irs, res } = linkFiles(files);
  const fileRows: FileRow[] = irs.map((ir) => ({
    path: ir.path,
    kind: ir.kind,
    status: 'indexed',
    ir,
    linked: res.files[ir.path] ?? null,
  }));
  const model = buildGraphModel({
    projectId: 'test-taint-project',
    project: { name: 'test-taint-project' },
    files: fileRows,
  });
  const store = new InMemoryGraphStore('test-taint-project', model);
  return { engine: new FactEngine(store), store, model };
}

describe('Phase N3: Taint / Dataflow Engine', () => {
  it('Acceptance 1: An input reaching a Mongo query through two helper functions is traced end-to-end', async () => {
    const files = {
      'server/models/Order.js': `
        const mongoose = require('mongoose');
        const schema = new mongoose.Schema({ title: String });
        module.exports = mongoose.model('Order', schema);
      `,
      'server/repo.js': `
        const Order = require('./models/Order');
        async function fetchOrderFromDb(targetId) {
          return await Order.findById(targetId);
        }
        module.exports = { fetchOrderFromDb };
      `,
      'server/service.js': `
        const { fetchOrderFromDb } = require('./repo');
        async function getOrderService(orderId) {
          return await fetchOrderFromDb(orderId);
        }
        module.exports = { getOrderService };
      `,
      'server/routes.js': `
        const express = require('express');
        const { getOrderService } = require('./service');
        const router = express.Router();
        router.get('/orders/:id', async function getOrderHandler(req, res) {
          const id = req.params.id;
          const order = await getOrderService(id);
          res.json(order);
        });
        module.exports = router;
      `,
    };

    const { engine, model } = buildEngineFromFiles(files);

    // 1. Check Function→Function and Function→Model FLOWS_TO edges in Graph Model
    const fnFlowEdges = model.edges.filter((e) => e.type === 'FLOWS_TO' && e.from.startsWith('Function:'));
    expect(fnFlowEdges.length).toBeGreaterThan(0);

    // 2. Query FactEngine.getDataflow
    const df = await engine.getDataflow({ route: 'GET /orders/:id' });
    expect(df).toHaveLength(1);

    const targetFlow = df[0]!;
    expect(targetFlow.input.canonical).toBe('req.params.id');

    // Steps should trace: handler -> service helper -> repo helper -> Order model
    const stepSummary = targetFlow.steps.map((s) => `${s.from} → ${s.to} [${s.via}]`);
    expect(stepSummary).toEqual([
      'req.params.id → getOrderHandler() [read (bound to id)]',
      'getOrderHandler() → getOrderService() [call arg0]',
      'getOrderService() → fetchOrderFromDb() [call arg0]',
      'fetchOrderFromDb() → Order [findById(arg0)]',
    ]);

    // Sink should be the Order model reached end-to-end
    expect(targetFlow.sinks).toHaveLength(1);
    expect(targetFlow.sinks[0]).toMatchObject({
      model: 'Order',
      op: 'findById',
      fn: 'server/repo.js#fetchOrderFromDb',
      argSources: ['req.params.id'],
    });
  });

  it('Acceptance 2: Adding a sanitizer on the path clears the taint (flow no longer reported)', async () => {
    // Same architecture, but parseInt is called in helper1
    const filesWithSanitizer = {
      'server/models/Order.js': `
        const mongoose = require('mongoose');
        const schema = new mongoose.Schema({ title: String });
        module.exports = mongoose.model('Order', schema);
      `,
      'server/repo.js': `
        const Order = require('./models/Order');
        async function fetchOrderFromDb(targetId) {
          return await Order.findById(targetId);
        }
        module.exports = { fetchOrderFromDb };
      `,
      'server/service.js': `
        const { fetchOrderFromDb } = require('./repo');
        async function getOrderService(orderId) {
          const cleanId = parseInt(orderId, 10);
          return await fetchOrderFromDb(cleanId);
        }
        module.exports = { getOrderService };
      `,
      'server/routes.js': `
        const express = require('express');
        const { getOrderService } = require('./service');
        const router = express.Router();
        router.get('/orders/:id', async function getOrderHandler(req, res) {
          const id = req.params.id;
          const order = await getOrderService(id);
          res.json(order);
        });
        module.exports = router;
      `,
    };

    const { engine } = buildEngineFromFiles(filesWithSanitizer);
    const df = await engine.getDataflow({ route: 'GET /orders/:id' });
    expect(df).toHaveLength(1);

    // Because a sanitizer was added on the path, the taint was cleared:
    // Flow to sink is no longer reported!
    expect(df[0]!.sinks).toEqual([]);
    expect(df[0]!.steps).toEqual([]);
  });

  it('Acceptance 2 (variant): Validator library (validator.isMongoId) clears the taint', async () => {
    const filesWithValidator = {
      'server/models/Order.js': `
        const mongoose = require('mongoose');
        const schema = new mongoose.Schema({ title: String });
        module.exports = mongoose.model('Order', schema);
      `,
      'server/repo.js': `
        const Order = require('./models/Order');
        const validator = require('validator');
        async function fetchOrderFromDb(targetId) {
          validator.isMongoId(targetId);
          return await Order.findById(targetId);
        }
        module.exports = { fetchOrderFromDb };
      `,
      'server/service.js': `
        const { fetchOrderFromDb } = require('./repo');
        async function getOrderService(orderId) {
          return await fetchOrderFromDb(orderId);
        }
        module.exports = { getOrderService };
      `,
      'server/routes.js': `
        const express = require('express');
        const { getOrderService } = require('./service');
        const router = express.Router();
        router.get('/orders/:id', async function getOrderHandler(req, res) {
          const id = req.params.id;
          const order = await getOrderService(id);
          res.json(order);
        });
        module.exports = router;
      `,
    };

    const { engine } = buildEngineFromFiles(filesWithValidator);
    const df = await engine.getDataflow({ route: 'GET /orders/:id' });
    expect(df).toHaveLength(1);

    // Validator check cleared the taint
    expect(df[0]!.sinks).toEqual([]);
    expect(df[0]!.steps).toEqual([]);
  });

  it('Traces dangerous sinks: eval and child_process execution', async () => {
    const filesWithDangerousSinks = {
      'server/routes.js': `
        const express = require('express');
        const { exec } = require('child_process');
        const router = express.Router();
        router.post('/run', (req, res) => {
          const cmd = req.body.command;
          exec(cmd);
          eval(cmd);
          res.send('ok');
        });
        module.exports = router;
      `,
    };

    const { engine, model } = buildEngineFromFiles(filesWithDangerousSinks);

    // Verify Sink nodes in graph
    const sinkNodes = model.nodes.filter((n) => n.type === 'Sink');
    expect(sinkNodes.map((s) => s.key)).toEqual(expect.arrayContaining(['child_process', 'eval']));

    const df = await engine.getDataflow({ route: 'POST /run', input: 'req.body.command' });
    expect(df).toHaveLength(1);
    expect(df[0]!.sinks.map((s) => s.model)).toEqual(expect.arrayContaining(['child_process', 'eval']));
  });

  it('Traces reflected response sinks when user input is directly sent', async () => {
    const filesWithReflectedXss = {
      'server/routes.js': `
        const express = require('express');
        const router = express.Router();
        router.get('/echo', (req, res) => {
          const msg = req.query.msg;
          res.send(msg);
        });
        module.exports = router;
      `,
    };

    const { engine, model } = buildEngineFromFiles(filesWithReflectedXss);
    const sinkNodes = model.nodes.filter((n) => n.type === 'Sink');
    expect(sinkNodes.map((s) => s.key)).toContain('res.send');

    const df = await engine.getDataflow({ route: 'GET /echo', input: 'req.query.msg' });
    expect(df).toHaveLength(1);
    expect(df[0]!.sinks[0]).toMatchObject({
      model: 'res.send',
      op: 'send',
      argSources: ['req.query.msg'],
    });
  });
});
