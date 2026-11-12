Quero iniciar um novo projeto seguindo a base do `uni_eventos`.

Primeiro, examine a stack e as instruções locais. Crie uma página responsiva de login e senha para acesso corporativo pelo AD usando o serviço ORDS configurado no `.env`, sem enviar segredos ao navegador nem armazenar senhas. Implemente sessão segura, logout, tratamento de erros e testes do fluxo com um serviço AD simulado. Não afirme que um usuário real autenticou sem testar com credenciais autorizadas.

Integre o Oracle em uma camada isolada, usando as variáveis do `.env`, pool de conexões e Oracle Instant Client em Thick Mode no Windows. Siga `conexao-oracle/PROMPT_PARA_OUTRA_IA.md` quando esse arquivo existir. Execute apenas `SELECT 1 FROM dual` para confirmar conexão, sem DDL nem alteração de dados. Não exponha usuário, senha, host, DSN ou tokens em código, logs ou resposta. Mantenha `.env`, `ic/` e dependências fora do Git.

Ao concluir, informe quais arquivos foram criados, como executar o projeto e o teste, o resultado real da conexão e do Thick Mode, e qualquer limitação restante. Depois aguarde meus requisitos para as demais telas e funções.
