const $ = id => document.getElementById(id);
const loginView = $('login-view');
const homeView = $('home-view');
const form = $('login-form');
const message = $('login-message');
const password = $('senha');
const submit = $('entrar');
$('year').textContent = new Date().getFullYear();

function showUser(user) {
  $('nome').textContent = user.nome || user.login;
  $('login').textContent = user.login;
  loginView.hidden = true;
  homeView.hidden = false;
  document.title = 'Painel Amplimed | Início';
}

async function restore() {
  try {
    const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) showUser((await response.json()).user);
  } catch { /* A página de login continua disponível. */ }
}
restore();

$('toggle-senha').addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  $('toggle-senha').textContent = visible ? 'Ocultar' : 'Mostrar';
  $('toggle-senha').setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  $('toggle-senha').setAttribute('aria-pressed', String(visible));
  password.focus();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.hidden = true;
  submit.disabled = true;
  submit.firstChild.textContent = 'Autenticando ';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
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
  } finally { submit.disabled = false; submit.firstChild.textContent = 'Entrar '; }
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
    document.title = 'Painel Amplimed | Acesso';
    $('usuario').focus();
  } catch {
    output.textContent = 'Não foi possível encerrar a sessão.';
    output.hidden = false;
  }
});
