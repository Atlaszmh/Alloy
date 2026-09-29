import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LabChart, type ChartLine } from '../LabChart';

/** 60 samples: `early` for the first 2.5 s, then `settled`. */
function series(early: number, settled: number): number[] {
  return Array.from({ length: 60 }, (_, i) => (i < 5 ? early : settled));
}

function line(key: string, s: number[]): ChartLine {
  return { key, label: key, color: '#fff', series: s };
}

describe('LabChart', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws a path per line, scaled from 3 s on, so an early spike clips at the top', () => {
    render(<LabChart lines={[line('a', series(1000, 37)), line('b', series(5, 20))]} />);
    const paths = screen.getAllByTestId('lab-line');
    expect(paths).toHaveLength(2);
    const topLabel = screen.getByTestId('lab-y-top');
    expect(topLabel).toHaveTextContent('40.0');
    const ys = [...paths[0].getAttribute('d')!.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[0]).toBe(Number(topLabel.getAttribute('y')));
    expect(ys[59]).toBeGreaterThan(ys[0]);
  });

  it("the crosshair reads out the time and each line's DPS there", () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 640,
      height: 240,
    } as DOMRect);
    const rising = Array.from({ length: 60 }, (_, i) => i + 1);
    render(<LabChart lines={[line('a', rising)]} />);
    expect(screen.getByTestId('lab-readout-time')).toHaveTextContent('DPS over 30 s');
    // 336 px across a 640 px chart is 15 s.
    fireEvent.pointerMove(screen.getByRole('img'), { clientX: 336 });
    expect(screen.getByTestId('lab-readout-time')).toHaveTextContent('DPS at 15 s');
    expect(screen.getByTestId('lab-legend')).toHaveTextContent('30.0');
    expect(screen.getByTestId('lab-crosshair')).toBeInTheDocument();
  });
});
