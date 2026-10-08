import { describe, expect, it } from 'vitest';
import { InMemoryGraphStore } from '../../src/graph/memoryStore';
import { analyzeImpact } from '../../src/change/impact';

describe('analyzeImpact (Impact Analysis)', () => {
  it('maps changed files to directly affected nodes and expands callers and callees', async () => {
    const projectId = 'test-impact';
    const store = new InMemoryGraphStore(projectId);

    // Setup graph:
    // File: routes/orders.js CONTAINS Route:GET /api/orders/:id
    // Route:GET /api/orders/:id CALLS Function:controllers/order.js#getOrder
    // Function:controllers/order.js#getOrder CALLS Function:helpers/db.js#findOrder
    // Route:GET /api/orders/:id PROTECTED_BY Middleware:auth
    // Function:controllers/order.js#getOrder ACCESSES Model:Order

    await store.addNode({ type: 'File', key: 'routes/orders.js' });
    await store.addNode({ type: 'File', key: 'controllers/order.js' });
    await store.addNode({ type: 'File', key: 'helpers/db.js' });

    await store.addNode({
      type: 'Route',
      key: 'GET /api/orders/:id',
      props: { file: 'routes/orders.js' },
      loc: { file: 'routes/orders.js', line: 10, col: 1 },
    });

    await store.addNode({
      type: 'Function',
      key: 'controllers/order.js#getOrder',
      props: { file: 'controllers/order.js' },
      loc: { file: 'controllers/order.js', line: 15, col: 1 },
    });

    await store.addNode({
      type: 'Function',
      key: 'helpers/db.js#findOrder',
      props: { file: 'helpers/db.js' },
      loc: { file: 'helpers/db.js', line: 5, col: 1 },
    });

    await store.addNode({
      type: 'Middleware',
      key: 'auth',
      props: { file: 'middleware/auth.js' },
      loc: { file: 'middleware/auth.js', line: 1, col: 1 },
    });

    await store.addNode({
      type: 'Model',
      key: 'Order',
      props: { file: 'models/Order.js' },
      loc: { file: 'models/Order.js', line: 1, col: 1 },
    });

    // Edges
    await store.addEdge({
      type: 'CONTAINS',
      from: 'File:routes/orders.js',
      to: 'Route:GET /api/orders/:id',
    });

    await store.addEdge({
      type: 'CALLS',
      from: 'Route:GET /api/orders/:id',
      to: 'Function:controllers/order.js#getOrder',
    });

    await store.addEdge({
      type: 'CALLS',
      from: 'Function:controllers/order.js#getOrder',
      to: 'Function:helpers/db.js#findOrder',
    });

    await store.addEdge({
      type: 'PROTECTED_BY',
      from: 'Route:GET /api/orders/:id',
      to: 'Middleware:auth',
    });

    await store.addEdge({
      type: 'ACCESSES',
      from: 'Function:controllers/order.js#getOrder',
      to: 'Model:Order',
    });

    // Case 1: Editing helpers/db.js should expand callers to getOrder and GET /api/orders/:id
    const helperImpact = await analyzeImpact(projectId, ['helpers/db.js'], [], store);

    expect(helperImpact.directlyAffectedNodeIds).toContain('File:helpers/db.js');
    expect(helperImpact.directlyAffectedNodeIds).toContain('Function:helpers/db.js#findOrder');
    // Caller expansion
    expect(helperImpact.callerCalleeNodeIds).toContain('Function:controllers/order.js#getOrder');
    expect(helperImpact.allAffectedNodeIds).toContain('Function:controllers/order.js#getOrder');
    expect(helperImpact.affectedNodeTypes).toContain('Function');

    // Case 2: Editing routes/orders.js directly impacts the Route and calls down to getOrder
    const routeImpact = await analyzeImpact(projectId, ['routes/orders.js'], [], store);

    expect(routeImpact.directlyAffectedNodeIds).toContain('File:routes/orders.js');
    expect(routeImpact.directlyAffectedNodeIds).toContain('Route:GET /api/orders/:id');
    expect(routeImpact.impactedRoutes).toContain('Route:GET /api/orders/:id');
    expect(routeImpact.affectedNodeTypes).toContain('Route');

    // Case 3: Editing middleware/auth.js impacts routes protected by it
    const mwImpact = await analyzeImpact(projectId, ['middleware/auth.js'], [], store);
    expect(mwImpact.directlyAffectedNodeIds).toContain('Middleware:auth');
    expect(mwImpact.callerCalleeNodeIds).toContain('Route:GET /api/orders/:id');
    expect(mwImpact.allAffectedNodeIds).toContain('Route:GET /api/orders/:id');
    expect(mwImpact.impactedRoutes).toContain('Route:GET /api/orders/:id');

    // Case 4: Editing models/Order.js impacts functions accessing it
    const modelImpact = await analyzeImpact(projectId, ['models/Order.js'], [], store);
    expect(modelImpact.directlyAffectedNodeIds).toContain('Model:Order');
    expect(modelImpact.callerCalleeNodeIds).toContain('Function:controllers/order.js#getOrder');
  });
});
