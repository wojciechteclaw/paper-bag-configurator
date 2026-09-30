import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../src/i18n';
import { AppHeader } from '../../../src/ui/components/AppHeader';
import { DEMO_COUNT } from '../../../src/ui/demo/demoConfiguration';

const mocks = vi.hoisted(() => ({
  loadDemo: vi.fn(),
  exportProject: vi.fn(),
  readProjectFile: vi.fn(),
  applyProject: vi.fn(),
}));

vi.mock('../../../src/ui/demo/demoConfiguration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/ui/demo/demoConfiguration')>()),
  loadDemoConfiguration: mocks.loadDemo,
}));
vi.mock('../../../src/state/projectFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/state/projectFile')>()),
  exportProject: mocks.exportProject,
  readProjectFile: mocks.readProjectFile,
  applyProject: mocks.applyProject,
  hasUnsavedChanges: () => false,
}));

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  Object.values(mocks).forEach((mock) => mock.mockReset());
  URL.createObjectURL = vi.fn(() => 'blob:download');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

function openMenu() {
  render(<AppHeader />);
  const toggle = screen.getByRole('button', { name: 'Menu' });
  fireEvent.click(toggle);
  const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  return { toggle, panel };
}

const demo = (index: number) => screen.getByRole('button', { name: new RegExp(`^(Demo ${index}|Wczytywanie…)$`) });

describe('AppHeader navigation menu', () => {
  it('fits title, language switcher and the ☰ toggle in the header; the menu has the project actions and every demo', () => {
    const { panel } = openMenu();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Konfigurator toreb');
    expect(screen.getByRole('button', { name: 'PL' })).toBeInTheDocument();
    const project = within(panel).getByRole('region', { name: 'Projekt' });
    expect(within(project).getByRole('button', { name: 'Zapisz projekt' })).toBeInTheDocument();
    expect(within(project).getByRole('button', { name: 'Wczytaj projekt' })).toBeInTheDocument();
    const demos = within(panel).getByRole('region', { name: 'Przykłady (demo)' });
    expect(within(demos).getAllByRole('listitem')).toHaveLength(DEMO_COUNT);
    // Each demo shows (and is described by) its short description.
    expect(demo(1)).toHaveAccessibleDescription(/torba klockowa XL 320 × 220 × 400 mm/);
    expect(within(demos).getByText(/torba fałdowa 150 \+ 60 × 250 mm/)).toBeInTheDocument();
  });

  it('loads demo N: busy while loading, then closes the menu', async () => {
    let finish: (value: { missing: string[]; total: number }) => void = () => {};
    mocks.loadDemo.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { panel, toggle } = openMenu();
    fireEvent.click(demo(3));
    expect(mocks.loadDemo).toHaveBeenCalledWith(3);
    expect(within(panel).getByRole('button', { name: 'Wczytywanie…' })).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await act(async () => finish({ missing: [], total: 1 }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(demo(3)).toBeEnabled();
  });

  it('keeps the menu open and shows the problem in the item when a demo fails or misses images', async () => {
    mocks.loadDemo.mockRejectedValueOnce(new Error('404'));
    const { toggle } = openMenu();
    fireEvent.click(demo(2));
    const error = 'Nie udało się wczytać demo: brak lub błędny public/demo2/config.json.';
    await waitFor(() => expect(demo(2)).toHaveAccessibleDescription(new RegExp(error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    // Shown in the item and announced by its live region.
    const shown = screen.getAllByText(error);
    expect(shown).toHaveLength(2);
    expect(shown.some((element) => element.getAttribute('role') === 'status')).toBe(true);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    mocks.loadDemo.mockResolvedValueOnce({ missing: ['image-2.webp'], total: 2 });
    fireEvent.click(demo(4));
    await waitFor(() => expect(demo(4)).toHaveAccessibleDescription(/brakuje grafik: image-2\.webp/));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('saves the project from the menu (menu closes, the result shows as a message)', async () => {
    mocks.exportProject.mockResolvedValue({ blob: new Blob(['x']), fileName: 'projekt-torby.bagproj' });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { toggle } = openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz projekt' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(mocks.exportProject).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/projekt-torby\.bagproj/)).toBeInTheDocument());
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('loads a project from the menu: closes it and opens the file picker, then reads the chosen file', async () => {
    mocks.readProjectFile.mockResolvedValue({ configuration: {}, warnings: [], adjustments: [], exportedAt: null });
    const { toggle } = openMenu();
    const input = screen.getByTestId('project-file-input') as HTMLInputElement;
    const pick = vi.spyOn(input, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Wczytaj projekt' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(pick).toHaveBeenCalledTimes(1);
    const file = new File(['zip'], 'moj.bagproj');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mocks.applyProject).toHaveBeenCalledTimes(1));
    expect(mocks.readProjectFile).toHaveBeenCalledWith(file);
  });
});
