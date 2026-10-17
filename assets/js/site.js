(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const header = document.querySelector('.header');
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#site-nav');

  function closeMenu(returnFocus = false) {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
    header.classList.remove('menu-open');
    if (returnFocus) menuButton.focus();
  }
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    menuButton.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
    header.classList.toggle('menu-open', !open);
  });
  navigation?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (header && !header.contains(event.target)) closeMenu();
  });
  matchMedia('(min-width: 761px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

  const dialog = document.querySelector('.image-dialog');
  let previousFocus;
  const descriptions = {
    'hybrid-inot.png': 'Original figure from the Hybrid-INoT manuscript. Model-specific pilot measurements; results depend on the tested setting.',
    'polymas-studio.jpg': 'PolyMAS Studio: actual application interface, with a demonstration workspace of three holons and twelve agents.'
  };
  document.querySelectorAll('a[data-lightbox]').forEach(link => {
    link.addEventListener('click', event => {
      if (!dialog || typeof dialog.showModal !== 'function' || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      previousFocus = link;
      const image = dialog.querySelector('img');
      const filename = new URL(link.href, location.href).pathname.split('/').pop();
      image.src = link.href;
      image.alt = link.querySelector('img')?.alt || descriptions[filename] || 'Research illustration';
      dialog.querySelector('#image-dialog-title').textContent = filename === 'polymas-studio.jpg' ? 'PolyMAS Studio' : 'Hybrid-INoT';
      dialog.querySelector('.dialog-caption').textContent = descriptions[filename] || '';
      dialog.showModal();
    });
  });
  dialog?.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog?.addEventListener('close', () => {
    previousFocus?.focus({ preventScroll: true });
  });
})();

