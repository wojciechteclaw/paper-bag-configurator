import { describe, expect, it } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import { parseProject, serializeProject } from '../../../src/domain/project/index';
import { sanitizeConfiguration } from '../../../src/domain/project/sanitizeConfiguration';
import type { BagWindow } from '../../../src/domain/types';

function sanitize(raw: unknown) {
  const result = sanitizeConfiguration(raw);
  if (!result.ok) throw new Error(result.error);
  return result;
}

const window: BagWindow = { type: 'RECTANGLE', material: 'CELLULOSE', width: 60, height: 100, bottomOffset: 150, filmOverlap: 10 };
const folded = () => ({ ...createConfiguration('FOLDED'), window });

describe('sanitizeConfiguration: window (docs/SPEC.md §2b)', () => {
  it('keeps a valid window without adjustments', () => {
    const result = sanitize(JSON.parse(JSON.stringify(folded())));
    expect(result.configuration.window).toEqual(window);
    expect(result.adjustments).toEqual([]);
  });

  it('reads files saved before windows existed as "no window", silently', () => {
    const { window: _window, ...older } = createConfiguration('FOLDED');
    const result = sanitize(JSON.parse(JSON.stringify(older)));
    expect(result.configuration.window).toBeNull();
    expect(result.adjustments).toEqual([]);
  });

  it('clamps out-of-range values into the window limits and reports the section', () => {
    const result = sanitize({ ...folded(), window: { ...window, width: 999, filmOverlap: 2, material: 'GLASS' } });
    // Overlap 2 → 5, so the margin is 10 mm and the width may reach 140 − 20 = 120.
    expect(result.configuration.window).toEqual({ ...window, material: 'PP', width: 120, filmOverlap: 5 });
    expect(new Set(result.adjustments.map((a) => a.section))).toEqual(new Set(['window']));
  });

  it('drops a window of an unknown type, or on a bag type without windows', () => {
    expect(sanitize({ ...folded(), window: { ...window, type: 'ROUND' } }).configuration.window).toBeNull();
    const block = sanitize({ ...createConfiguration('BLOCK'), window });
    expect(block.configuration.window).toBeNull();
    expect(block.adjustments).toContainEqual({ section: 'window', field: 'window' });
  });
});

describe('project file round trip with a window', () => {
  it.each<BagWindow>([window, { type: 'PANORAMIC', material: 'PP_PERFORATED', width: 50, filmOverlap: 15 }])('restores %o', (w) => {
    const configuration = { ...createConfiguration('FOLDED'), window: w };
    const bytes = serializeProject({ configuration, files: new Map(), exportedAt: new Date('2026-09-30T10:00:00Z'), appVersion: '1.0.0' });
    const project = parseProject(bytes);
    expect(project.adjustments).toEqual([]);
    expect(project.configuration.window).toEqual(w);
    expect(project.configuration).toEqual(configuration);
  });
});
