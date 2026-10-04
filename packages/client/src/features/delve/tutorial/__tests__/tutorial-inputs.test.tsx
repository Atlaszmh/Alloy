import { describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { TUTORIAL_INPUTS } from '@alloy/engine';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { TutorialParts } from '../TutorialPanel';

// Every input a line may name ({input:<action>}) draws a glyph on each device, from the default
// bindings: never an empty part, never "undefined" or "null".

describe("the guided start's inputs", () => {
  it.each(['keyboard', 'gamepad'] as const)('each draws as a glyph under the %s', (device) => {
    act(() => useInputDeviceStore.setState({ device }));
    const bad = TUTORIAL_INPUTS.filter((input) => {
      const { container, unmount } = render(<TutorialParts parts={[{ input }]} />);
      const text = container.textContent ?? '';
      const named = [...container.querySelectorAll('[aria-label]')].map(
        (e) => e.getAttribute('aria-label') ?? '',
      );
      const drawn = `${text}${named.join('')}`.trim();
      unmount();
      return drawn === '' || /undefined|null/.test(drawn);
    });
    expect(bad).toEqual([]);
  });
});
