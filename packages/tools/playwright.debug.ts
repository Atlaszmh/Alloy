import { chromium } from 'playwright';

async function debugGemBlueprintLayout() {
  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    console.log('🔍 Navigating to localhost:9098...');
    await page.goto('http://localhost:9098');
    await page.waitForTimeout(2000);

    console.log('\n📋 Looking for Gem Blueprint tab...');
    const gemBlueprintTab = await page.getByRole('button', { name: 'Gem Blueprint' });
    const exists = await gemBlueprintTab.isVisible();
    console.log(`   Tab visible: ${exists}`);

    if (exists) {
      console.log('\n✅ Clicking Gem Blueprint tab...');
      await gemBlueprintTab.click();
      await page.waitForTimeout(2000);

      // Take screenshot of full page
      await page.screenshot({ path: 'gem-blueprint-full.png', fullPage: true });
      console.log('📸 Screenshot saved: gem-blueprint-full.png');

      // Check main layout structure
      console.log('\n📐 Checking layout structure...');

      const mainContainer = await page.locator('body > div').first();
      const mainBounds = await mainContainer.boundingBox();
      console.log(`   Main container: ${mainBounds?.width}x${mainBounds?.height} at (${mainBounds?.x},${mainBounds?.y})`);

      // Find the two-pane layout
      const twoPaneLayout = await page.locator('.flex.h-full').first();
      const twoPaneBounds = await twoPaneLayout.boundingBox();
      console.log(`   Two-pane layout: ${twoPaneBounds?.width}x${twoPaneBounds?.height} at (${twoPaneBounds?.x},${twoPaneBounds?.y})`);

      // Check left pane
      const leftPane = await page.locator('.border-r.border-slate-700').first();
      const leftBounds = await leftPane.boundingBox();
      console.log(`   Left pane: ${leftBounds?.width}x${leftBounds?.height} at (${leftBounds?.x},${leftBounds?.y})`);

      // Check right pane
      const rightPane = await page.locator('.bg-slate-800').nth(1);
      const rightBounds = await rightPane.boundingBox();
      console.log(`   Right pane: ${rightBounds?.width}x${rightBounds?.height} at (${rightBounds?.x},${rightBounds?.y})`);

      // Check for SVG
      console.log('\n🎨 Checking SVG render...');
      const svg = await page.locator('svg.radial-tree-svg').first();
      const svgExists = await svg.isVisible();
      console.log(`   SVG visible: ${svgExists}`);

      if (svgExists) {
        const svgBounds = await svg.boundingBox();
        console.log(`   SVG dimensions: ${svgBounds?.width}x${svgBounds?.height}`);

        // Check SVG content
        const circles = await svg.locator('circle').count();
        console.log(`   SVG circles (nodes): ${circles}`);
      }

      // Check workbench
      console.log('\n📝 Checking workbench editor...');
      const workbench = await page.getByText('Workbench Editor').first();
      const workbenchVisible = await workbench.isVisible();
      console.log(`   Workbench visible: ${workbenchVisible}`);

      // Get computed styles
      console.log('\n🔧 Computed styles...');
      const styles = await page.evaluate(() => {
        const pane = document.querySelector('.flex.h-full');
        const computed = window.getComputedStyle(pane!);
        return {
          display: computed.display,
          height: computed.height,
          width: computed.width,
          flexDirection: computed.flexDirection,
        };
      });
      console.log(`   Two-pane display: ${styles.display}`);
      console.log(`   Two-pane height: ${styles.height}`);
      console.log(`   Two-pane width: ${styles.width}`);
      console.log(`   Two-pane flexDirection: ${styles.flexDirection}`);

      // Check for errors in console
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      if (consoleErrors.length > 0) {
        console.log('\n⚠️ Console errors:');
        consoleErrors.forEach(err => console.log(`   ${err}`));
      }
    } else {
      console.log('❌ Gem Blueprint tab not found!');
    }

  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await browser.close();
  }
}

debugGemBlueprintLayout();
