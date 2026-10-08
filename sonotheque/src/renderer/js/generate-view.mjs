// Vue « Générer » : fabriquer ses propres sons avec du code (des « recettes »), les régler,
// les écouter, puis les ranger dans la bibliothèque. Les sons générés sont libres de droits.
//
// Pour créer de nouvelles recettes avec une IA (Claude, ChatGPT…) : bouton « Consigne pour
// Claude / ChatGPT », qui copie un mode d'emploi à coller dans la conversation.

import { h, clear, debounce, formatDurationShort } from './dom.mjs';
import { icon } from './icons.mjs';
import { drawPeaks } from './waveform.mjs';
import { keywordInput } from './keyword-input.mjs';
import { openModal } from './modal.mjs';
import { toast } from './toast.mjs';
import { categoryLabel } from './badges.mjs';
import { MEDIA_KINDS } from '../../shared/media-kinds.mjs';

const sono = window.sono;
const CATEGORIES = MEDIA_KINDS.audio.categories;

function formatValue(def, v) {
  if (def.type === 'choice') return def.options.find((o) => o.value === v)?.label ?? v;
  const decimals = def.step >= 1 ? 0 : def.step >= 0.1 ? 1 : 2;
  return `${Number(v).toFixed(decimals).replace('.', ',')}${def.unit ? ` ${def.unit}` : ''}`;
}

export class GenerateView {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.player = ctx.player;
    this.recipes = [];
    this.currentKey = null;
    this.values = {};
    this.seed = 1;
    this.lastRender = null;
    this.renderToken = 0;
    this.blobUrl = null;
    this.autoListen = true;
    this.loaded = false;

    root.classList.add('view-gen');
    this.list = h('div', { class: 'gen-list' });
    this.main = h('div', { class: 'gen-main' });
    root.append(h('div', { class: 'gen' },
      h('aside', { class: 'gen-side' },
        h('div', { class: 'gen-side-head' },
          h('h2', {}, 'Recettes de sons'),
          h('span', { class: 'muted' }, 'Des sons fabriqués par le code : gratuits et libres de droits.')),
        this.list,
        h('div', { class: 'gen-side-foot' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => this.aiPromptDialog() }, icon('copy', { size: 14 }), 'Consigne pour Claude / ChatGPT'),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => this.pasteRecipeDialog() }, icon('plus', { size: 14 }), 'Coller une recette'),
          h('div', { class: 'row-inline' },
            h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => sono.gen.openRecipes() }, icon('folder', { size: 14 }), 'Mes recettes'),
            h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => this.load(true) }, icon('refresh', { size: 14 }), 'Recharger')))),
      this.main));

    this.scheduleRender = debounce(() => this.renderSound({ listen: this.autoListen }), 220);
    this.player.on('state', () => this.drawStage());
  }

  /** Appelé quand l'onglet s'affiche. */
  activate() {
    if (!this.loaded) this.load();
  }

  focusSearch() {}

  current() {
    return null;
  }

  async load(force = false) {
    this.loaded = true;
    clear(this.list).append(h('div', { class: 'loading', style: { padding: '16px' } }, h('span', { class: 'spinner' }), 'Chargement…'));
    const res = await sono.gen.recipes();
    if (res.error) {
      clear(this.list).append(h('p', { class: 'warn', style: { padding: '16px' } }, res.error));
      return;
    }
    this.recipes = res.recipes;
    if (!this.currentKey || !this.recipes.some((r) => r.key === this.currentKey && r.meta)) {
      this.currentKey = this.recipes.find((r) => r.meta)?.key ?? null;
      this.resetValues();
    }
    this.renderList();
    this.renderMain();
    if (force) toast('Recettes rechargées.', 'ok');
    if (this.currentKey) this.renderSound({ listen: false });
  }

  get recipe() {
    return this.recipes.find((r) => r.key === this.currentKey) ?? null;
  }

  resetValues() {
    const meta = this.recipe?.meta;
    this.values = {};
    this.seed = 1;
    if (meta) for (const [k, d] of Object.entries(meta.params)) this.values[k] = d.default;
  }

  select(key) {
    if (key === this.currentKey) return;
    this.currentKey = key;
    this.resetValues();
    this.lastRender = null;
    this.renderList();
    this.renderMain();
    this.renderSound({ listen: this.autoListen });
  }

  renderList() {
    clear(this.list);
    const groups = [
      ['Intégrées', this.recipes.filter((r) => r.builtIn)],
      ['Mes recettes', this.recipes.filter((r) => !r.builtIn)],
    ];
    for (const [title, items] of groups) {
      this.list.append(h('div', { class: 'gen-group' }, title));
      if (!items.length) {
        this.list.append(h('div', { class: 'muted', style: { padding: '0 10px 8px' } }, 'Aucune pour l\'instant : utilise « Consigne pour Claude / ChatGPT » ci-dessous.'));
        continue;
      }
      for (const r of items) {
        if (!r.meta) {
          this.list.append(h('div', { class: 'gen-item gen-item-error', title: r.error },
            h('span', { class: 'gen-item-name' }, h('span', { class: 'dot dot-autre' }), r.file),
            h('span', { class: 'gen-item-desc' }, `Recette invalide : ${r.error}`)));
          continue;
        }
        this.list.append(h('button', {
          class: ['gen-item', r.key === this.currentKey && 'active'], type: 'button',
          onclick: () => this.select(r.key),
        },
        h('span', { class: 'gen-item-name' }, h('span', { class: ['dot', `dot-${r.meta.category}`] }), r.meta.name),
        h('span', { class: 'gen-item-desc' }, r.meta.description)));
      }
    }
  }

  renderMain() {
    clear(this.main);
    const r = this.recipe;
    if (!r?.meta) {
      this.main.append(h('div', { class: 'gen-help' }, h('h3', {}, 'Aucune recette disponible'), h('p', {}, 'Recharge la liste ou ajoute une recette.')));
      return;
    }
    const meta = r.meta;

    const params = h('div', { class: 'gen-params' });
    for (const [k, def] of Object.entries(meta.params)) {
      if (def.type === 'range') {
        const value = h('span', { class: 'param-value' }, formatValue(def, this.values[k]));
        const input = h('input', {
          type: 'range', min: String(def.min), max: String(def.max), step: String(def.step), value: String(this.values[k]),
          'aria-label': def.label,
          oninput: () => {
            this.values[k] = Number(input.value);
            value.textContent = formatValue(def, this.values[k]);
            this.scheduleRender();
          },
        });
        params.append(h('div', { class: 'param' }, h('div', { class: 'param-head' }, h('span', { class: 'param-label' }, def.label), value), input));
      } else {
        const seg = h('div', { class: 'seg' });
        const renderSeg = () => {
          clear(seg);
          for (const o of def.options) {
            seg.append(h('button', {
              type: 'button', class: ['chip', this.values[k] === o.value && 'chip-on'],
              onclick: () => { this.values[k] = o.value; renderSeg(); this.scheduleRender(); },
            }, o.label));
          }
        };
        renderSeg();
        params.append(h('div', { class: 'param' }, h('div', { class: 'param-head' }, h('span', { class: 'param-label' }, def.label)), seg));
      }
    }

    this.waveCanvas = h('canvas', { class: 'gen-wave', title: 'Clique pour écouter', onclick: () => this.listen() });
    this.status = h('span', { class: 'gen-status' });
    this.addBtn = h('button', {
      class: 'btn btn-primary', type: 'button', title: 'Maj + clic : ajout direct avec les mots-clés proposés',
      onclick: (e) => this.save({ quick: e.shiftKey }),
    }, icon('download', { size: 16 }), 'Ajouter à ma bibliothèque');
    const auto = h('input', { type: 'checkbox', checked: this.autoListen, onchange: () => { this.autoListen = auto.checked; } });

    this.main.append(
      h('div', { class: 'gen-title' },
        h('h2', {}, meta.name),
        h('p', {}, meta.description),
        h('div', { class: 'row-meta' }, h('span', { class: 'cat' }, h('span', { class: ['dot', `dot-${meta.category}`] }), categoryLabel(meta.category)),
          meta.keywords.map((k) => h('span', { class: 'kw' }, k)),
          r.builtIn ? null : h('span', {}, `· ${r.file}`))),
      Object.keys(meta.params).length ? params : null,
      h('div', { class: 'gen-stage' },
        this.waveCanvas,
        h('div', { class: 'gen-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => this.listen() }, icon('play', { size: 14 }), 'Écouter'),
          h('button', { class: 'btn', type: 'button', title: 'Même réglages, autre tirage aléatoire', onclick: () => this.newVariant() }, icon('dice', { size: 16 }), 'Autre variante'),
          this.status,
          h('span', { class: 'spacer' }),
          h('label', { class: 'check' }, auto, 'Écouter à chaque réglage'),
          this.addBtn)),
      h('div', { class: 'gen-help' },
        h('h3', {}, 'Créer tes propres sons avec Claude ou ChatGPT'),
        h('ol', { class: 'steps' },
          h('li', {}, 'Clique ', h('b', {}, '« Consigne pour Claude / ChatGPT »'), ' : un mode d\'emploi est copié.'),
          h('li', {}, 'Colle-le dans Claude (claude.ai ou Claude Code) ou ChatGPT, et décris ton son à la place des crochets.'),
          h('li', {}, 'Copie le code qu\'il te répond, puis clique ', h('b', {}, '« Coller une recette »'), ' : tu l\'écoutes et tu l\'enregistres.')),
        h('p', { class: 'muted' }, 'Tes recettes sont rangées dans le dossier « Recettes » de ta bibliothèque. Elles tournent dans un espace isolé, sans accès à tes fichiers ni à internet.')),
    );
    this.drawStage();
  }

  drawStage() {
    if (!this.waveCanvas?.isConnected) return;
    const key = this.lastRender ? `gen:${this.lastRender.renderId}` : null;
    const playing = key && this.player.currentKey === key;
    const audio = this.player.audio;
    const progress = playing && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
    const styles = getComputedStyle(document.documentElement);
    drawPeaks(this.waveCanvas, this.lastRender?.peaks ?? null, {
      progress,
      color: styles.getPropertyValue('--wave-row').trim(),
      playedColor: styles.getPropertyValue('--accent').trim(),
    });
    if (playing && this.player.playing) requestAnimationFrame(() => this.drawStage());
  }

  newVariant() {
    this.seed = 1 + Math.floor(Math.random() * 9999);
    this.renderSound({ listen: true });
  }

  async renderSound({ listen = false } = {}) {
    const key = this.currentKey;
    if (!key) return;
    const token = ++this.renderToken;
    if (this.status) {
      this.status.className = 'gen-status';
      this.status.textContent = 'Fabrication…';
    }
    const res = await sono.gen.render({ key, values: this.values, seed: this.seed });
    if (token !== this.renderToken) return; // un réglage plus récent est en cours
    if (res.error) {
      this.lastRender = null;
      if (this.status) {
        this.status.className = 'gen-status warn-red';
        this.status.textContent = res.error;
      }
      this.drawStage();
      return;
    }
    this.lastRender = res;
    this.status.textContent = `Variante n° ${this.seed} · ${formatDurationShort(res.duration)}`;
    this.drawStage();
    if (listen) this.listen();
  }

  listen() {
    const r = this.lastRender;
    if (!r) return;
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = URL.createObjectURL(new Blob([r.wav], { type: 'audio/wav' }));
    this.player.play({
      key: `gen:${r.renderId}`,
      url: this.blobUrl,
      title: r.meta.name,
      subtitle: `Aperçu généré · variante n° ${this.seed}`,
      peaks: r.peaks,
      duration: r.duration,
      actions: [h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: (e) => this.save({ quick: e.shiftKey }) }, icon('download', { size: 14 }), 'Ajouter')],
    });
    this.drawStage();
  }

  save({ quick = false } = {}) {
    const r = this.lastRender;
    if (!r) return;
    const defaults = { name: r.meta.name, keywords: r.meta.keywords.slice(0, 3), category: r.meta.category };
    const doSave = async (choice) => {
      const res = await sono.gen.save({ renderId: r.renderId, ...choice });
      if (res.error) toast(`Échec : ${res.error}`, 'error', 6000);
      else toast(`Ajouté à ta bibliothèque : « ${res.item.name} » (${res.item.keywords.join(', ')})`, 'ok');
    };
    if (quick) {
      doSave(defaults);
      return;
    }
    let modal;
    const name = h('input', { class: 'input', type: 'text', value: defaults.name, 'aria-label': 'Nom' });
    let category = defaults.category;
    const seg = h('div', { class: 'seg' });
    const renderSeg = () => {
      clear(seg);
      for (const [id, c] of Object.entries(CATEGORIES)) {
        seg.append(h('button', { type: 'button', class: ['chip', id === category && 'chip-on'], onclick: () => { category = id; renderSeg(); } },
          h('span', { class: ['dot', `dot-${id}`] }), c.label));
      }
    };
    renderSeg();
    const kw = keywordInput({ value: defaults.keywords, autofocus: true, onSubmit: () => modal?.submit() });
    modal = openModal({
      title: 'Ajouter le son généré',
      body: [
        h('div', { class: 'license-box' }, h('span', { class: 'badge lic-green' }, 'Créé par toi'),
          h('span', {}, 'Son fabriqué par ta Sonothèque : utilisable partout, même en vidéo monétisée, sans créditer.')),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Mots-clés (1 à 3)'), kw.el),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Catégorie'), seg),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nom'), name),
      ],
      actions: [
        { label: 'Annuler' },
        {
          label: 'Ajouter',
          primary: true,
          onClick: () => {
            const keywords = kw.value;
            if (!keywords.length) {
              toast('Ajoute au moins un mot-clé.', 'error');
              return false;
            }
            doSave({ name: name.value.trim() || defaults.name, keywords, category });
            return true;
          },
        },
      ],
    });
  }

  // --- Recettes faites avec une IA ----------------------------------------------

  async aiPromptDialog() {
    const prompt = await sono.gen.prompt();
    openModal({
      title: 'Créer une recette avec Claude ou ChatGPT',
      body: [
        h('ol', { class: 'steps' },
          h('li', {}, h('b', {}, 'Copie la consigne'), ' avec le bouton ci-dessous.'),
          h('li', {}, 'Ouvre ', h('b', {}, 'Claude'), ' (claude.ai ou Claude Code) ou ', h('b', {}, 'ChatGPT'), ', colle la consigne et remplace « [décris ici ton son] » par ce que tu veux, par exemple « un vaisseau spatial qui passe au loin ».'),
          h('li', {}, 'Copie le code de la réponse, reviens ici et clique ', h('b', {}, '« Coller une recette »'), '.'),
          h('li', {}, 'Le son ne te plaît pas ? Demande à l\'IA de le corriger (« plus grave », « plus long »…) et recolle le code.')),
        h('p', { class: 'muted' }, "Tu utilises ton abonnement habituel, dans ta conversation : la Sonothèque n'a pas besoin de se connecter à ton compte."),
      ],
      actions: [
        { label: 'Fermer' },
        {
          label: 'Copier la consigne',
          primary: true,
          onClick: () => {
            sono.copy(prompt);
            toast('Consigne copiée : colle-la dans Claude ou ChatGPT.', 'ok', 5000);
            return true;
          },
        },
      ],
    });
  }

  pasteRecipeDialog() {
    const code = h('textarea', { class: 'input textarea code', spellcheck: false, placeholder: 'recipe({\n  name: …,\n  render({ … }) { … },\n});' });
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Nom du fichier (facultatif)' });
    const result = h('div', { class: 'gen-status' }, 'Colle le code donné par Claude ou ChatGPT, puis « Tester ».');
    let tested = null;

    // L'IA entoure souvent le code de ```javascript … ``` : on l'enlève.
    const cleanCode = () => code.value.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    const test = async () => {
      result.className = 'gen-status';
      result.textContent = 'Test en cours…';
      const res = await sono.gen.test(cleanCode());
      if (res.error) {
        tested = null;
        result.className = 'gen-status warn-red';
        result.textContent = `Erreur : ${res.error}. Recopie ce message à l'IA pour qu'elle corrige.`;
        return false;
      }
      tested = res;
      result.className = 'gen-status ok-text';
      result.textContent = `« ${res.meta.name} » fonctionne (${formatDurationShort(res.duration)}). Tu peux l'enregistrer.`;
      if (!name.value.trim()) name.value = res.meta.name;
      if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = URL.createObjectURL(new Blob([res.wav], { type: 'audio/wav' }));
      this.player.play({ key: `gen:${res.renderId}`, url: this.blobUrl, title: res.meta.name, subtitle: 'Test de recette', peaks: res.peaks, duration: res.duration });
      return true;
    };

    openModal({
      title: 'Coller une recette',
      size: 'wide',
      body: [h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Code de la recette'), code), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nom'), name), result],
      actions: [
        { label: 'Annuler' },
        { label: 'Tester', onClick: async () => { await test(); return false; } },
        {
          label: 'Enregistrer',
          primary: true,
          onClick: async () => {
            if (!tested && !(await test())) return false;
            const res = await sono.gen.saveRecipe({ name: name.value.trim() || tested.meta.name, code: cleanCode() });
            if (res.error) {
              result.className = 'gen-status warn-red';
              result.textContent = res.error;
              return false;
            }
            toast('Recette enregistrée dans « Mes recettes ».', 'ok');
            await this.load();
            this.select(res.key);
            return true;
          },
        },
      ],
    });
  }
}
