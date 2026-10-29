/**
 * The free symptom guide shown before any AI check-up. Causes are listed most common first, and
 * the advice sticks to water, light, airflow, pruning, mild soap and repotting.
 *
 * Checked on 2026-10-28 against:
 * - RHS, How to help a poorly houseplant: https://www.rhs.org.uk/plants/types/houseplants/how-to-help-a-poorly-houseplant
 * - RHS, Leaf damage on houseplants: https://www.rhs.org.uk/prevention-protection/leaf-damage-on-houseplants
 * - Penn State Extension, Pest and disease problems of indoor plants: https://extension.psu.edu/pest-and-disease-problems-of-indoor-plants
 * - University of Minnesota Extension, Managing insects on indoor plants: https://extension.umn.edu/product-and-houseplant-pests/insects-indoor-plants
 * - Illinois Extension, Houseplant pests and how to manage them: https://extension.illinois.edu/blogs/good-growing/2022-01-14-houseplant-pests-and-how-manage-them
 */

export type Localized = { en: string; 'pt-BR': string };

export type SymptomId =
  | 'yellow_leaves'
  | 'brown_tips'
  | 'spots'
  | 'holes'
  | 'wilting'
  | 'white_powder'
  | 'leaf_drop'
  | 'leggy'
  | 'tiny_bugs';

export type SymptomCause = {
  id: string;
  title: Localized;
  check: Localized;
  do: Localized;
  /** Show the species' watering or light needs next to this cause. */
  speciesHint?: 'light' | 'water';
};

export type Symptom = {
  id: SymptomId;
  title: Localized;
  causes: SymptomCause[];
};

export const SYMPTOMS: Symptom[] = [
  {
    id: 'yellow_leaves',
    title: { en: 'Yellow leaves', 'pt-BR': 'Folhas amarelas' },
    causes: [
      {
        id: 'too_much_water',
        speciesHint: 'water',
        title: { en: 'Too much water', 'pt-BR': 'Água demais' },
        check: {
          en: 'The soil is still wet days after watering, the pot has no drainage hole, or water sits in the saucer. Lower leaves turn yellow and soft.',
          'pt-BR':
            'A terra continua molhada dias depois da rega, o vaso não tem furo ou sobra água no pratinho. As folhas de baixo ficam amarelas e moles.',
        },
        do: {
          en: 'Water only once the top 5 cm of soil feel dry, empty the saucer after watering and use a pot with a drainage hole.',
          'pt-BR':
            'Regue só quando os 5 cm de cima da terra estiverem secos, esvazie o pratinho depois da rega e use um vaso com furo.',
        },
      },
      {
        id: 'too_little_water',
        speciesHint: 'water',
        title: { en: 'Too little water', 'pt-BR': 'Pouca água' },
        check: {
          en: 'The soil is dry all the way down and pulls away from the pot. Leaves are yellow and crisp, starting with the oldest.',
          'pt-BR':
            'A terra está seca até o fundo e descola do vaso. As folhas ficam amarelas e secas, começando pelas mais velhas.',
        },
        do: {
          en: 'Water slowly until it runs out of the bottom, then keep to a steady schedule.',
          'pt-BR':
            'Regue devagar até a água sair por baixo e depois mantenha uma rotina constante.',
        },
      },
      {
        id: 'too_much_sun',
        speciesHint: 'light',
        title: { en: 'Too much direct sun', 'pt-BR': 'Sol direto demais' },
        check: {
          en: 'Pale or bleached patches on the leaves facing the window, on a plant that prefers shade or partial shade.',
          'pt-BR':
            'Manchas claras ou desbotadas nas folhas viradas para a janela, numa planta que prefere sombra ou meia-sombra.',
        },
        do: {
          en: 'Move it to bright light away from direct midday sun.',
          'pt-BR': 'Leve para um lugar claro, longe do sol direto do meio-dia.',
        },
      },
      {
        id: 'old_leaf',
        title: {
          en: 'An old leaf finishing its life',
          'pt-BR': 'Folha velha no fim da vida',
        },
        check: {
          en: 'Only one or two of the lowest, oldest leaves turn yellow, and new growth looks healthy.',
          'pt-BR':
            'Só uma ou duas folhas, as mais velhas e de baixo, amarelam, e as folhas novas estão saudáveis.',
        },
        do: {
          en: 'Nothing to fix. Cut the leaf off once it is fully yellow; keep leaves that are still mostly green.',
          'pt-BR':
            'Não há o que corrigir. Corte a folha quando estiver toda amarela; mantenha as que ainda estão quase todas verdes.',
        },
      },
      {
        id: 'hungry',
        title: { en: 'A hungry plant', 'pt-BR': 'Planta com fome' },
        check: {
          en: 'New leaves come in pale overall, and the plant has not been fed for months during spring or summer.',
          'pt-BR':
            'As folhas novas nascem pálidas e a planta não recebe adubo há meses na primavera ou no verão.',
        },
        do: {
          en: 'Feed a balanced houseplant fertilizer at half the dose on the label, only in spring and summer.',
          'pt-BR':
            'Use um adubo equilibrado para plantas de interior na metade da dose do rótulo, só na primavera e no verão.',
        },
      },
    ],
  },
  {
    id: 'brown_tips',
    title: { en: 'Brown tips or edges', 'pt-BR': 'Pontas ou bordas marrons' },
    causes: [
      {
        id: 'dry_air',
        title: { en: 'Dry air', 'pt-BR': 'Ar seco' },
        check: {
          en: 'Crisp brown tips, and the plant sits near air conditioning, a heater or a draft.',
          'pt-BR':
            'Pontas marrons e secas, e a planta fica perto do ar-condicionado, de um aquecedor ou de corrente de ar.',
        },
        do: {
          en: 'Move it away from the airflow. Grouping plants together raises the humidity around them.',
          'pt-BR':
            'Afaste a planta do vento. Juntar várias plantas aumenta a umidade em volta delas.',
        },
      },
      {
        id: 'uneven_watering',
        speciesHint: 'water',
        title: { en: 'Uneven watering', 'pt-BR': 'Rega irregular' },
        check: {
          en: 'The soil swings between bone dry and soaked.',
          'pt-BR': 'A terra alterna entre seca demais e encharcada.',
        },
        do: {
          en: 'Water deeply once the top 5 cm are dry, on a steady schedule.',
          'pt-BR':
            'Regue bem quando os 5 cm de cima secarem, numa rotina constante.',
        },
      },
      {
        id: 'tap_water',
        title: {
          en: 'Sensitive to tap water',
          'pt-BR': 'Sensível à água da torneira',
        },
        check: {
          en: 'Brown tips on plants such as dracaenas or spider plants, which react to the fluoride in tap water.',
          'pt-BR':
            'Pontas marrons em plantas como dracenas ou clorofitos, que reagem ao flúor da água da torneira.',
        },
        do: {
          en: 'Water with rainwater or filtered water when you can.',
          'pt-BR': 'Regue com água da chuva ou filtrada sempre que puder.',
        },
      },
      {
        id: 'fertilizer_build_up',
        title: {
          en: 'Fertilizer build-up',
          'pt-BR': 'Excesso de adubo acumulado',
        },
        check: {
          en: 'A white crust on the soil or around the rim of the pot.',
          'pt-BR': 'Uma crosta branca na terra ou na borda do vaso.',
        },
        do: {
          en: 'Run plenty of water through the pot a few times, letting it drain, and fertilize less often.',
          'pt-BR':
            'Passe bastante água pelo vaso algumas vezes, deixando escorrer, e adube com menos frequência.',
        },
      },
    ],
  },
  {
    id: 'spots',
    title: { en: 'Spots on the leaves', 'pt-BR': 'Manchas nas folhas' },
    causes: [
      {
        id: 'sunburn',
        speciesHint: 'light',
        title: { en: 'Sunburn', 'pt-BR': 'Queimadura de sol' },
        check: {
          en: 'Dry, pale or brown patches on the side facing the sun, after a move to a sunnier spot.',
          'pt-BR':
            'Manchas secas, claras ou marrons, no lado virado para o sol, depois de mudar para um lugar mais ensolarado.',
        },
        do: {
          en: 'Move it out of direct midday sun. Burnt patches will not recover, but new leaves will be fine.',
          'pt-BR':
            'Tire do sol direto do meio-dia. As manchas queimadas não voltam, mas as folhas novas virão bem.',
        },
      },
      {
        id: 'leaf_spot',
        title: { en: 'Leaf spot disease', 'pt-BR': 'Doença de mancha foliar' },
        check: {
          en: 'Brown or black spots, often with a yellow ring, that grow or multiply.',
          'pt-BR':
            'Manchas marrons ou pretas, muitas vezes com um anel amarelo, que crescem ou se espalham.',
        },
        do: {
          en: 'Cut off the affected leaves, water the soil and not the leaves, give it more airflow and keep it away from other plants for a while.',
          'pt-BR':
            'Corte as folhas afetadas, regue a terra e não as folhas, deixe o ar circular melhor e afaste a planta das outras por um tempo.',
        },
      },
    ],
  },
  {
    id: 'holes',
    title: { en: 'Holes or chewed leaves', 'pt-BR': 'Furos ou folhas roídas' },
    causes: [
      {
        id: 'natural_shape',
        title: {
          en: 'The leaf is shaped that way',
          'pt-BR': 'É o formato da folha',
        },
        check: {
          en: 'Some species have splits or lobes that are part of the leaf, like the imbé.',
          'pt-BR':
            'Algumas espécies têm recortes ou lobos que fazem parte da folha, como o imbé.',
        },
        do: { en: 'Nothing to do.', 'pt-BR': 'Não precisa fazer nada.' },
      },
      {
        id: 'chewing_pests',
        title: {
          en: 'Caterpillars, snails or beetles',
          'pt-BR': 'Lagartas, lesmas ou besouros',
        },
        check: {
          en: 'Look under the leaves and on the soil, also at night. Slime trails mean snails or slugs. This happens mostly on balconies or near open windows.',
          'pt-BR':
            'Procure embaixo das folhas e na terra, também à noite. Rastros de gosma indicam lesmas ou caracóis. Acontece mais em varandas ou perto de janelas abertas.',
        },
        do: {
          en: 'Remove them by hand and check again over the next few days.',
          'pt-BR': 'Retire com a mão e confira de novo nos próximos dias.',
        },
      },
      {
        id: 'physical_damage',
        title: { en: 'Physical damage', 'pt-BR': 'Dano físico' },
        check: {
          en: 'Clean tears where the plant gets bumped or brushed past.',
          'pt-BR': 'Rasgos limpos onde a planta leva esbarrões.',
        },
        do: {
          en: 'Move it out of the way, and trim the leaf if it bothers you.',
          'pt-BR': 'Tire a planta do caminho e corte a folha se ela incomodar.',
        },
      },
    ],
  },
  {
    id: 'wilting',
    title: { en: 'Wilting or drooping', 'pt-BR': 'Murcha ou caída' },
    causes: [
      {
        id: 'dry_soil',
        speciesHint: 'water',
        title: { en: 'Dry soil', 'pt-BR': 'Terra seca' },
        check: {
          en: 'The soil is dry well below the surface.',
          'pt-BR': 'A terra está seca bem abaixo da superfície.',
        },
        do: {
          en: 'Water slowly until it drains. It should perk up within hours.',
          'pt-BR':
            'Regue devagar até escorrer. Ela deve se recuperar em algumas horas.',
        },
      },
      {
        id: 'root_rot',
        speciesHint: 'water',
        title: { en: 'Rotting roots', 'pt-BR': 'Raízes apodrecendo' },
        check: {
          en: 'It wilts even though the soil is wet. Ease it out of the pot: healthy roots are firm and pale, rotting ones are dark brown, soft and may smell bad.',
          'pt-BR':
            'Ela murcha mesmo com a terra molhada. Tire do vaso com cuidado: raízes saudáveis são firmes e claras; as podres são marrom-escuras, moles e podem ter mau cheiro.',
        },
        do: {
          en: 'Stop watering. If roots are soft, cut them away and repot in fresh, barely moist soil, in a pot with a drainage hole.',
          'pt-BR':
            'Pare de regar. Se as raízes estiverem moles, corte essas partes e replante em terra nova, só levemente úmida, num vaso com furo.',
        },
      },
      {
        id: 'heat_or_change',
        title: {
          en: 'Heat or a sudden change',
          'pt-BR': 'Calor ou mudança brusca',
        },
        check: {
          en: 'It was moved recently or sits in a hot spot.',
          'pt-BR': 'Ela mudou de lugar há pouco ou está num lugar quente.',
        },
        do: {
          en: 'Give it a stable spot away from heat and a few days to adjust.',
          'pt-BR':
            'Deixe num lugar estável, longe do calor, e dê alguns dias para ela se adaptar.',
        },
      },
    ],
  },
  {
    id: 'white_powder',
    title: {
      en: 'White powder, mold or cotton',
      'pt-BR': 'Pó branco, mofo ou algodão',
    },
    causes: [
      {
        id: 'powdery_mildew',
        title: { en: 'Powdery mildew', 'pt-BR': 'Oídio' },
        check: {
          en: 'A white, dusty layer on the leaves that rubs off.',
          'pt-BR':
            'Uma camada branca de pó nas folhas, que sai ao passar o dedo.',
        },
        do: {
          en: 'Remove the worst leaves, give it more airflow and avoid wetting the leaves.',
          'pt-BR':
            'Tire as folhas mais atingidas, deixe o ar circular melhor e evite molhar as folhas.',
        },
      },
      {
        id: 'soil_mold',
        speciesHint: 'water',
        title: { en: 'Mold on the soil', 'pt-BR': 'Mofo na terra' },
        check: {
          en: 'White fuzz on top of the soil.',
          'pt-BR': 'Uma penugem branca em cima da terra.',
        },
        do: {
          en: 'It is mostly harmless and a sign the soil stays wet. Scrape it off and water less often.',
          'pt-BR':
            'Costuma ser inofensivo e é sinal de terra sempre molhada. Raspe e regue com menos frequência.',
        },
      },
      {
        id: 'mealybugs',
        title: { en: 'Mealybugs', 'pt-BR': 'Cochonilhas-farinhentas' },
        check: {
          en: 'Small white cottony clumps in the leaf joints, under the leaves or on the stems, sometimes with sticky leaves.',
          'pt-BR':
            'Pequenos tufos brancos de algodão nas junções das folhas, embaixo delas ou nos caules, às vezes com folhas grudentas.',
        },
        do: {
          en: 'Wipe them off with a cotton swab dipped in water with a few drops of mild liquid soap. Repeat every week until they are gone, and keep the plant apart from the others meanwhile.',
          'pt-BR':
            'Retire com um cotonete molhado em água com algumas gotas de sabão neutro. Repita toda semana até sumirem e deixe a planta longe das outras enquanto isso.',
        },
      },
    ],
  },
  {
    id: 'leaf_drop',
    title: { en: 'Leaves falling off', 'pt-BR': 'Folhas caindo' },
    causes: [
      {
        id: 'recent_change',
        title: { en: 'A recent change', 'pt-BR': 'Uma mudança recente' },
        check: {
          en: 'It was moved, repotted or brought home in the last few weeks.',
          'pt-BR':
            'Ela mudou de lugar, foi replantada ou chegou em casa nas últimas semanas.',
        },
        do: {
          en: 'Keep its spot, light and watering steady. Some leaf drop while it adjusts is normal.',
          'pt-BR':
            'Mantenha o lugar, a luz e a rega constantes. Perder algumas folhas enquanto se adapta é normal.',
        },
      },
      {
        id: 'watering_problems',
        speciesHint: 'water',
        title: {
          en: 'Too much or too little water',
          'pt-BR': 'Água demais ou de menos',
        },
        check: {
          en: 'The soil is soaked or bone dry.',
          'pt-BR': 'A terra está encharcada ou seca demais.',
        },
        do: {
          en: 'See Yellow leaves for how to fix either one.',
          'pt-BR': 'Veja Folhas amarelas para corrigir cada caso.',
        },
      },
      {
        id: 'cold_drafts',
        title: { en: 'Cold drafts', 'pt-BR': 'Vento frio' },
        check: {
          en: 'It sits near a window left open on cold nights or under air conditioning.',
          'pt-BR':
            'Ela fica perto de uma janela aberta em noites frias ou embaixo do ar-condicionado.',
        },
        do: {
          en: 'Move it out of the draft.',
          'pt-BR': 'Tire a planta do vento.',
        },
      },
    ],
  },
  {
    id: 'leggy',
    title: {
      en: 'Long, stretched, pale growth',
      'pt-BR': 'Crescimento esticado e pálido',
    },
    causes: [
      {
        id: 'low_light',
        speciesHint: 'light',
        title: { en: 'Not enough light', 'pt-BR': 'Pouca luz' },
        check: {
          en: 'Long gaps between leaves, the plant leaning toward the window, new leaves smaller and paler.',
          'pt-BR':
            'Espaços longos entre as folhas, a planta inclinada para a janela e folhas novas menores e mais claras.',
        },
        do: {
          en: 'Move it closer to a bright window, with indirect light if it prefers shade or partial shade, and turn the pot a quarter turn each week.',
          'pt-BR':
            'Aproxime de uma janela clara, com luz indireta se ela preferir sombra ou meia-sombra, e gire o vaso um quarto de volta toda semana.',
        },
      },
    ],
  },
  {
    id: 'tiny_bugs',
    title: { en: 'Tiny bugs', 'pt-BR': 'Bichinhos' },
    causes: [
      {
        id: 'fungus_gnats',
        speciesHint: 'water',
        title: { en: 'Fungus gnats', 'pt-BR': 'Mosquitinhos de terra' },
        check: {
          en: 'Tiny dark flies around the soil, worse when the soil stays wet.',
          'pt-BR':
            'Mosquitinhos escuros em volta da terra, piores quando ela fica sempre molhada.',
        },
        do: {
          en: 'Let the top 5 cm of soil dry between waterings. Yellow sticky traps catch the adults, and a layer of sand on the soil helps keep them away.',
          'pt-BR':
            'Deixe os 5 cm de cima da terra secarem entre as regas. Armadilhas adesivas amarelas pegam os adultos, e uma camada de areia sobre a terra ajuda a afastá-los.',
        },
      },
      {
        id: 'aphids',
        title: { en: 'Aphids', 'pt-BR': 'Pulgões' },
        check: {
          en: 'Clusters of small green, black or white insects on new growth, sometimes with sticky leaves.',
          'pt-BR':
            'Grupos de insetos pequenos, verdes, pretos ou brancos, nos brotos novos, às vezes com folhas grudentas.',
        },
        do: {
          en: 'Rinse them off under running water, then wipe with water and a few drops of mild liquid soap.',
          'pt-BR':
            'Tire com água corrente e depois passe um pano com água e algumas gotas de sabão neutro.',
        },
      },
      {
        id: 'spider_mites',
        title: { en: 'Spider mites', 'pt-BR': 'Ácaros' },
        check: {
          en: 'Fine webbing and tiny pale speckles on the leaves, often in dry air.',
          'pt-BR':
            'Teias finas e pontinhos claros nas folhas, muitas vezes com o ar seco.',
        },
        do: {
          en: 'Rinse the leaves top and bottom, wipe them, raise the humidity around the plant and repeat every week.',
          'pt-BR':
            'Lave as folhas por cima e por baixo, limpe com um pano, aumente a umidade em volta da planta e repita toda semana.',
        },
      },
      {
        id: 'scale',
        title: { en: 'Scale insects', 'pt-BR': 'Cochonilhas de carapaça' },
        check: {
          en: 'Small brown bumps stuck to stems and leaves, often with sticky leaves.',
          'pt-BR':
            'Pequenas bolinhas marrons grudadas nos caules e nas folhas, muitas vezes com folhas grudentas.',
        },
        do: {
          en: 'Scrape them off gently and wipe with water and a few drops of mild liquid soap.',
          'pt-BR':
            'Raspe com cuidado e passe um pano com água e algumas gotas de sabão neutro.',
        },
      },
    ],
  },
];
