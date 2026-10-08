// Champ « mots-clés » : 1 à 3 pastilles, saisie rapide.
//  - Tape « pluie forte nuit » puis Entrée → 3 pastilles (et valide le formulaire s'il y en a un).
//  - Avec une virgule, les espaces sont gardés : « coup de feu, lointain » → 2 pastilles.
//  - Retour arrière dans un champ vide supprime la dernière pastille.
//  - Les suggestions se cliquent.

import { h, clear } from './dom.mjs';
import { parseKeywordInput, cleanKeywords, MAX_KEYWORDS } from '../../shared/keywords.mjs';

export function keywordInput({ value = [], suggestions = [], placeholder = 'pluie, forte, nuit…', onChange, onSubmit, autofocus = false } = {}) {
  let keywords = cleanKeywords(value);
  const chips = h('div', { class: 'kw-chips' });
  const input = h('input', { class: 'kw-text', type: 'text', placeholder, spellcheck: false, 'aria-label': 'Mots-clés' });
  const box = h('div', { class: 'kw-box', onclick: () => input.focus() }, chips, input);
  const counter = h('span', { class: 'kw-counter' });
  const sugg = h('div', { class: 'kw-suggestions' });
  const root = h('div', { class: 'kw-input' }, box, h('div', { class: 'kw-footer' }, sugg, counter));

  function commitText() {
    const words = parseKeywordInput(input.value);
    if (!words.length) return false;
    keywords = cleanKeywords([...keywords, ...words]);
    input.value = '';
    render();
    return true;
  }

  function render() {
    clear(chips);
    for (const kw of keywords) {
      chips.append(h('span', { class: 'kw-chip' }, kw,
        h('button', {
          class: 'kw-remove', type: 'button', title: 'Retirer', 'aria-label': `Retirer ${kw}`,
          onclick: (e) => {
            e.stopPropagation();
            keywords = keywords.filter((k) => k !== kw);
            render();
            input.focus();
          },
        }, '×')));
    }
    input.placeholder = keywords.length ? (keywords.length < MAX_KEYWORDS ? 'ajouter…' : '') : placeholder;
    input.disabled = keywords.length >= MAX_KEYWORDS;
    counter.textContent = `${keywords.length}/${MAX_KEYWORDS}`;
    clear(sugg);
    const rest = suggestions.filter((s) => !keywords.includes(s));
    if (rest.length && keywords.length < MAX_KEYWORDS) {
      sugg.append(h('span', { class: 'kw-sugg-label' }, 'Suggestions :'));
      for (const s of rest.slice(0, 6)) {
        sugg.append(h('button', {
          class: 'kw-sugg', type: 'button',
          onclick: () => {
            keywords = cleanKeywords([...keywords, s]);
            render();
          },
        }, `+ ${s}`));
      }
    }
    onChange?.(keywords);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Entrée valide le texte tapé ET le formulaire (ajout en un seul geste).
      commitText();
      onSubmit?.(keywords);
    } else if (e.key === ',' || e.key === 'Tab') {
      if (input.value.trim()) {
        e.preventDefault();
        commitText();
      }
    } else if (e.key === 'Backspace' && !input.value && keywords.length) {
      keywords = keywords.slice(0, -1);
      render();
    }
  });
  input.addEventListener('blur', () => commitText());

  render();
  if (autofocus) setTimeout(() => input.focus(), 30);

  return {
    el: root,
    /** Valeur finale (y compris le texte tapé mais pas encore validé). */
    get value() {
      commitText();
      return keywords;
    },
    set value(v) {
      keywords = cleanKeywords(v);
      render();
    },
    focus: () => (input.disabled ? box.focus() : input.focus()),
  };
}
