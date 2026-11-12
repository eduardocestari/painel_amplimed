# Kit Oracle Thick para Windows

Este kit serve para entregar o Oracle Instant Client e uma configuracao segura para outro projeto Python. Ele nao possui usuario, senha ou token.

## Conteudo

| Arquivo | Finalidade |
| --- | --- |
| `ic.zip` | Oracle Instant Client 23 para Windows x64, usado pelo driver em modo Thick. |
| `.env.example` | Parametros de conexao sem credenciais. |
| `PROMPT_PARA_OUTRA_IA.md` | Prompt completo para a outra IA executar a integracao. |
| `requirements-oracle.txt` | Dependencias minimas para Python. |

## Uso rapido

1. Copie esta pasta para o projeto destino.
2. Descompacte `ic.zip` na raiz do projeto. O resultado deve ser `ic/instantclient_23_0/oci.dll`.
3. Copie `.env.example` como `.env` na raiz do projeto destino.
4. O analista preenche `ORACLE_USER` e `ORACLE_PASSWORD` no `.env` local.
5. Garanta que `.env` e `ic/` estejam no `.gitignore` do projeto destino.
6. Entregue o conteudo de `PROMPT_PARA_OUTRA_IA.md` para a outra IA.

## Teste minimo

Com o backend instalado e o `.env` preenchido, a conectividade deve ser validada somente com:

```sql
SELECT 1 FROM dual
```

O teste confirma rede, credenciais, DSN e carregamento do Instant Client sem consultar dados do Tasy.

## Observacoes importantes

- O `ic.zip` deste kit e especifico para Windows. Para Docker/Linux, use Instant Client Linux correspondente ao sistema e arquitetura do container.
- O modo Thick permite recursos completos do Oracle Client. Ele requer `oci.dll` no Windows ou `libclntsh.so` no Linux.
- O usuario Oracle deve ter somente os privilegios necessarios para as consultas da aplicacao.
- Nao coloque senha em arquivos `.py`, `.js`, SQL, Dockerfile, logs ou controle de versao.
