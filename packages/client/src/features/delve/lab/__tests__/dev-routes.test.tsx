import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

/** `DEV_LAB` is made at module scope: import the module afresh under each setting. */
async function devRoutes() {
  vi.resetModules();
  return import('../dev-routes');
}

describe('dev-routes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('in dev: the lab page exists, and the DPS Lab button goes there', async () => {
    const { DEV_LAB, LabButton } = await devRoutes();
    expect(DEV_LAB).not.toBeNull();
    render(
      <MemoryRouter initialEntries={['/delve/training']}>
        <Routes>
          <Route path="/delve/training" element={<LabButton />} />
          <Route path="/delve/lab" element={<div data-testid="lab-page" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('training-lab'));
    expect(screen.getByTestId('lab-page')).toBeInTheDocument();
  });

  it('outside dev: neither the page nor the button', async () => {
    vi.stubEnv('DEV', false);
    const { DEV_LAB, LabButton } = await devRoutes();
    expect(DEV_LAB).toBeNull();
    render(
      <MemoryRouter>
        <LabButton />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('training-lab')).toBeNull();
  });
});
