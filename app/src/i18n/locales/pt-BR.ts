import type en from './en';

const ptBR: typeof en = {
  welcome: {
    title: 'Cuide das suas\nplantas sem esforço',
    subtitle: 'Nunca mais esqueça de regar suas plantas. A gente te lembra na hora certa.',
  },
  identification: {
    title: 'Como podemos\nte chamar?',
    placeholder: 'Seu nome',
    confirm: 'Confirmar',
    missingName: 'Digite seu nome para continuar.',
    saveError: 'Não foi possível salvar seu nome. Tente de novo.',
    doneTitle: 'Tudo certo',
    doneSubtitle: 'Vamos começar a cuidar das suas plantas.',
    doneButton: 'Começar',
  },
  header: {
    greeting: 'Olá,',
    openProfile: 'Abrir perfil',
  },
  plantSelect: {
    title: 'Em qual cômodo',
    subtitle: 'vai ficar sua planta?',
    allEnvironments: 'Todos',
  },
  plantSave: {
    pickTime: 'Escolha o melhor horário para o lembrete:',
    changeTime: 'Alterar, {{time}}',
    save: 'Cadastrar planta',
    pastTime: 'Escolha um horário no futuro.',
    saveError: 'Não foi possível salvar o lembrete. Tente de novo.',
    doneTitle: 'Pronto',
    doneSubtitle: 'Vamos te lembrar na hora certa.',
    doneButton: 'Ver minhas plantas',
  },
  myPlants: {
    nextWatering: 'Não esqueça de regar a {{name}} {{time}}.',
    empty: 'Você ainda não cadastrou nenhuma planta.',
    upcoming: 'Próximas regas',
    waterAt: 'Regar às',
    removeTitle: 'Remover {{name}}?',
    remove: 'Remover',
    cancel: 'Cancelar',
    removeError: 'Não foi possível remover a planta. Tente de novo.',
  },
  tabs: {
    newPlant: 'Nova planta',
    myPlants: 'Minhas plantas',
  },
  notification: {
    title: '🌱 Hora de regar',
    body: 'Sua {{name}} está com sede.',
  },
  profile: {
    title: 'Perfil',
    back: 'Voltar',
    language: 'Idioma',
  },
  languages: {
    en: 'English',
    'pt-BR': 'Português (Brasil)',
  },
};

export default ptBR;
