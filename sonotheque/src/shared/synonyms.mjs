// Petit dictionnaire français → anglais des mots courants du sound design.
// Il sert à deux choses :
//  - traduire une recherche en ligne (« pluie » → « rain ») car les banques de sons sont surtout en anglais ;
//  - retrouver un son local quel que soit la langue de ses mots-clés (« pluie » trouve un son tagué « rain »).
// Les clés sont normalisées (minuscules, sans accents). Le premier mot anglais est celui envoyé aux sources.
// N'hésite pas à compléter la liste : une ligne par mot.

import { normalize, STOPWORDS } from './text.mjs';

export const FR_EN = {
  // Météo / nature
  pluie: ['rain'], orage: ['thunderstorm', 'storm'], tonnerre: ['thunder'], eclair: ['lightning'],
  vent: ['wind'], tempete: ['storm'], neige: ['snow'], grele: ['hail'], brouillard: ['fog'],
  mer: ['sea', 'ocean'], ocean: ['ocean'], vague: ['wave'], vagues: ['waves'], plage: ['beach'],
  riviere: ['river'], ruisseau: ['stream', 'creek'], cascade: ['waterfall'], eau: ['water'],
  goutte: ['drip', 'drop'], gouttes: ['drips', 'drops'], feu: ['fire'], flamme: ['flame'],
  foret: ['forest'], jungle: ['jungle'], desert: ['desert'], montagne: ['mountain'],
  grotte: ['cave'], nuit: ['night'], jour: ['day'], matin: ['morning'], soir: ['evening'],
  campagne: ['countryside'], champ: ['field'], feuilles: ['leaves'], arbre: ['tree'],
  // Animaux
  oiseau: ['bird'], oiseaux: ['birds'], chien: ['dog'], chat: ['cat'], cheval: ['horse'],
  vache: ['cow'], mouton: ['sheep'], cochon: ['pig'], poule: ['chicken'], coq: ['rooster'],
  loup: ['wolf'], lion: ['lion'], insecte: ['insect'], insectes: ['insects'],
  grillon: ['cricket'], grillons: ['crickets'], abeille: ['bee'], mouche: ['fly'],
  moustique: ['mosquito'], grenouille: ['frog'], hibou: ['owl'], chouette: ['owl'],
  corbeau: ['crow'], mouette: ['seagull'], aboiement: ['bark'], miaulement: ['meow'],
  // Ville / transport
  ville: ['city'], rue: ['street'], circulation: ['traffic'], foule: ['crowd'],
  voiture: ['car'], moto: ['motorcycle'], camion: ['truck'], bus: ['bus'], train: ['train'],
  metro: ['subway'], avion: ['airplane', 'plane'], helicoptere: ['helicopter'], bateau: ['boat'],
  klaxon: ['horn', 'car horn'], sirene: ['siren'], ambulance: ['ambulance'], police: ['police'],
  pompiers: ['fire truck'], gare: ['station'], aeroport: ['airport'], chantier: ['construction'],
  velo: ['bicycle', 'bike'], moteur: ['engine'], frein: ['brake'], freinage: ['braking'],
  crissement: ['screech'], pneus: ['tires'],
  // Maison / objets
  porte: ['door'], fenetre: ['window'], cle: ['key'], cles: ['keys'], serrure: ['lock'],
  telephone: ['phone'], sonnerie: ['ringtone', 'ring'], horloge: ['clock'], reveil: ['alarm clock'],
  tictac: ['tick'], cuisine: ['kitchen'], verre: ['glass'], assiette: ['plate'],
  couverts: ['cutlery'], papier: ['paper'], livre: ['book'], page: ['page'], clavier: ['keyboard'],
  souris: ['mouse click'], ordinateur: ['computer'], interrupteur: ['switch'], tiroir: ['drawer'],
  chaise: ['chair'], lit: ['bed'], douche: ['shower'], robinet: ['tap', 'faucet'],
  frigo: ['fridge'], aspirateur: ['vacuum'], cafe: ['coffee'], bouteille: ['bottle'],
  canette: ['can'], sac: ['bag'], fermeture: ['zipper'], eclair_fermeture: ['zipper'],
  ciseaux: ['scissors'], stylo: ['pen'], craie: ['chalk'], bureau: ['office'],
  // Corps / humain
  pas: ['footsteps'], bruit_de_pas: ['footsteps'], bruits_de_pas: ['footsteps'], marche: ['walk', 'footsteps'],
  course: ['run', 'running'], respiration: ['breath', 'breathing'], souffle: ['breath'],
  coeur: ['heartbeat', 'heart'], battement: ['beat'], rire: ['laugh'], rires: ['laughter'],
  pleurs: ['crying'], cri: ['scream'], hurlement: ['scream', 'howl'], voix: ['voice'],
  chuchotement: ['whisper'], toux: ['cough'], eternuement: ['sneeze'], applaudissements: ['applause'],
  bebe: ['baby'], enfant: ['child', 'kid'], enfants: ['children', 'kids'], homme: ['man'],
  femme: ['woman'], public: ['audience'], bisou: ['kiss'], gifle: ['slap'],
  coup: ['hit', 'punch'], coup_de_poing: ['punch'], bagarre: ['fight'], chute: ['fall'],
  manger: ['eating'], boire: ['drinking'], ronflement: ['snore'],
  // Action / cinéma
  explosion: ['explosion'], tir: ['gunshot'], coup_de_feu: ['gunshot'], fusil: ['rifle', 'gun'],
  pistolet: ['pistol', 'gun'], arme: ['weapon', 'gun'], epee: ['sword'], bouclier: ['shield'],
  fleche: ['arrow'], impact: ['impact'], choc: ['impact', 'hit'], fracas: ['crash'],
  crash: ['crash'], verre_brise: ['glass break'], casse: ['break', 'smash'], brise: ['break'],
  debris: ['debris'], whoosh: ['whoosh'], swoosh: ['swoosh'], souffle_air: ['whoosh'],
  transition: ['transition', 'whoosh'], suspense: ['suspense', 'tension'], tension: ['tension'],
  peur: ['horror', 'scary'], horreur: ['horror'], angoisse: ['tension', 'dark'],
  mystere: ['mystery'], magie: ['magic'], magique: ['magic'], sort: ['spell'],
  science_fiction: ['sci-fi'], scifi: ['sci-fi'], futuriste: ['futuristic'], robot: ['robot'],
  laser: ['laser'], vaisseau: ['spaceship'], espace: ['space'], alien: ['alien'],
  zombie: ['zombie'], monstre: ['monster'], fantome: ['ghost'], sonar: ['sonar'],
  alarme: ['alarm'], bip: ['beep'], bips: ['beeps'], notification: ['notification'],
  clic: ['click'], clics: ['clicks'], bouton: ['button'], interface: ['ui', 'interface'],
  pop: ['pop'], bulle: ['bubble'], bulles: ['bubbles'], ding: ['ding'], cloche: ['bell'],
  sonnette: ['doorbell'], gong: ['gong'], piece: ['coin'], pieces: ['coins'], argent: ['money'],
  caisse: ['cash register'], victoire: ['win', 'victory'], defaite: ['lose', 'fail'],
  erreur: ['error'], jeu: ['game'], jeu_video: ['video game'], retro: ['retro'],
  arcade: ['arcade'], dessin_anime: ['cartoon'], cartoon: ['cartoon'], comique: ['funny', 'comedy'],
  drole: ['funny'], rebond: ['bounce'], glissement: ['slide'], froissement: ['rustle'],
  craquement: ['crack'], sifflement: ['whistle'], sifflet: ['whistle'],
  bourdonnement: ['buzz', 'hum'], gresillement: ['crackle'], statique: ['static'],
  radio: ['radio'], television: ['tv'], micro: ['microphone'], larsen: ['feedback'],
  ralenti: ['slow motion'], rembobinage: ['rewind'], scratch: ['scratch'], glitch: ['glitch'],
  // Lieux / ambiances
  ambiance: ['ambience', 'atmosphere'], atmosphere: ['atmosphere'], fond: ['background'],
  restaurant: ['restaurant'], bar: ['bar'], cafe_bar: ['cafe'], marche_public: ['market'],
  supermarche: ['supermarket'], ecole: ['school'], hopital: ['hospital'], eglise: ['church'],
  stade: ['stadium'], concert: ['concert'], fete: ['party'], usine: ['factory'],
  parking: ['parking'], couloir: ['hallway'], salle: ['room'], piece_vide: ['room tone'],
  silence: ['room tone', 'silence'], interieur: ['indoor', 'interior'], exterieur: ['outdoor', 'exterior'],
  village: ['village'], port: ['harbor', 'port'], sous_marin: ['underwater'], sous_l_eau: ['underwater'],
  // Musique
  musique: ['music'], chanson: ['song'], instrumental: ['instrumental'], piano: ['piano'],
  guitare: ['guitar'], batterie: ['drums'], tambour: ['drum'], violon: ['violin'],
  orchestre: ['orchestra'], orchestral: ['orchestral'], cordes: ['strings'], synthe: ['synth'],
  calme: ['calm', 'chill'], douce: ['soft'], doux: ['soft'], triste: ['sad'], joyeux: ['happy'],
  joyeuse: ['happy'], epique: ['epic'], heroique: ['heroic'], energique: ['energetic'],
  dynamique: ['upbeat'], relaxant: ['relaxing'], romantique: ['romantic'], sombre: ['dark'],
  inspirant: ['inspiring'], motivant: ['motivational'], publicite: ['commercial', 'advertising'],
  generique: ['intro', 'outro'], intro: ['intro'], fin: ['ending', 'outro'], boucle: ['loop'],
  rythme: ['beat', 'rhythm'], beat: ['beat'], jazz: ['jazz'], rock: ['rock'], pop_musique: ['pop'],
  electro: ['electronic'], electronique: ['electronic'], hiphop: ['hip hop'], rap: ['hip hop', 'rap'],
  classique: ['classical'], lofi: ['lofi'], cinematique: ['cinematic'], ambient: ['ambient'],
  noel: ['christmas'], ete: ['summer'], hiver: ['winter'],
  // Verbes / actions (toutes les formes courantes)
  grince: ['creak'], grincer: ['creak'], grincante: ['creaky'], grincant: ['creaky'], grincement: ['creak'],
  claque: ['slam'], claquer: ['slam'], claquement: ['slam', 'clap'],
  ouvre: ['open'], ouvrir: ['open'], ouverture: ['opening', 'open'], ouvert: ['open'],
  ferme: ['close'], fermer: ['close'], fermeture_porte: ['door close'],
  tombe: ['fall'], tomber: ['fall'], tombant: ['falling'], casser: ['break'],
  frappe: ['knock', 'hit'], frapper: ['knock', 'hit'], toque: ['knock'], toquer: ['knock'],
  explose: ['explode'], exploser: ['explode'], tire: ['shot', 'gunshot'], tirer: ['shoot'],
  roule: ['roll'], rouler: ['roll'], glisse: ['slide'], glisser: ['slide'], tourne: ['turn'],
  coule: ['pour', 'flow'], verser: ['pour'], bouillir: ['boil'], ebullition: ['boiling'],
  ecrit: ['writing'], ecrire: ['writing'], tape: ['typing', 'tap'], taper: ['typing'],
  souffler: ['blow'], siffle: ['whistle'], siffler: ['whistle'],
  aboie: ['bark'], aboyer: ['bark'], chante: ['sing', 'singing'], chanter: ['singing'],
  passe: ['pass by', 'passing'], passant: ['passing'], demarre: ['start'], demarrage: ['start', 'engine start'],
  accelere: ['accelerate'], acceleration: ['acceleration'], arrive: ['arrival'], depart: ['departure'],
  // Qualificatifs fréquents
  fort: ['loud', 'heavy'], forte: ['heavy', 'loud'], leger: ['light'], legere: ['light'],
  lointain: ['distant'], proche: ['close'], grand: ['big', 'large'], petit: ['small'],
  long: ['long'], court: ['short'], rapide: ['fast'], lent: ['slow'], lourd: ['heavy'],
  metal: ['metal'], metallique: ['metallic'], bois: ['wood', 'wooden'], plastique: ['plastic'],
  pierre: ['stone'], gravier: ['gravel'], sable: ['sand'], herbe: ['grass'], boue: ['mud'],
  beton: ['concrete'], tissu: ['cloth', 'fabric'], cuir: ['leather'],
};

// Mots ignorés dans une recherche en ligne (« bruit de porte » → « door »).
const DROP_ONLINE = new Set(['bruit', 'bruits', 'son', 'sons', 'effet', 'effets', 'sonore', 'sonores']);

// Index inverse anglais → français, construit une fois.
const EN_FR = {};
for (const [fr, ens] of Object.entries(FR_EN)) {
  for (const en of ens) {
    const key = normalize(en);
    (EN_FR[key] ??= []).push(fr.replace(/_/g, ' '));
  }
}

/** Traductions anglaises d'un mot français (normalisé), ou []. */
export function frToEn(word) {
  const w = normalize(word).replace(/\s+/g, '_');
  return FR_EN[w] ?? [];
}

/** Équivalents d'un mot dans l'autre langue (FR↔EN), normalisés, sans le mot lui-même. */
export function equivalents(word) {
  const w = normalize(word);
  const out = new Set();
  for (const en of frToEn(w)) out.add(normalize(en));
  for (const fr of EN_FR[w] ?? []) out.add(normalize(fr));
  out.delete(w);
  return [...out];
}

/**
 * Traduit une requête française en anglais pour les sources en ligne.
 * Essaie d'abord les expressions de deux mots (« coup de feu » → « gunshot »), puis mot à mot.
 * Renvoie { query, translated } ; translated vaut false si rien n'a été traduit.
 */
export function translateQuery(query) {
  const words = normalize(query).split(' ').filter(Boolean);
  const out = [];
  let translated = false;
  for (let i = 0; i < words.length; i++) {
    // Expressions jusqu'à 3 mots : « coup de feu », « verre brise »…
    let matched = false;
    for (let len = 3; len >= 2; len--) {
      if (i + len > words.length) continue;
      const phrase = words.slice(i, i + len).join('_');
      if (FR_EN[phrase]) {
        out.push(FR_EN[phrase][0]);
        i += len - 1;
        matched = translated = true;
        break;
      }
    }
    if (matched) continue;
    if (STOPWORDS.has(words[i])) continue;
    if (DROP_ONLINE.has(words[i])) { translated = true; continue; }
    const en = FR_EN[words[i]];
    if (en) {
      out.push(en[0]);
      if (normalize(en[0]) !== words[i]) translated = true;
    } else {
      out.push(words[i]);
    }
  }
  return { query: out.join(' '), translated };
}
