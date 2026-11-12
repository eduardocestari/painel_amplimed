# Prompt - Integrar Oracle Database com Instant Client (Thick Mode)

Voce esta trabalhando em um projeto existente que precisa consultar Oracle Database com seguranca e boa performance.

O pacote recebido possui `ic.zip`, com Oracle Instant Client 23 para Windows. O arquivo `.env.example` contem os parametros de rede e schema conhecidos, mas **nao contem usuario ou senha**. O analista responsavel preenchera essas duas variaveis somente no arquivo `.env` local ou no secret manager do ambiente.

## Objetivo

Integrar o acesso Oracle em modo Thick, sem expor credenciais, usando pool de conexoes e uma camada de acesso isolada. A implementacao deve ser compativel com Windows. Se o destino for Linux/Docker, nao reutilize o `ic.zip` deste pacote: use Instant Client Linux compativel com a arquitetura do container.

## Regras obrigatorias

1. Antes de editar, analise a arquitetura e as dependencias atuais do projeto.
2. Nao introduza Node.js se o backend existente ja for Python. Siga a stack ja adotada pelo projeto.
3. Use `python-oracledb` em modo Thick se o backend for Python.
4. Nao codifique usuario, senha, DSN completo, token ou dados sensiveis no codigo, README, logs ou commits.
5. `.env` deve estar no `.gitignore`; apenas `.env.example` pode ser versionado.
6. Valide toda entrada que possa chegar a uma query. Use bind variables para valores. Nunca concatene filtros de usuario em SQL.
7. Para identificadores que nao aceitam bind (por exemplo, schema), aplique allowlist/regex estrita.
8. Crie pool de conexoes uma unica vez na vida da aplicacao. Nao abra uma conexao por request sem pool.
9. Inicialize o Instant Client uma unica vez antes da criacao do pool.
10. Feche cursores/conexoes com context managers e retorne erros genericos ao frontend. O log interno nao pode registrar senha.
11. Nao altere tabelas, DDL ou dados produtivos. Nesta etapa, implemente somente conectividade e leituras necessarias.

## Configuracao solicitada

1. Copie `.env.example` para `.env` no projeto destino.
2. O analista deve preencher apenas:

```env
ORACLE_USER=
ORACLE_PASSWORD=
```

3. Descompacte `ic.zip` na raiz do projeto destino, preservando a estrutura abaixo:

```text
<projeto>/
  ic/
    instantclient_23_0/
      oci.dll
      ...
```

4. Instale as dependencias Python necessarias:

```powershell
python -m pip install oracledb python-dotenv
```

5. Use `ORACLE_CLIENT_LIB_DIR=ic/instantclient_23_0` no Windows. O codigo deve aceitar caminho absoluto tambem.

## Implementacao de referencia para Python

Crie ou adapte uma camada como `app/database.py`. Respeite o padrao de modulos do projeto se ele ja existir.

```python
from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
from typing import Iterator

import oracledb

PROJECT_ROOT = Path(__file__).resolve().parents[1]
_pool: oracledb.ConnectionPool | None = None
_client_initialized = False
_dll_handles: list[object] = []


def get_setting(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


def oracle_dsn() -> str:
    explicit_dsn = get_setting("ORACLE_DSN")
    if explicit_dsn:
        return explicit_dsn

    host = get_setting("ORACLE_HOST")
    port = get_setting("ORACLE_PORT", "1521")
    service = get_setting("ORACLE_SERVICE")
    if not host or not service:
        raise RuntimeError("Configure ORACLE_DSN ou ORACLE_HOST e ORACLE_SERVICE no .env.")
    return f"{host}:{port}/{service}"


def init_oracle_client() -> None:
    global _client_initialized
    if _client_initialized:
        return

    if get_setting("ORACLE_THICK_MODE", "TRUE").upper() not in {"1", "TRUE", "YES", "ON"}:
        _client_initialized = True
        return

    configured_path = get_setting("ORACLE_CLIENT_LIB_DIR", "ic/instantclient_23_0")
    lib_dir = Path(configured_path)
    if not lib_dir.is_absolute():
        lib_dir = PROJECT_ROOT / lib_dir
    lib_dir = lib_dir.resolve()

    expected_library = "oci.dll" if os.name == "nt" else "libclntsh.so"
    if not (lib_dir / expected_library).exists():
        raise RuntimeError(f"Instant Client invalido: {expected_library} nao encontrado em {lib_dir}")

    if os.name == "nt" and hasattr(os, "add_dll_directory"):
        _dll_handles.append(os.add_dll_directory(str(lib_dir)))

    oracledb.init_oracle_client(lib_dir=str(lib_dir))
    _client_initialized = True


def get_oracle_pool() -> oracledb.ConnectionPool:
    global _pool
    if _pool is not None:
        return _pool

    user = get_setting("ORACLE_USER")
    password = get_setting("ORACLE_PASSWORD")
    if not user or not password:
        raise RuntimeError("ORACLE_USER e ORACLE_PASSWORD devem ser configurados no ambiente.")

    init_oracle_client()
    _pool = oracledb.create_pool(
        user=user,
        password=password,
        dsn=oracle_dsn(),
        min=int(get_setting("ORACLE_POOL_MIN", "1")),
        max=int(get_setting("ORACLE_POOL_MAX", "4")),
        increment=int(get_setting("ORACLE_POOL_INCREMENT", "1")),
    )
    return _pool


@contextmanager
def oracle_connection() -> Iterator[oracledb.Connection]:
    pool = get_oracle_pool()
    with pool.acquire() as connection:
        yield connection
```

## Teste de conectividade obrigatorio

Depois de o analista preencher `.env`, implemente ou execute um teste de leitura sem dados sensiveis:

```python
from app.database import oracle_connection

with oracle_connection() as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1 FROM dual")
        assert cursor.fetchone()[0] == 1
```

Caso o projeto use FastAPI, exponha apenas temporariamente em ambiente interno um health check que informe `oracle: ok` ou `oracle: unavailable`; nunca retorne detalhes de host, DSN, usuario ou excecao do banco ao cliente.

## Entrega esperada

Ao concluir, informe:

- arquivos criados/alterados;
- como o `.env` deve ser preenchido sem mostrar a senha;
- como executar o teste de conexao;
- se modo Thick foi confirmado;
- eventuais privilegios Oracle ausentes, citando apenas o objeto/acao negada;
- quais arquivos devem permanecer fora do Git.
