# Painel Amplimed

Base inicial inspirada no fluxo corporativo do `uni_eventos`: login e senha de rede autenticados pelo AD via ORDS, sessão protegida por cookie e conexão Oracle isolada em pool Thick Mode.

A etapa visual `Saúde Integrada` inclui a Visão Geral em `/dashboard` e as telas funcionais de Clínicas (`/dashboard/clinicas`) e Usuários (`/dashboard/usuarios`), protegidas pela sessão AD. As listas oferecem busca, filtros, ordenação e paginação; os detalhes preservam os vínculos e as 12 colunas de origem. Importações permanece para a etapa seguinte. Enquanto não houver lote importado e tabelas aprovadas, as APIs devolvem estado vazio; a interface não usa números dos mockups.

## Executar

1. Use Node.js 20 ou superior e instale as dependências com `pnpm install`.
2. Mantenha o `.env` local preenchido. Para outro ambiente, copie `.env.example` para `.env` e preencha as variáveis necessárias sem compartilhar credenciais.
3. No Windows, mantenha o Instant Client em `ic/instantclient_23_0` ou ajuste `ORACLE_CLIENT_LIB_DIR` para o caminho absoluto.
4. Execute `pnpm start` e abra `http://127.0.0.1:3000`.

Para desenvolvimento local em HTTP, configure `SESSION_COOKIE_SECURE=FALSE`. Em HTTPS, use `TRUE`.

## Verificação Oracle

Execute `pnpm oracle:check`. O comando inicializa o Instant Client, cria um pool e faz somente `SELECT 1 FROM dual` em uma transação de leitura. A saída confirma conexão e Thick Mode sem exibir host, DSN ou credenciais. Nenhum objeto é criado ou alterado.

## Escopo atual

O login AD usa o contrato ORDS de `uni_eventos`: `usuario`, `senha` em base64 e `Authorization` enviados pelo backend ao endpoint configurado. A senha não é armazenada pelo painel. A sessão fica em memória e expira; ao reiniciar o servidor, usuários entram novamente. A autenticação real de um usuário depende de uma conta AD válida, que não faz parte do `.env`.

Mantenha `.env`, `ic/` e `node_modules/` fora do Git. A credencial Oracle deve ter apenas os privilégios de leitura necessários às consultas futuras.

## Clínicas e usuários

As rotas `/api/clinicas`, `/api/clinicas/detalhe`, `/api/usuarios` e `/api/usuarios/detalhe` exigem sessão AD. A origem dos dados do cadastro ainda será conectada na importação e na etapa Oracle; até lá, as páginas indicam que aguardam o primeiro lote. Não há registros de exemplo em produção.

Cada linha importada representa um vínculo. Clínicas são agrupadas apenas pelo texto normalizado da coluna Clínica (espaços e caixa); possíveis variantes são sinalizadas, sem união automática. As listas mostram CPF mascarado. No detalhe, o CPF e o e-mail completos só aparecem para logins AD configurados em `SAUDE_INTEGRADA_PII_LOGINS` (lista separada por vírgulas no `.env`). Por padrão, nenhum login recebe essa permissão.
