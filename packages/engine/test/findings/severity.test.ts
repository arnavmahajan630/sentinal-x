import { describe, expect, it } from 'vitest';
import { computeSeverity } from '../../src/findings/severity';

describe('computeSeverity', () => {
  it('stays at base when nothing escalates', () => {
    expect(computeSeverity({ base: 'medium', assetWeight: 0.6, routeProtected: true })).toBe(
      'medium',
    );
  });

  it('escalates one rank for a financial-or-above asset', () => {
    expect(computeSeverity({ base: 'medium', assetWeight: 0.9, routeProtected: true })).toBe(
      'high',
    );
    expect(computeSeverity({ base: 'medium', assetWeight: 1, routeProtected: true })).toBe('high');
  });

  it('escalates one rank for an unprotected route', () => {
    expect(computeSeverity({ base: 'medium', assetWeight: 0, routeProtected: false })).toBe(
      'high',
    );
  });

  it('escalates by both but never past critical', () => {
    expect(computeSeverity({ base: 'high', assetWeight: 1, routeProtected: false })).toBe(
      'critical',
    );
  });

  it('never escalates past critical even when already critical', () => {
    expect(computeSeverity({ base: 'critical', assetWeight: 1, routeProtected: false })).toBe(
      'critical',
    );
  });

  it('never drops below base', () => {
    expect(computeSeverity({ base: 'low', assetWeight: 0, routeProtected: true })).toBe('low');
  });
});
