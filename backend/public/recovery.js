'use strict';
const form = document.getElementById('recovery');
const button = document.getElementById('submit');
const message = document.getElementById('message');
const token = new URLSearchParams(location.hash.slice(1)).get('token');
document.getElementById('toggle-password').addEventListener('click', event => {
  const show = document.getElementById('password').type === 'password';
  for (const id of ['password', 'confirm']) document.getElementById(id).type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? 'Ocultar contraseñas' : 'Mostrar contraseñas';
  event.currentTarget.setAttribute('aria-pressed', String(show));
});
// El fragmento no viaja al servidor; se retira además del historial visible.
if (token) history.replaceState(null, '', location.pathname);
if (token) {
  document.getElementById('title').textContent = 'Nueva contraseña';
  document.getElementById('help').textContent = 'Usa entre 8 y 10 caracteres. Se cerrarán tus sesiones anteriores.';
  document.getElementById('email-fields').hidden = true;
  document.getElementById('email').required = false;
  document.getElementById('password-fields').hidden = false;
  document.getElementById('password').required = true;
  document.getElementById('confirm').required = true;
  button.textContent = 'Guardar contraseña';
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  if (token && password !== document.getElementById('confirm').value) {
    message.textContent = 'Las contraseñas no coinciden.'; return;
  }
  button.disabled = true; message.textContent = 'Procesando…';
  try {
    const response = await fetch(token ? '/api/auth/reset-password' : '/api/auth/forgot-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify(token ? { token, password } : { email: document.getElementById('email').value.trim() }),
    });
    const data = await response.json();
    message.textContent = Array.isArray(data.message) ? data.message.join('\n') : (data.message ?? 'No se pudo completar la solicitud.');
    if (response.ok && token) { form.hidden = true; form.reset(); }
  } catch { message.textContent = 'No se pudo conectar. Inténtalo de nuevo.'; }
  finally { button.disabled = false; }
});
