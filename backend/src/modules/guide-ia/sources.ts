// Sources du guide et du quiz « IA responsable ». Toute donnée chiffrée affichée doit renvoyer à l'une d'elles.
export const SOURCES = {
  google2025: {
    titre: 'Google : énergie, carbone et eau d’une requête Gemini (rapport technique, via MIT Technology Review)',
    url: 'https://www.technologyreview.com/2025/08/21/1122288/google-gemini-ai-energy/',
    date: '2025-08',
  },
  epoch2025: {
    titre: 'Epoch AI : How much energy does ChatGPT use?',
    url: 'https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use',
    date: '2025-02',
  },
  mistral2025: {
    titre: 'Mistral AI : analyse de cycle de vie de Mistral Large 2 (avec Carbone 4 et l’ADEME)',
    url: 'https://mistral.ai/fr/news/our-contribution-to-a-global-environmental-standard-for-ai/',
    date: '2025-07',
  },
  aiEnergyScore2025: {
    titre: 'AI Energy Score (Hugging Face, Salesforce) : consommation des modèles à raisonnement (via Fortune)',
    url: 'https://fortune.com/2025/12/05/ai-reasoning-energy-problem-data-centers-30-times-more-power/',
    date: '2025-12',
  },
  stanford2025: {
    titre: 'Stanford et Together AI : Intelligence per Watt, IA locale contre cloud (arXiv 2511.07885)',
    url: 'https://arxiv.org/abs/2511.07885',
    date: '2025-11',
  },
  google2009: {
    titre: 'Google (2009) : énergie d’une recherche, environ 0,3 Wh (via DatacenterDynamics)',
    url: 'https://www.datacenterdynamics.com/en/news/google-reveals-the-data-center-energy-used-for-each-search-2/',
    date: '2009-01',
  },
  ademe2026: {
    titre: 'ADEME : avis « L’intelligence artificielle générative, des impacts environnementaux importants »',
    url: 'https://www.ademe.fr/wp-content/uploads/2026/07/cp-ademe-avis-ia-072026.pdf',
    date: '2026-07',
  },
  afnor2024: {
    titre: 'AFNOR Spec 2314 : référentiel général pour l’IA frugale (ministère de la Transition écologique)',
    url: 'https://www.ecologie.gouv.fr/presse/publication-du-referentiel-general-lia-frugale-sattaquer-limpact-environnemental-lia',
    date: '2024-06',
  },
  comparia: {
    titre: 'compar:IA, le comparateur d’IA conversationnelles de l’État (beta.gouv)',
    url: 'https://comparia.beta.gouv.fr/',
    date: '2026',
  },
} as const;

export type CleSource = keyof typeof SOURCES;
