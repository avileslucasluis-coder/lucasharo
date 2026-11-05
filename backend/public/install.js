(() => {
  let pendingPrompt;
  let installed = false;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const button = document.createElement('button');
  button.id = 'install-app-button';
  button.type = 'button';
  button.textContent = 'Instalar app';
  button.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.id = 'install-app-help';
  dialog.setAttribute('aria-labelledby', 'install-app-title');
  const title = document.createElement('h2');
  title.id = 'install-app-title';
  title.textContent = 'Instalar Sistema Tributario';
  const message = document.createElement('p');
  const note = document.createElement('p');
  note.textContent = 'La aplicación necesita conexión a Internet para consultar y guardar tus datos.';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Entendido';
  close.addEventListener('click', () => dialog.close());
  dialog.append(title, message, note, close);
  document.body.append(button, dialog);

  function refresh() {
    button.hidden = installed || standalone.matches || navigator.standalone === true;
    if (button.hidden && dialog.open) dialog.close();
  }
  function help() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    message.textContent = ios
      ? 'En Safari, pulsa Compartir y luego Añadir a pantalla de inicio.'
      : /Android/.test(navigator.userAgent)
        ? 'Si Chrome no abre la instalación, pulsa su menú ⋮ → Añadir a pantalla de inicio → Instalar. Abre esta página directamente en Chrome, fuera del modo incógnito. Si ya está instalada, búscala como Sistema Tributario en tus aplicaciones.'
        : 'Abre el menú de Chrome o Edge y busca Instalar Sistema Tributario. También puedes usar el icono de instalación de la barra de direcciones.';
    if (!dialog.open) dialog.showModal();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = null;
    refresh();
  });
  standalone.addEventListener('change', refresh);
  button.addEventListener('click', async () => {
    if (!pendingPrompt) { help(); return; }
    const prompt = pendingPrompt;
    pendingPrompt = null;
    button.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch { help(); }
    finally { button.disabled = false; refresh(); }
  });
  refresh();
  // No se guardan respuestas privadas ni credenciales en caché.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    const register = () => navigator.serviceWorker.register('/app-worker.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
})();
