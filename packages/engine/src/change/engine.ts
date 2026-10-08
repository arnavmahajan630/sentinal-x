import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { Config } from '../config';
import { loadConfig } from '../config';
import { models } from '../db/collections';
import { bus, EVENTS_CHANNEL } from '../bus';
import { onChange as orchestratorOnChange } from '../orchestrator/run';
import type { AssessmentResult } from '../orchestrator/types';
import { computeGitDiff } from './diff';
import { reindexChange } from './reindex';
import { transitionFindings } from './transitions';
import type {
  ChangeSetRecord,
  FindingTransition,
  ImpactAnalysisResult,
  ProcessChangeOptions,
} from './types';

export interface ProcessChangeResult {
  changeSet: ChangeSetRecord;
  impact: ImpactAnalysisResult;
  transitions: FindingTransition[];
  assessmentResult?: AssessmentResult;
}

export class ChangeEngine {
  private cfg: Config;

  constructor(cfg?: Config) {
    this.cfg = cfg ?? loadConfig();
  }

  /**
   * Complete Change Intelligence execution flow:
   * 1. Detect diff / files changed
   * 2. Re-index modified files and update the security graph (diff-apply)
   * 3. Compute impact across affected nodes, callers, and callees
   * 4. Re-verify existing touched findings and apply transitions (open → resolved, resolved → regressed)
   * 5. Record change_sets and security_events in MongoDB
   * 6. Trigger orchestrator.onChange to run relevant specialist agents on the affected subgraph
   */
  async processChange(
    projectId: string,
    options: ProcessChangeOptions = {},
  ): Promise<ProcessChangeResult> {
    const changeSetId = randomUUID();
    const now = new Date().toISOString();

    // 1. Fetch project info
    let projectDoc: any = null;
    if (mongoose.connection.readyState === 1) {
      projectDoc = await models.projects.findOne({ projectId }).lean();
      if (!projectDoc) {
        throw new Error(`Project "${projectId}" not found`);
      }
    }

    const projectPath = projectDoc?.path ?? process.cwd();
    const baseGitHead = projectDoc?.gitHead ?? null;

    // 2. Determine changed files
    let changedFiles = options.changedFiles;
    let addedFiles: string[] = [];
    let deletedFiles: string[] = [];
    let currentGitHead: string | null = baseGitHead;

    if (!changedFiles) {
      const diff = await computeGitDiff(projectPath, baseGitHead);
      changedFiles = diff.changedFiles;
      addedFiles = diff.addedFiles;
      deletedFiles = diff.deletedFiles;
      currentGitHead = diff.head;
    }

    const allChangedFiles = Array.from(
      new Set([...(changedFiles ?? []), ...addedFiles, ...deletedFiles]),
    ).sort();

    // 3. Partial re-index and graph diff-apply
    const reindexRes = await reindexChange(projectId);
    const { impact, stats } = reindexRes;

    // 4. Initial change_set record
    const changeSet: ChangeSetRecord = {
      id: changeSetId,
      projectId,
      gitHead: currentGitHead,
      changedFiles: allChangedFiles.length > 0 ? allChangedFiles : reindexRes.changedFiles,
      addedFiles,
      deletedFiles,
      changedNodeIds: impact.allAffectedNodeIds,
      affectedNodeTypes: impact.affectedNodeTypes,
      impactedRoutes: impact.impactedRoutes,
      status: 'processing',
      reindexStats: {
        filesIndexed: stats.filesIndexed,
        nodesChanged: impact.directlyAffectedNodeIds.length,
        edgesChanged: stats.edgesCount,
        durationMs: stats.durationMs,
      },
      transitions: [],
      createdAt: now,
      updatedAt: now,
    };

    if (mongoose.connection.readyState === 1) {
      await models.change_sets.create(changeSet);
      await models.security_events.create({
        projectId,
        ts: new Date(),
        type: 'change.detected',
        summary: `Code change detected: ${changeSet.changedFiles.length} files changed, ${impact.allAffectedNodeIds.length} nodes affected`,
        changeSetId,
        changedFiles: changeSet.changedFiles,
      });
    }

    bus.publish(EVENTS_CHANNEL, {
      kind: 'change.detected',
      projectId,
      changeSetId,
      changedFiles: changeSet.changedFiles,
      changedNodeIds: impact.allAffectedNodeIds,
      affectedNodeTypes: impact.affectedNodeTypes,
      impactedRoutes: impact.impactedRoutes,
      ts: now,
    });

    // 5. Finding status transitions (re-verifying existing touched findings)
    const transitions = await transitionFindings(this.cfg, projectId, impact.allAffectedNodeIds, {
      verifier: options.verifier,
      enableVerification: options.enableVerification,
    });

    changeSet.transitions = transitions;

    // 6. Targeted agent re-analysis via orchestrator
    let assessmentResult: AssessmentResult | undefined;
    if (options.runAgents !== false) {
      try {
        assessmentResult = await orchestratorOnChange(
          projectId,
          {
            changedFiles: changeSet.changedFiles,
            changedNodeIds: impact.allAffectedNodeIds,
            affectedNodeTypes: impact.affectedNodeTypes,
          },
          {
            enableVerification: options.enableVerification,
            signal: options.signal,
          },
        );
        changeSet.assessmentId = assessmentResult.assessmentId;
      } catch (err) {
        changeSet.error = err instanceof Error ? err.message : String(err);
      }
    }

    // 7. Complete change_set record
    changeSet.status = changeSet.error ? 'failed' : 'completed';
    changeSet.updatedAt = new Date().toISOString();

    if (mongoose.connection.readyState === 1) {
      await models.change_sets.updateOne(
        { id: changeSetId },
        {
          $set: {
            status: changeSet.status,
            transitions: changeSet.transitions,
            assessmentId: changeSet.assessmentId,
            error: changeSet.error,
            updatedAt: changeSet.updatedAt,
          },
        },
      );

      await models.security_events.create({
        projectId,
        ts: new Date(),
        type: 'change.completed',
        summary: `Change re-analysis ${changeSet.status}: ${transitions.length} finding transitions, ${assessmentResult?.findings.length ?? 0} confirmed findings`,
        changeSetId,
      });
    }

    bus.publish(EVENTS_CHANNEL, {
      kind: 'change.completed',
      projectId,
      changeSetId,
      status: changeSet.status,
      transitionsCount: transitions.length,
      assessmentId: changeSet.assessmentId,
      ts: changeSet.updatedAt,
    });

    return {
      changeSet,
      impact,
      transitions,
      assessmentResult,
    };
  }
}
