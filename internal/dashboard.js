// Fonte provisória da etapa visual. As consultas reais entram após a estrutura Oracle ser aprovada.
export function getDashboardOverview() {
  return {
    status: 'awaiting_import',
    asOf: null,
    kpis: {
      registros: null,
      clinicas: null,
      medicosUnicos: null,
      ultimaImportacao: null,
    },
    charts: {
      medicosPorClinica: [],
      especialidades: [],
      situacoes: [],
    },
    preview: { total: null, rows: [] },
  };
}
