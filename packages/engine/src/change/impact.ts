import mongoose from 'mongoose';
import { models } from '../db/collections';
import { fileNodeId, parseNodeId } from '../graph/ids';
import { MongoGraphStore } from '../graph/mongoStore';
import type { GraphStore } from '../graph/store';
import type { NodeId } from '../graph/types';
import type { ImpactAnalysisResult } from './types';

/**
 * Normalizes file paths to posix relative format
 */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Analyze the impact of changed files and changed nodes on the security graph.
 * Traces:
 * 1. Directly affected nodes (File, Route, Function, Model, Middleware, Input defined in or contained by the file)
 * 2. Function callers (incoming CALLS edges — e.g. routes or callers using a modified helper)
 * 3. Function callees (outgoing CALLS edges)
 * 4. Middleware-protected routes (incoming PROTECTED_BY edges)
 * 5. Model accessors (incoming ACCESSES edges)
 * 6. Input dataflows (outgoing FLOWS_TO edges)
 */
export async function analyzeImpact(
  projectId: string,
  changedFiles: string[],
  additionalChangedNodeIds: string[] = [],
  customStore?: GraphStore,
): Promise<ImpactAnalysisResult> {
  const normFiles = new Set(changedFiles.map(toPosix));
  const store =
    customStore ??
    (mongoose.connection.readyState === 1 ? new MongoGraphStore(projectId) : undefined);

  if (!store) {
    // If no store available (e.g. offline memory mode without provided store), synthesize from node IDs
    const directlyAffected = new Set<string>(additionalChangedNodeIds);
    for (const f of normFiles) {
      directlyAffected.add(fileNodeId(f));
    }
    const allAffected = Array.from(directlyAffected).sort();
    const affectedNodeTypes = Array.from(
      new Set(allAffected.map((id) => parseNodeId(id as NodeId).type)),
    ).sort();
    const impactedRoutes = allAffected.filter((id) => id.startsWith('Route:'));

    return {
      changedFiles: Array.from(normFiles).sort(),
      directlyAffectedNodeIds: allAffected,
      callerCalleeNodeIds: [],
      allAffectedNodeIds: allAffected,
      affectedNodeTypes,
      impactedRoutes,
    };
  }

  // 1. Collect directly affected nodes
  const directlyAffected = new Set<string>();

  // Add explicitly supplied changed node IDs (e.g. from buildGraph diff-apply)
  for (const id of additionalChangedNodeIds) {
    directlyAffected.add(id);
  }

  // Find nodes associated with the changed files
  for (const file of normFiles) {
    const fNodeId = fileNodeId(file);
    directlyAffected.add(fNodeId);

    // Nodes contained by the file (via CONTAINS)
    try {
      const contained = await store.neighbors(fNodeId as NodeId, 'CONTAINS', 'out');
      for (const n of contained) directlyAffected.add(n.id);
    } catch {
      // Ignore if file node does not exist
    }

    // Nodes located in this file
    if (mongoose.connection.readyState === 1) {
      try {
        const matchingDocs = await models.graph_nodes
          .find({ projectId, 'loc.file': file }, { id: 1 })
          .lean();
        for (const d of matchingDocs) directlyAffected.add((d as any).id);
      } catch {
        // Fallback
      }
    }

    const matchingPropsNodes = await store.find({ props: { file } });
    for (const n of matchingPropsNodes) directlyAffected.add(n.id);

    const routeCandidates = await store.find({ type: 'Route' });
    for (const r of routeCandidates) {
      if (r.loc?.file === file || r.props?.file === file) {
        directlyAffected.add(r.id);
      }
    }

    // Functions with key starting with file# or file@
    const fnCandidates = await store.find({ type: 'Function' });
    for (const fn of fnCandidates) {
      if (fn.key.startsWith(`${file}#`) || fn.key.startsWith(`${file}@`) || fn.loc?.file === file) {
        directlyAffected.add(fn.id);
      }
    }

    // Models or Middleware located in or named by the file
    const mwCandidates = await store.find({ type: 'Middleware' });
    for (const mw of mwCandidates) {
      if (mw.loc?.file === file || mw.props?.file === file) {
        directlyAffected.add(mw.id);
      }
    }

    const modelCandidates = await store.find({ type: 'Model' });
    for (const m of modelCandidates) {
      if (m.loc?.file === file || m.props?.file === file) {
        directlyAffected.add(m.id);
      }
    }
  }

  // 2. Expand callers, callees, and dependencies
  const callerCallee = new Set<string>();

  for (const nodeIdStr of directlyAffected) {
    const id = nodeIdStr as NodeId;
    const { type } = parseNodeId(id);

    if (type === 'Function') {
      // Callers (who calls this function? Functions & Routes)
      const callerEdges = await store.edgesOf(id, { type: 'CALLS', dir: 'in' });
      for (const e of callerEdges) {
        if (!directlyAffected.has(e.from)) callerCallee.add(e.from);
      }

      // Callees (who does this function call?)
      const calleeEdges = await store.edgesOf(id, { type: 'CALLS', dir: 'out' });
      for (const e of calleeEdges) {
        if (!directlyAffected.has(e.to)) callerCallee.add(e.to);
      }

      // Inputs flowing into this function
      const inputEdges = await store.edgesOf(id, { type: 'FLOWS_TO', dir: 'in' });
      for (const e of inputEdges) {
        if (!directlyAffected.has(e.from)) callerCallee.add(e.from);
      }
    } else if (type === 'Middleware') {
      // Routes protected by this middleware
      const protEdges = await store.edgesOf(id, { type: 'PROTECTED_BY', dir: 'in' });
      for (const e of protEdges) {
        if (!directlyAffected.has(e.from)) callerCallee.add(e.from);
      }
    } else if (type === 'Model') {
      // Functions accessing this model
      const accessEdges = await store.edgesOf(id, { type: 'ACCESSES', dir: 'in' });
      for (const e of accessEdges) {
        if (!directlyAffected.has(e.from)) callerCallee.add(e.from);
        // Also add callers of those accessor functions (e.g. routes calling them)
        const callers = await store.edgesOf(e.from as NodeId, { type: 'CALLS', dir: 'in' });
        for (const ce of callers) {
          if (!directlyAffected.has(ce.from)) callerCallee.add(ce.from);
        }
      }
    } else if (type === 'Input') {
      // Functions this input flows to
      const flowEdges = await store.edgesOf(id, { type: 'FLOWS_TO', dir: 'out' });
      for (const e of flowEdges) {
        if (!directlyAffected.has(e.to)) callerCallee.add(e.to);
      }
    }
  }

  const directlyAffectedList = Array.from(directlyAffected).sort();
  const callerCalleeList = Array.from(callerCallee).sort();
  const allAffected = Array.from(new Set([...directlyAffectedList, ...callerCalleeList])).sort();

  const affectedNodeTypes = Array.from(
    new Set(allAffected.map((id) => parseNodeId(id as NodeId).type)),
  ).sort();

  const impactedRoutes = allAffected.filter((id) => id.startsWith('Route:'));

  return {
    changedFiles: Array.from(normFiles).sort(),
    directlyAffectedNodeIds: directlyAffectedList,
    callerCalleeNodeIds: callerCalleeList,
    allAffectedNodeIds: allAffected,
    affectedNodeTypes,
    impactedRoutes,
  };
}
