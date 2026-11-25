import type { manualLabels } from './manual.js';

// One shared dialog per handbook. Without support for native dialogs the figure
// links still open the verified local PNG, including when JavaScript is disabled.
export function inspectorMarkup(l: ReturnType<typeof manualLabels>): string {
  return `<dialog id="figure-inspector" aria-labelledby="inspector-title"><div class="inspector-header"><div><span id="inspector-reference" class="eyebrow"></span><h2 id="inspector-title"></h2></div><div class="inspector-controls"><button type="button" id="inspector-zoom" data-actual="${l.actualSize}" data-fit="${l.fitImage}">${l.actualSize}</button><button type="button" id="inspector-close" autofocus>${l.closeImage}</button></div></div><div class="inspector-canvas" tabindex="0" role="region" aria-label="${l.imageArea}"><img alt=""></div><div class="inspector-details"></div></dialog>`;
}

export const inspectorCss = `
.screen-open{display:block;padding:5px 12px;background:var(--soft);color:var(--accent-ink);font-size:13px;font-weight:600;text-align:end}
#figure-inspector{width:min(1120px,calc(100% - 24px));max-width:none;max-height:calc(100% - 24px);padding:0;background:var(--surface);color:var(--ink);border:1px solid var(--control-line);border-radius:12px;overflow:auto;overscroll-behavior:contain}
#figure-inspector:not([open]){display:none}#figure-inspector::backdrop{background:rgba(0,0,0,.74)}
.inspector-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;padding:12px 16px;border-bottom:1px solid var(--line)}.inspector-header h2{font-size:20px;line-height:1.3;margin:2px 0}.inspector-controls{display:flex;flex-wrap:wrap;gap:8px}
#figure-inspector button{font:inherit;font-size:14px;line-height:1.3;min-height:40px;border:1px solid var(--control-line);border-radius:8px;padding:7px 12px;background:var(--surface);color:var(--ink);cursor:pointer}#figure-inspector button:hover{background:var(--soft)}#figure-inspector :focus-visible{outline:3px solid var(--focus);outline-offset:-3px}
.inspector-canvas{max-height:min(62vh,760px);overflow:auto;background:var(--soft);border-bottom:1px solid var(--line)}.inspector-canvas img{display:block;width:auto;height:auto;max-width:100%;max-height:min(62vh,760px);margin-inline:auto}.inspector-canvas.actual img{max-width:none;max-height:none}
.inspector-details{padding:10px 16px}.inspector-details:empty{display:none}.inspector-details p{margin:0;white-space:pre-line}.inspector-details .legend{margin-top:8px}
@media print{#figure-inspector,#figure-inspector::backdrop,.screen-open{display:none!important}}`;

export const inspectorScript = `
const inspector = document.querySelector('#figure-inspector');
if (typeof inspector.showModal === 'function') {
  const canvas = inspector.querySelector('.inspector-canvas');
  const preview = canvas.querySelector('img');
  const details = inspector.querySelector('.inspector-details');
  const zoom = inspector.querySelector('#inspector-zoom');
  let opener;
  const setActual = actual => {
    canvas.classList.toggle('actual', actual);
    zoom.textContent = actual ? zoom.dataset.fit : zoom.dataset.actual;
    canvas.scrollTo(0, 0);
  };
  document.querySelectorAll('a.screen-image').forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      // Preserve browser commands such as opening the original in another tab.
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const figure = link.closest('figure');
      const caption = figure.querySelector('figcaption');
      const image = link.querySelector('img');
      opener = link;
      inspector.querySelector('#inspector-reference').textContent = caption.querySelector('.eyebrow').textContent;
      inspector.querySelector('#inspector-title').textContent = caption.querySelector('h3').textContent;
      preview.alt = image.alt;
      preview.src = link.href;
      details.replaceChildren(...[...caption.querySelectorAll('p, .legend')].filter(el => !el.hidden && el.textContent.trim()).map(el => el.cloneNode(true)));
      setActual(false);
      inspector.showModal();
      inspector.scrollTop = 0;
      event.preventDefault();
    });
  });
  zoom.addEventListener('click', () => setActual(!canvas.classList.contains('actual')));
  // Some engines focus an overflow region without routing arrow keys into it.
  canvas.addEventListener('keydown', event => {
    if (!canvas.classList.contains('actual') || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const offsets = { ArrowRight: [48, 0], ArrowLeft: [-48, 0], ArrowDown: [0, 48], ArrowUp: [0, -48], PageDown: [0, canvas.clientHeight], PageUp: [0, -canvas.clientHeight] };
    const offset = offsets[event.key];
    if (!offset) return;
    const left = canvas.scrollLeft, top = canvas.scrollTop;
    canvas.scrollBy(...offset);
    if (canvas.scrollLeft !== left || canvas.scrollTop !== top) event.preventDefault();
  });
  inspector.querySelector('#inspector-close').addEventListener('click', () => inspector.close());
  inspector.addEventListener('close', () => {
    preview.removeAttribute('src');
    details.replaceChildren();
    opener?.focus({ preventScroll: true });
  });
}
`;
