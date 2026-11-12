const $ = id => document.getElementById(id);
const form = $('login-form');
const message = $('login-message');
const password = $('senha');
const submit = $('entrar');

function showUser(user) {
  if (user?.login) location.replace('/dashboard');
}

async function restore() {
  try {
    const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) showUser((await response.json()).user);
  } catch { /* A página de login permanece disponível. */ }
}
restore();

$('toggle-senha').addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  $('toggle-senha').setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  $('toggle-senha').title = visible ? 'Ocultar senha' : 'Mostrar senha';
  $('toggle-senha').setAttribute('aria-pressed', String(visible));
  password.focus();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  message.hidden = true;
  submit.disabled = true;
  $('entrar-texto').textContent = 'Autenticando...';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ usuario: $('usuario').value, senha: password.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Não foi possível entrar.');
    if (!data.user?.login) throw new Error('Resposta de autenticação inválida.');
    password.value = '';
    showUser(data.user);
  } catch (error) {
    message.textContent = error.message || 'Serviço indisponível. Tente novamente.';
    message.hidden = false;
    password.value = '';
    password.focus();
  } finally {
    submit.disabled = false;
    $('entrar-texto').textContent = 'Entrar com AD';
  }
});
