import { describe, it, expect, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog, Footer, Header, Panel, Screen } from '../surfaces';

afterEach(() => document.getElementById('delve-ui-layer')?.remove());

describe('the kit surfaces', () => {
  it('draws a panel as a region named by its title, in its material', () => {
    const { rerender } = render(
      <Panel title="Bag" aside={<span>22 / 40</span>} testId="bag-panel">
        tiles
      </Panel>,
    );
    const panel = screen.getByRole('region', { name: 'Bag' });
    expect(panel).toHaveClass('k-panel', 'k-plate');
    expect(panel).toHaveAttribute('data-testid', 'bag-panel');
    expect(panel).toHaveTextContent('Bag22 / 40tiles');
    expect(panel.lastElementChild).toHaveClass('k-scroll');
    rerender(
      <Panel as="aside" material="glass" accent="#fee761" aria-label="Floor">
        map
      </Panel>,
    );
    const glass = screen.getByRole('complementary', { name: 'Floor' });
    expect(glass).toHaveClass('k-glass');
    expect(glass).toHaveStyle({ borderColor: '#fee761' });
    expect(glass.lastElementChild).not.toHaveClass('k-scroll');
  });

  it('marks a plate, a glass panel, the header and the footer as pad groups, never a well', () => {
    render(
      <>
        <Panel testId="plate">a</Panel>
        <Panel material="glass" testId="glass">
          b
        </Panel>
        <Panel material="well" testId="well">
          c
        </Panel>
        <Header title="The Anvil" />
        <Footer prompts={[]}>
          <button type="button">Delve</button>
        </Footer>
      </>,
    );
    expect(screen.getByTestId('plate')).toHaveAttribute('data-pad-group');
    expect(screen.getByTestId('glass')).toHaveAttribute('data-pad-group');
    expect(screen.getByTestId('well')).not.toHaveAttribute('data-pad-group');
    expect(screen.getByText('The Anvil').closest('[data-pad-group]')).toHaveClass('k-header');
    expect(screen.getByText('Delve').closest('[data-pad-group]')).toHaveClass('k-footer');
  });

  it('makes a zoomed screen with a header band, a main area and a plank footer', () => {
    render(
      <Screen
        backdrop="wall"
        testId="anvil"
        header={
          <Header
            title="The Anvil"
            subtitle="Deepest 7"
            nav={<span>tabs</span>}
            aside={<span>Power</span>}
          />
        }
        footer={
          <Footer prompts={[{ id: 'menu', label: 'Menu', binding: { key: 'Escape' } }]}>
            Delve
          </Footer>
        }
      >
        panes
      </Screen>,
    );
    const root = screen.getByTestId('anvil');
    expect(root).toHaveClass('delve-ui', 'delve-zoom', 'k-wall');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('banner')).toHaveClass('k-band');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The AnvilDeepest 7');
    expect(screen.getByRole('navigation')).toHaveTextContent('tabs');
    expect(screen.getByRole('main')).toHaveTextContent('panes');
    expect(screen.getByRole('contentinfo')).toHaveClass('k-planks');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('EscMenuDelve');
  });

  it('keeps the stop header bare over the arena', () => {
    render(
      <Screen backdrop="arena-stop" headerStyle="bare" header="Depth 3 cleared" footer={null}>
        cards
      </Screen>,
    );
    expect(screen.getByRole('banner')).not.toHaveClass('k-band');
    expect(screen.getByRole('banner').parentElement).toHaveClass('k-screen-arena-stop');
  });

  it('opens a dialog in the zoomed layer, a scope with its Back, and gives the focus back', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Controls
          </button>
          {open && (
            <Dialog title="Controls" onClose={() => setOpen(false)} testId="controls-dialog">
              <button type="button">Rebind</button>
            </Dialog>
          )}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Controls' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Controls' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-testid', 'controls-dialog');
    expect(dialog.closest('#delve-ui-layer')).toHaveClass('delve-ui', 'delve-zoom');
    expect(dialog.parentElement).toHaveAttribute('data-pad-scope');
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveAttribute('data-pad-back');
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('focuses the first [data-pad-first] inside it on open, else its Back', () => {
    const { rerender } = render(
      <Dialog title="Settings" onClose={() => {}}>
        <button type="button">Reset</button>
        <button type="button" data-pad-first>
          UI scale
        </button>
        <button type="button" data-pad-first>
          HUD scale
        </button>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'UI scale' })).toHaveFocus();
    rerender(<></>);
    render(
      <Dialog title="Settings" onClose={() => {}}>
        <button type="button">Reset</button>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
  });

  it('forces a dialog with no onClose: no Back, the focus on initialFocus', () => {
    function Forced() {
      const pick = useRef<HTMLButtonElement>(null);
      return (
        <Dialog title="Choose your mana" initialFocus={pick} footer={<span>footer</span>}>
          <button type="button">Fire</button>
          <button type="button" ref={pick}>
            Frost
          </button>
        </Dialog>
      );
    }
    render(<Forced />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(document.querySelector('[data-pad-back]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Frost' })).toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveTextContent('footer');
  });

  it('keeps Tab and Shift+Tab inside it, wrapping at either end', () => {
    render(
      <>
        <button type="button">Delve</button>
        <Dialog title="Menu" onClose={() => {}}>
          <button type="button">Resume</button>
          <button type="button" tabIndex={-1}>
            Skipped
          </button>
        </Dialog>
      </>,
    );
    const back = screen.getByRole('button', { name: 'Back' });
    const resume = screen.getByRole('button', { name: 'Resume' });
    resume.focus();
    expect(fireEvent.keyDown(resume, { key: 'Tab' })).toBe(false); // prevented
    expect(back).toHaveFocus();
    expect(fireEvent.keyDown(back, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(resume).toHaveFocus();
    back.focus();
    expect(fireEvent.keyDown(back, { key: 'Tab' })).toBe(true); // not at the end: the browser's own
  });
});
