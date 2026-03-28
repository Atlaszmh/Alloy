// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmLeaveDialog } from '../ConfirmLeaveDialog';

// jsdom doesn't implement showModal/close on <dialog>
beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= vi.fn();
  HTMLDialogElement.prototype.close ??= vi.fn();
});

describe('ConfirmLeaveDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmLeaveDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    // dialog exists in DOM but is not visible (native dialog behavior)
    expect(container.querySelector('dialog')).toBeTruthy();
  });

  it('shows leave confirmation text when open', () => {
    render(
      <ConfirmLeaveDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByText('Leave match?')).toBeTruthy();
    expect(screen.getByText(/Leaving will forfeit/)).toBeTruthy();
  });

  it('calls onClose when Stay is clicked', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmLeaveDialog open={true} onClose={onClose} onConfirm={vi.fn()} />,
    );
    await userEvent.click(screen.getByText('Stay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onConfirm when Leave is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmLeaveDialog open={true} onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    await userEvent.click(screen.getByText('Leave'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('shows queue-specific message when variant is queue', () => {
    render(
      <ConfirmLeaveDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} variant="queue" />,
    );
    expect(screen.getByText(/cancel matchmaking/)).toBeTruthy();
  });
});
