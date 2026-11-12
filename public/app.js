const $ = id => document.getElementById(id);
const loginView = $('login-view');
const homeView = $('home-view');
const form = $('login-form');
const message = $('login-message');
const password = $('senha');
const submit = $('entrar');

function showUser(user) {
  $('nome').textContent = user.nome || user.login;
  $('login').textContent = user.login;
  loginView.hidden = true;
  homeView.hidden = false;
  document.title = 'Saúde Integrada | Acesso confirmado';
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

$('sair').addEventListener('click', async () => {
  const output = $('logout-message');
  output.hidden = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error();
    form.reset();
    homeView.hidden = true;
    loginView.hidden = false;
    document.title = 'Saúde Integrada | Acesso';
    $('usuario').focus();
  } catch {
    output.textContent = 'Não foi possível encerrar a sessão.';
    output.hidden = false;
  }
});
