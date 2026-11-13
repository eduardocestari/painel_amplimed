# Plano Oracle para revisão do DBA

**Estado:** proposta, sem execução de DDL, DML ou consultas SQL nesta etapa. A versão 19.27 foi obtida pela propriedade da conexão do driver, sem instrução SQL. A conexão configurada e o esquema configurado usam o mesmo usuário, mas o DBA deve confirmar ownership e privilégios no ambiente de implantação.

## Ordem para aprovação e criação

1. O DBA revisa [estrutura_proposta.sql](estrutura_proposta.sql), tablespace, quotas, nomes, política de backup, auditoria e retenção de dados pessoais. A sintaxe `IDENTITY` é compatível com o Oracle 19.27 identificado; confirmar que o serviço de destino é o mesmo.
2. Após aprovação explícita do usuário, executar o script como proprietário do esquema. Ele cria a tabela de controle, insere sua única linha inicial, cria a tabela de lotes, a tabela `UDBNU_USUARIOS_AMPLIMED`, o índice por clínica e a view corrente. A linha inicial de controle é obrigatória; sem ela a importação deve falhar sem gravar.
3. Executar [consultas_validacao.sql](consultas_validacao.sql). Antes da primeira importação, a view deve estar vazia. Verificar que `NR_ULTIMA_CONCLUSAO = 0` e que não há lote `CONCLUIDO`.
4. Somente após a validação, configurar a leitura Oracle no painel. A gravação de snapshots requer autorização separada e teste de importação em ambiente autorizado. O Excel original nunca deve ser versionado nem salvo em pasta pública.

## Transação de importação

- Conferir cabeçalhos, tipos, tamanho, datas, CPFs e limites das colunas antes de adquirir conexão. Manter uma linha por vínculo; `Usuclin` é apenas texto original.
- Bloquear `UDBNU_AMPLIMED_CONTROLE` com `SELECT ... FOR UPDATE` para serializar importações. Sob esse bloqueio, verificar o SHA-256 em lotes concluídos; exigir confirmação explícita antes de aceitar um arquivo idêntico.
- Inserir lote `PROCESSANDO` e todas as linhas sem autocommit. Conferir `rowsAffected` com a quantidade validada. Atualizar o lote para `CONCLUIDO`, com `NR_CONCLUSAO` seguinte e `DT_CONCLUSAO`, e incrementar o controle. Executar um único `COMMIT`.
- Em erro antes do commit, executar `ROLLBACK`. A view continua apontando para o último lote concluído. Registrar uma entrada `FALHOU` em transação separada, com código de erro genérico e sem conteúdo da planilha. Se a falha ocorrer durante o próprio commit, tratar o resultado como **indeterminado** e conferir o lote no banco antes de repetir; não registrar falha automaticamente.
- Nunca usar `TRUNCATE`, `DELETE` ou atualização de registros antigos para substituir a visão corrente. Lotes anteriores ficam preservados.

## Reversão operacional

Se um lote já concluído precisar ser desfeito, o DBA e o responsável pelo negócio devem identificar o lote anterior válido no histórico e preparar **um novo lote de restauração** com as linhas daquele snapshot. O novo lote recebe outro ID, outro `NR_CONCLUSAO` e a justificativa na trilha operacional. Contar e conferir a view antes e depois. Não alterar `NR_CONCLUSAO` de lotes antigos nem excluir o lote incorreto; isso preserva a auditoria.

Se a criação inicial dos objetos falhar antes de qualquer importação, o DBA pode remover somente os objetos recém-criados após verificar dependências e backups. Não há script automático de `DROP` para evitar remoção acidental de dados.

## Privilégios mínimos

O ideal é separar o proprietário do esquema da conta de execução. A conta de execução precisa de `CREATE SESSION` e, por grants diretos do proprietário, `SELECT, INSERT, UPDATE` em `UDBNU_AMPLIMED_IMPORTACOES`, `SELECT, INSERT` em `UDBNU_USUARIOS_AMPLIMED`, `SELECT, UPDATE` em `UDBNU_AMPLIMED_CONTROLE` e `SELECT` na view corrente. Não conceder `DELETE`, `TRUNCATE`, `CREATE ANY`, DDL ou acesso a tabelas Tasy. Se a mesma conta continuar proprietária e executora, essa separação de privilégios não estará efetiva; o DBA deve avaliar uma conta própria para o painel antes de ativar escrita.

As consultas do BI devem usar a view e a tabela de lotes; detalhes com CPF e e-mail completos continuam restritos pela autorização da aplicação. O driver deve usar o pool existente e transações explícitas, sem autocommit na carga.
