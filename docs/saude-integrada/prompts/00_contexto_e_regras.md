Você é arquiteto de software e designer UX/UI sênior. Vou iniciar o produto interno **Saúde Integrada**, parceria Unimed Blumenau + Amplimed: clínicas participantes recebem acesso gratuito ao sistema Amplimed. Este repositório já possui uma infraestrutura de autenticação via Active Directory (AD). Não crie outro mecanismo de autenticação.

Anexos obrigatórios: `referencias/01_DASHBOARD_APROVADO.png`, `referencias/02_LOGIN_AD_APROVADO.png`, `referencias/03_LOGO_AMPLIMED_OFICIAL_FORNECIDO.png`. Examine as três imagens. As duas primeiras são referências de layout de alta fidelidade. **A imagem 03 é o logo correto da Amplimed**, que deve substituir qualquer ícone incorreto nos mockups. Não recrie esse logo por CSS ou SVG aproximado; use o ativo fornecido, com proporção e margem preservadas. Use o logo Unimed Blumenau oficial se ele já existir no projeto; se não houver, sinalize o arquivo necessário e use apenas um placeholder textualmente identificado até recebê-lo.

Regras de trabalho: (1) primeiro explore a arquitetura e as rotas existentes, (2) apresente um plano objetivo, (3) implemente em pequenas etapas quando autorizado, (4) não reescreva autenticação, conexões ou convenções existentes, (5) não altere Oracle/DDL sem autorização explícita, (6) não coloque credenciais no código ou mensagens, (7) preserve todos os campos do Excel.

Identidade visual: verde profundo Unimed, branco, cinza claríssimo e acentos roxos sutis oriundos da Amplimed; cards arredondados, sombras discretas, iconografia consistente, espaçamentos generosos, tipografia moderna. Português brasileiro. O design deve seguir as imagens o mais fielmente possível nos aspectos de estrutura, posições, margens, dimensões relativas, cores e estilo. Os números e nomes nelas são exemplificativos, nunca dados de produção.

Menu: Visão Geral, Clínicas, Usuários, Importações; Configurações apenas se existir uma função real.

KPI que **não** deve existir: `Registros com permissão Médico = 410`. Não o exponha como card. Outros indicadores: registros totais, clínicas distintas pelo texto, médicos únicos com CPF válido, última importação real.

Agora **não implemente nada**. Inspecione a base existente e retorne: stack detectada, mecanismo AD existente, estrutura de pastas, componentes reutilizáveis, estratégia de integração Oracle compatível com o projeto, pontos de atenção e plano em etapas. Liste perguntas somente se forem bloqueadoras.
