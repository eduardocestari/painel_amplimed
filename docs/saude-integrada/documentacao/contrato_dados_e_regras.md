# Contrato de dados e regras de negócio

## Fonte única inicial
Excel exportado da Amplimed. Nenhum cruzamento com Tasy/OPS nesta fase. Mantenha arquitetura extensível para integração futura, sem construir integração agora.

## Cabeçalhos, na ordem
1. Nome
2. Email
3. CPF
4. CRM
5. Especialidade
6. Permissão
7. Perfil
8. Situação
9. Data de Criação
10. Clínica
11. Usuclin
12. Último login

## Indicadores
- Registros: linhas persistidas no lote atual, sem eliminar duplicidades.
- Clínicas: contagem de nomes de Clínica distintos depois de trim, colapso de espaços e uppercase.
- Médicos únicos: contagem de CPF validado (11 dígitos + dígitos verificadores) distintos somente nas linhas cuja Permissão seja Médico. CPFs inválidos/ausentes devem aparecer em indicador de qualidade de dados, não contar como médicos distintos.
- Médicos por clínica: mesmo critério, aplicado dentro de cada Clínica normalizada.
- Última importação: data/hora real do lote concluído; não exibir "Atualizado hoje" se não houver lote concluído.
- Situação: utilizar valores originais da coluna `Situação`; **não presumir Ativo/Pendente/Inativo**. Na amostra recebida, a coluna contém `Cooperado` em todos os 436 registros.

## Amostra auditada (12/11/2026)
436 linhas, 118 nomes de clínicas após normalização simples; 119 valores distintos de Usuclin. 410 linhas de Permissão Médico, indicador que o usuário **não deseja como card**. Há CPF malformado/sentinela e data `28`; valores devem ser preservados. O dashboard ilustrativo foi gerado antes desta auditoria e não contém dados confiáveis nas linhas/percentuais dos gráficos.

## Segurança e LGPD
Dados pessoais sensíveis ao contexto corporativo: aplicar autenticação e autorização, mascarar CPF em telas gerais, restringir exportação, auditar ações de importação, proteger planilhas e credenciais. Não versionar dados brutos em GitHub.
