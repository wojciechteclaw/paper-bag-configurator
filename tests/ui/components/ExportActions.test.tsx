import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfiguration } from '../../../src/domain/factories';
import type { ExportProgress, ProgressCallback } from '../../../src/ui/export/exportConfiguration';
import { ExportActions } from '../../../src/ui/components/ExportActions';

type Exporter = (configuration: unknown, context: { language: string }, onProgress?: ProgressCallback) => Promise<void>;

const mocks = vi.hoisted(() => ({
  exportProductSheetPdf: vi.fn<Exporter>(),
  exportWorkbook: vi.fn<Exporter>(),
}));

vi.mock('../../../src/ui/export/exportConfiguration', () => mocks);

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ExportActions', () => {
  beforeEach(() => {
    mocks.exportProductSheetPdf.mockReset();
    mocks.exportWorkbook.mockReset();
  });

  it('disables both buttons and shows progress while the PDF is generated, then reports success', async () => {
    const job = deferred();
    let report: ((progress: ExportProgress) => void) | undefined;
    mocks.exportProductSheetPdf.mockImplementation((_config, _context, onProgress) => {
      report = onProgress;
      return job.promise;
    });
    const configuration = createConfiguration();
    render(<ExportActions configuration={configuration} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pobierz PDF' }));
    await waitFor(() => expect(mocks.exportProductSheetPdf).toHaveBeenCalledTimes(1));
    expect(mocks.exportProductSheetPdf.mock.calls[0][0]).toBe(configuration);
    expect(mocks.exportProductSheetPdf.mock.calls[0][1].language).toBe('pl');
    expect(screen.getByRole('button', { name: 'Pobierz PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pobierz Excel' })).toBeDisabled();
    expect(screen.getByTestId('export-status')).toHaveTextContent('Liczenie pokrycia farbą…');

    act(() => report?.({ phase: 'views', done: 3, total: 8 }));
    expect(screen.getByTestId('export-status')).toHaveTextContent('Renderowanie widoków 3D (3/8)…');

    await act(async () => job.resolve());
    expect(screen.getByRole('button', { name: 'Pobierz PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pobierz Excel' })).toBeEnabled();
    expect(screen.getByTestId('export-status')).toHaveTextContent('Plik został pobrany.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error and re-enables the buttons when the Excel export fails', async () => {
    const job = deferred();
    mocks.exportWorkbook.mockReturnValue(job.promise);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ExportActions configuration={createConfiguration()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pobierz Excel' }));
    await waitFor(() => expect(mocks.exportWorkbook).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Pobierz PDF' })).toBeDisabled();

    await act(async () => job.reject(new Error('boom')));
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się przygotować pliku.');
    expect(screen.getByRole('button', { name: 'Pobierz Excel' })).toBeEnabled();
    expect(mocks.exportProductSheetPdf).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
