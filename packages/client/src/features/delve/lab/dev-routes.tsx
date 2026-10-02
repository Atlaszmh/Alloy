import { lazy } from 'react';
import { useNavigate } from 'react-router';
import { Button, Glyph } from '@/features/delve/kit';

/**
 * The DPS Lab page, in dev builds only; null otherwise. It is made here at
 * module scope, so a production build drops the page, its chunk and its worker.
 * (`lazy` wants a default export; the pages export by name.)
 */
export const DEV_LAB = import.meta.env.DEV
  ? lazy(() => import('../../../pages/DelveLab').then((m) => ({ default: m.DelveLab })))
  : null;

/** The Training Grounds' way into the DPS Lab: nothing outside dev builds. */
export function LabButton() {
  const navigate = useNavigate();
  if (!DEV_LAB) return null;
  return (
    <Button
      size="sm"
      onClick={() => navigate('/delve/lab')}
      aria-label="DPS Lab"
      testId="training-lab"
    >
      <Glyph id="lab" size={18} /> DPS Lab
    </Button>
  );
}
