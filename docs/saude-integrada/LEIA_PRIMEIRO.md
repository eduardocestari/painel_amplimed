# Saúde Integrada | Kit para iniciar no Codex

**Objetivo:** sistema interno para acompanhar as clínicas e profissionais vinculados ao programa em que a Unimed Blumenau disponibiliza o Amplimed gratuitamente às clínicas participantes.

## Ordem de execução
1. Abra seu repositório existente no Codex, em uma branch nova.
2. Copie a pasta `referencias/` e os documentos deste kit para o repositório (por exemplo, `docs/saude-integrada/`). Não publique o Excel com CPFs e e-mails no Git.
3. Envie primeiro **`prompts/00_contexto_e_regras.md`** para o Codex, com os três arquivos de imagem anexados. Peça apenas análise e plano.
4. Execute **`01_login_AD.md`**, **`02_layout_dashboard.md`**, **`03_clinicas_usuarios.md`**, **`04_importacao_excel.md`**, **`05_oracle.md`**, **`06_validacao_e_acabamento.md`**, um de cada vez. Revise o resultado antes de avançar.
5. Anexe `Reseller Amplimed.xlsx` ao Codex apenas quando chegar à importação, em um ambiente autorizado. Trata-se de dados pessoais. Preferencialmente use uma versão anonimizada de teste.
6. O arquivo `oracle/estrutura_proposta.sql` é **rascunho**, não execução automática. Exija revisão de DBA e aprovação explícita antes de rodar SQL em qualquer banco.

## REFERÊNCIAS APROVADAS (OBRIGATÓRIAS)
**Use SOMENTE as imagens reais desta pasta para reconstruir a identidade visual. NÃO substituir por imagens genéricas, mockups externos, templates SaaS ou imagens de busca.** Estas são cópias byte a byte dos dois mockups apresentados e aprovados na conversa. A terceira imagem é o logo correto enviado pelo usuário. O logo do Amplimed que aparece desenhado nos mockups está INCORRETO: substituí-lo pela terceira imagem.

## Referências visuais
- `referencias/01_DASHBOARD_APROVADO.png`: inspiração visual do painel.
- `referencias/02_LOGIN_AD_APROVADO.png`: inspiração visual da tela inicial com AD.
- `referencias/03_LOGO_AMPLIMED_OFICIAL_FORNECIDO.png`: fonte verdadeira da marca Amplimed, **substituindo o logo ilustrativo incorreto dos mockups**.
- Marca Unimed: solicitar o arquivo institucional oficial ao design/comunicação para fidelidade máxima. O logo inserido nas imagens é uma representação ilustrativa, não um arquivo de marca validado.

## Atenção aos números
Os mockups são **referências de layout** e contêm textos e números ilustrativos. Não crie registros fictícios na aplicação. No Excel auditado há 436 linhas de dados e 118 nomes de clínicas após normalização simples. O número de 352 médicos únicos no mockup **não foi validado e não deve ser fixado**. Existem CPFs inválidos ou preenchimentos especiais no arquivo; a UI deve distinguir `registros`, `pessoas com CPF válido` e `médicos únicos com CPF válido`.

## Importação segura
O Excel precisa ser tratado como entrada externa e os CPFs/e-mails como dados pessoais: não registrar esses valores em logs, não versionar, não expor indiscriminadamente nas telas ou exports. Importar como fotografia completa com lote atômico e histórico. Não apagar dados atuais se ocorrer erro.

## Definição de pronto
Login usa o AD existente, todas as telas protegidas por autorização, dados exibidos vêm do backend/Oracle, gráficos refletem consultas reais, importação validada e rastreável, layout responsivo muito próximo dos mockups (sem tentar reproduzir números ilustrativos).
