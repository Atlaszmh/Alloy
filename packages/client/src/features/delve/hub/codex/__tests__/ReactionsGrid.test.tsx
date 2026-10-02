import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactionsGrid } from '../ReactionsGrid';

describe('ReactionsGrid', () => {
  it('names the reactions it is told about and hides the rest', () => {
    render(<ReactionsGrid reactionsSeen={['melt']} />);
    expect(screen.getByTestId('reaction-melt')).toBeInTheDocument();
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);
    expect(screen.getAllByTestId('reaction-unknown')[0]).toHaveTextContent(
      'Stack one element on a foe, then hit it with another, to discover.',
    );
    expect(screen.getByText('1/15 discovered')).toBeInTheDocument();
  });
});
