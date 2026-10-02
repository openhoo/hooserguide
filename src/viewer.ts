/** Offline progressive enhancement. No app/report prose is interpolated into executable code. */
export const viewerScript = `
const toolbar = document.querySelector('.toolbar');
const search = document.querySelector('#guide-search');
const result = document.querySelector('#search-results');
const empty = document.querySelector('#no-results');
const sections = [...document.querySelectorAll('main > section')];
const links = [...document.querySelectorAll('nav li')];
const index = sections.map(section => section.textContent.toLocaleLowerCase());
toolbar.hidden = false;
search.addEventListener('input', () => {
  const terms = search.value.trim().toLocaleLowerCase().split(/\\s+/).filter(Boolean);
  let count = 0;
  sections.forEach((section, i) => {
    const matches = terms.every(term => index[i].includes(term));
    section.hidden = !matches;
    links[i].hidden = !matches;
    if (matches) count++;
  });
  result.textContent = count + ' ' + result.dataset.label;
  empty.hidden = count !== 0;
});
document.querySelector('#annotations').addEventListener('click', event => {
  const button = event.currentTarget;
  const enabled = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(enabled));
  document.querySelectorAll('figure img').forEach(image => { image.src = enabled ? image.dataset.annotated : image.dataset.raw; });
  document.querySelectorAll('.legend').forEach(legend => { legend.hidden = !enabled; });
});
document.querySelector('#print-guide').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await Promise.all([...document.querySelectorAll('figure img')].map(async image => {
      image.loading = 'eager';
      await image.decode().catch(() => {});
    }));
    window.print();
  } finally { button.disabled = false; }
});
`;
