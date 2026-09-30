import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import { serializeProject } from '../../../src/domain/project';
import { fixtureProject, withoutFileUrls } from '../../domain/project/testFixtures';
import i18n from '../../../src/i18n';
import { useConfigurationStore } from '../../../src/state/configurationStore';
import { useProjectStore } from '../../../src/state/projectFile';
import { ProjectFileActions, SaveProjectButton } from '../../../src/ui/components/ProjectFileActions';

const store = () => useConfigurationStore.getState();

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

function projectFile(name = 'moj-projekt.bagproj') {
  const { configuration, files } = fixtureProject();
  const bytes = serializeProject({ configuration, files, exportedAt: new Date('2026-09-30T08:00:00Z'), appVersion: 'test' });
  return { configuration, file: new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/zip' }) };
}

const chooseFile = (file: File) => fireEvent.change(screen.getByTestId('project-file-input'), { target: { files: [file] } });

beforeEach(async () => {
  await i18n.changeLanguage('pl');
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:ui/${++counter}`);
  URL.revokeObjectURL = vi.fn();
  const fresh = createConfiguration('BLOCK');
  useConfigurationStore.setState({ configuration: fresh });
  useProjectStore.getState().markSaved(fresh);
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ProjectFileActions', () => {
  it('saves the project as a .bagproj download built from the artwork files', async () => {
    const { configuration, files } = fixtureProject();
    store().replaceConfiguration(configuration);
    const byUrl = new Map(
      [configuration.panels.FRONT.artwork!, configuration.panels.BACK.artwork!, configuration.wrapLayers[0].artwork].map((a) => [
        a.fileUrl,
        files.get(a.id)!,
      ]),
    );
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200, arrayBuffer: async () => byUrl.get(url)!.slice().buffer }));
    vi.stubGlobal('fetch', fetchMock);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<ProjectFileActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz projekt' }));

    expect(await screen.findByText(/^Zapisano projekt: projekt-torby-block-250x300x100-\d{4}-\d{2}-\d{2}\.bagproj$/)).toBeInTheDocument();
    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toMatch(/\.bagproj$/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports artwork that cannot be read when saving', async () => {
    const { configuration } = fixtureProject();
    store().replaceConfiguration(configuration);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));

    render(<ProjectFileActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz projekt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nie można odczytać grafiki „logo.png”');
  });

  it('loads a project straight away when there are no unsaved changes', async () => {
    const { configuration, file } = projectFile();
    render(<ProjectFileActions />);

    chooseFile(file);

    expect(await screen.findByText(/Wczytano projekt „moj-projekt\.bagproj” \(zapisany/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(withoutFileUrls(store().configuration)).toEqual(withoutFileUrls(configuration));
  });

  it('asks for confirmation before replacing a project with unsaved changes', async () => {
    const { configuration, file } = projectFile();
    store().setDimension('height', 350);
    const edited = store().configuration;
    render(<ProjectFileActions />);

    chooseFile(file);
    const dialog = await screen.findByRole('alertdialog', { name: 'Wczytać projekt?' });
    expect(dialog).toHaveTextContent('moj-projekt.bagproj');
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveFocus();
    expect(store().configuration).toBe(edited);

    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(store().configuration).toBe(edited);

    chooseFile(file);
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(store().configuration).toBe(edited);

    chooseFile(file);
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Wczytaj' }));
    await waitFor(() => expect(withoutFileUrls(store().configuration)).toEqual(withoutFileUrls(configuration)));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Wczytano projekt');
  });

  it('shows an error and keeps the project when the file is not a project', async () => {
    const before = store().configuration;
    render(<ProjectFileActions />);

    chooseFile(new File(['hello'], 'notatki.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('to nie jest plik projektu');
    expect(store().configuration).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij komunikat' }));
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('tells the user about artwork that an older JSON file could not carry', async () => {
    const { configuration } = fixtureProject();
    const file = new File([JSON.stringify(configuration)], 'bag-configuration-1234.json', { type: 'application/json' });
    render(<ProjectFileActions />);

    chooseFile(file);

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Plik nie zawiera grafik'));
    expect(store().configuration.panels.FRONT.artwork).toBeNull();
    expect(store().configuration.dimensions).toEqual(configuration.dimensions);
  });
});

describe('SaveProjectButton', () => {
  it('saves the project from the Summary step', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<SaveProjectButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz projekt (.bagproj)' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Zapisano projekt');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
