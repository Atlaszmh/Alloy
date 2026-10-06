import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { HelpDialog } from '../HelpDialog';

describe('HelpDialog', () => {
  it('is a kit dialog titled How to delve: the topics a sub tab list (LT/RT), one page at a time', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    const dialog = screen.getByTestId('help-dialog');
    expect(within(dialog).getByRole('heading')).toHaveTextContent('How to delve');
    const list = within(dialog).getByRole('tablist', { name: 'Help topics' });
    expect(list).toHaveAttribute('data-pad-tabs', 'sub');
    expect(within(list).getAllByRole('tab').map((t) => t.dataset.testid)).toEqual([
      'help-topic-controls', 'help-topic-weapons', 'help-topic-skills',
      'help-topic-forge', 'help-topic-floor', 'help-topic-banking',
    ]);
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'controls');
    fireEvent.click(screen.getByTestId('help-topic-weapons'));
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'weapons');
    expect(screen.getByTestId('howto-carries')).toBeInTheDocument();
  });

  it('opens on the topic asked for; its page scrolls on the right stick; Back closes it', () => {
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} topic="banking" />);
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'banking');
    expect(screen.getByTestId('delve-howto').closest('[data-pad-scroll]')).not.toBeNull();
    fireEvent.click(within(screen.getByTestId('help-dialog')).getByRole('button', { name: /back/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
