import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useConfirm } from './confirm-dialog';

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const { ask, dialog } = useConfirm();
  return (
    <>
      <button onClick={async () => onResult(await ask({ title: 'Delete it?', description: 'Cannot be undone.', confirmLabel: 'Delete', destructive: true }))}>open</button>
      {dialog}
    </>
  );
}

afterEach(cleanup);

describe('useConfirm', () => {
  it('shows an in-page dialog, not the browser pop-up, and resolves true on confirm', async () => {
    const native = vi.fn(() => true);
    vi.stubGlobal('confirm', native);
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByText('open'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Delete it?');
    expect(dialog.textContent).toContain('Cannot be undone.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(native).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('resolves false on cancel and on Escape', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));

    fireEvent.click(screen.getByText('open'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(2));
    expect(onResult).toHaveBeenLastCalledWith(false);
  });
});
