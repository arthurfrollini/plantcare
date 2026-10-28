export type PlantSeedText = {
  name: string;
  about: string;
  waterTips: string;
};

export type PlantSeed = {
  slug: string;
  scientificName: string;
  light: 'full_sun' | 'partial_shade' | 'shade';
  difficulty: 'easy' | 'medium' | 'hard';
  frequency: { times: number; per: 'day' | 'week' };
  /** A file in public/plants: a Commons photo (WebP) or the original illustration (SVG). */
  imageFile: string;
  /** Required for a photo; see scripts/catalog-photo-candidates.ts. */
  imageCredit?: { author: string; license: string; source: string };
  en: PlantSeedText;
  'pt-BR': PlantSeedText;
  aliases: string[];
};

export const plantSeeds: PlantSeed[] = [
  {
    slug: 'aningapara',
    scientificName: 'Montrichardia linifera',
    light: 'partial_shade',
    difficulty: 'easy',
    frequency: { times: 2, per: 'week' },
    // Arthur's own photo; Commons has no photo of this species, only a botanical plate.
    imageFile: 'aningapara.webp',
    en: {
      name: 'Aninga',
      about: 'A tropical species that grows fast and is easy to handle.',
      waterTips: 'Keep the soil always moist without soaking it.',
    },
    'pt-BR': {
      name: 'Aningapara',
      about:
        'É uma espécie tropical que tem crescimento rápido e fácil manuseio.',
      waterTips: 'Mantenha a terra sempre úmida sem encharcar.',
    },
    aliases: ['aninga', 'aninga-pará'],
  },
  {
    slug: 'zamioculca',
    scientificName: 'Zamioculcas zamiifolia',
    light: 'shade',
    difficulty: 'easy',
    frequency: { times: 1, per: 'week' },
    imageFile: 'zamioculca.webp',
    imageCredit: {
      author: 'O fungo azul',
      license: 'CC0',
      source:
        'https://commons.wikimedia.org/wiki/File:%22Zamio_Mater%22_Zamioculcas_zamiifolia_communis_plant.jpg',
    },
    en: {
      name: 'ZZ plant',
      about:
        'Even though it flowers in spring, it stays beautiful and green all year round.',
      waterTips:
        'Use pots with drainage holes and stones at the bottom to help the water drain. Let the soil dry between waterings.',
    },
    'pt-BR': {
      name: 'Zamioculca',
      about:
        'Apesar de florescer na primavera, fica o ano todo bonita e verdinha.',
      waterTips:
        'Utilize vasos com furos e pedras no fundo para facilitar a drenagem. Deixe a terra secar entre as regas.',
    },
    aliases: ['zamioculcas', 'zz', 'planta da fortuna'],
  },
  {
    slug: 'peperomia',
    scientificName: 'Peperomia obtusifolia',
    light: 'partial_shade',
    difficulty: 'easy',
    frequency: { times: 3, per: 'week' },
    imageFile: 'peperomia.webp',
    imageCredit: {
      author: 'Obsidian Soul',
      license: 'CC0',
      source:
        'https://commons.wikimedia.org/wiki/File:Peperomia_obtusifolia_1.jpg',
    },
    en: {
      name: 'Baby rubber plant',
      about:
        'It adapts to both sun and shade, but prefers a cool corner without direct sunlight.',
      waterTips: 'On hotter days, mist the leaves with water.',
    },
    'pt-BR': {
      name: 'Peperomia',
      about:
        'Adapta-se tanto ao sol e sombra, mas prefere ficar num cantinho fresco, sem sol direto.',
      waterTips: 'Nos dias mais quentes borrife água nas folhas.',
    },
    aliases: ['peperômia'],
  },
  {
    slug: 'imbe',
    scientificName: 'Thaumatophyllum bipinnatifidum',
    light: 'partial_shade',
    difficulty: 'easy',
    frequency: { times: 2, per: 'week' },
    imageFile: 'imbe.webp',
    imageCredit: {
      author: 'Obsidian Soul',
      license: 'CC0',
      source:
        'https://commons.wikimedia.org/wiki/File:Thaumatophyllum_bipinnatifidum_(Philippines)_01.jpg',
    },
    en: {
      name: 'Lacy tree philodendron',
      about:
        'A medium-sized plant that adapts to many regions and is very easy to grow. It wins over more people every day.',
      waterTips: 'Keep the soil always moist without soaking it.',
    },
    'pt-BR': {
      name: 'Imbé',
      about:
        'De médio porte, adapta-se a diversas regiões, além de ser bem fácil de cultivar. Conquista cada vez mais pessoas.',
      waterTips: 'Mantenha a terra sempre úmida sem encharcar.',
    },
    aliases: ['guaimbê', 'philodendron bipinnatifidum'],
  },
  {
    slug: 'espada-sao-jorge',
    scientificName: 'Dracaena trifasciata',
    light: 'partial_shade',
    difficulty: 'easy',
    frequency: { times: 1, per: 'week' },
    imageFile: 'espada-sao-jorge.webp',
    imageCredit: {
      author: 'Muhammedsafwan77',
      license: 'CC0',
      source:
        'https://commons.wikimedia.org/wiki/File:Dracaena_trifasciata_in_aloysius.jpg',
    },
    en: {
      name: 'Snake plant',
      about:
        'Its aroma is said to reduce anxiety and to help with sleep quality and productivity during the day.',
      waterTips:
        'Water the soil around the plant, and let it dry between waterings.',
    },
    'pt-BR': {
      name: 'Espada São Jorge',
      about:
        'O aroma reduz os níveis de ansiedade e seu cheiro ajuda na qualidade do sono e na produtividade durante o dia.',
      waterTips: 'Regue o solo ao redor e deixe a terra secar entre as regas.',
    },
    aliases: ['espada de são jorge', 'sansevieria', 'língua de sogra'],
  },
  {
    slug: 'yucca',
    scientificName: 'Yucca gigantea',
    light: 'full_sun',
    difficulty: 'easy',
    frequency: { times: 1, per: 'week' },
    imageFile: 'yucca.webp',
    imageCredit: {
      author: 'Dinkum',
      license: 'CC0',
      source:
        'https://commons.wikimedia.org/wiki/File:Yucca_elephantipes_2.JPG',
    },
    en: {
      name: 'Spineless yucca',
      about:
        'Recommended because they are easy to keep and care for. You can put them in small pots, or even in cups.',
      waterTips:
        'Thanks to the water these green plants store, it is always better to water a little.',
    },
    'pt-BR': {
      name: 'Yucca',
      about:
        'São indicadas por serem fáceis de manter e cuidar. Você pode colocar em pequenos vasos, ou até mesmo em xícaras.',
      waterTips:
        'Graças à reserva de água dessas verdinhas, é sempre melhor regar pouco.',
    },
    aliases: ['iúca', 'yuca'],
  },
  {
    slug: 'orquidea',
    scientificName: 'Phalaenopsis',
    light: 'partial_shade',
    difficulty: 'hard',
    frequency: { times: 4, per: 'week' },
    imageFile: 'orquidea.webp',
    imageCredit: {
      author: 'Joejoe at Slovak Wikipedia',
      license: 'Public domain',
      source:
        'https://commons.wikimedia.org/wiki/File:Phalaenopsis_26_01_2006_J_Cservenka.JPG',
    },
    en: {
      name: 'Moth orchid',
      about:
        'Brings a sense of calm and peace to the room. It needs little maintenance and is great for those with little space.',
      waterTips: 'Water moderately and let the excess drain away.',
    },
    'pt-BR': {
      name: 'Orquídea',
      about:
        'Traz sensação de tranquilidade e paz ao ambiente. Requer pouca manutenção e é ótima para quem tem pouco espaço.',
      waterTips: 'Regue moderadamente e deixe o excesso de água escorrer.',
    },
    aliases: ['orquídea borboleta', 'phalaenopsis'],
  },
  {
    slug: 'violeta',
    scientificName: 'Streptocarpus ionanthus',
    light: 'partial_shade',
    difficulty: 'medium',
    frequency: { times: 2, per: 'week' },
    imageFile: 'violeta.webp',
    imageCredit: {
      author: 'Sluglife6826',
      license: 'CC0',
      source:
        'https://commons.wikimedia.org/wiki/File:African_Violet_Blooms.jpg',
    },
    en: {
      name: 'African violet',
      about:
        'It has delicate flowers and is a great suggestion for decorating the bathroom.',
      waterTips: 'Never wet the flowers or leaves. Water only the soil.',
    },
    'pt-BR': {
      name: 'Violeta',
      about:
        'Com flores delicadas, é uma ótima sugestão para decorar o banheiro.',
      waterTips: 'Nada de molhar as flores e folhas. Regue apenas o solo.',
    },
    aliases: ['violeta africana', 'saintpaulia'],
  },
  {
    slug: 'hortensia',
    scientificName: 'Hydrangea macrophylla',
    light: 'full_sun',
    difficulty: 'medium',
    frequency: { times: 1, per: 'day' },
    imageFile: 'hortensia.webp',
    imageCredit: {
      author: 'Bernard Spragg. NZ from Christchurch, New Zealand',
      license: 'CC0',
      source:
        'https://commons.wikimedia.org/wiki/File:Hydrangea_(9559122347).jpg',
    },
    en: {
      name: 'Hydrangea',
      about:
        'The hydrangea is a hardy plant that adapts to different types of soil.',
      waterTips: 'Keep the soil always moist without soaking it.',
    },
    'pt-BR': {
      name: 'Hortênsia',
      about:
        'A hortênsia é uma planta rústica e se adapta a diferentes tipos de solos.',
      waterTips: 'Mantenha a terra sempre úmida sem encharcar.',
    },
    aliases: ['hydrangea'],
  },
];
