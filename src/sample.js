/**
 * Ready-made boards: the sample board for a first visit and the deterministic "?demo" board.
 * Both are built through the reducer, so they are always valid. Texts exist in English and Turkish.
 */

import { addDays, toDateKey } from './dates.js';
import { createBoard } from './model.js';
import { reduce } from './reducer.js';

/**
 * @typedef {import('./model.js').Board} Board
 * @typedef {{ en: string, tr: string }} Text
 * @typedef {{
 *   title: Text, description?: Text, labels?: string[], due?: number, checklist?: Array<[Text, boolean]>
 * }} CardSpec  `due` is a number of days from today
 * @typedef {{ title: Text, wipLimit?: number, cards: CardSpec[], archived?: CardSpec[] }} ColumnSpec
 */

const tx = (en, tr) => ({ en, tr });

/** @type {ColumnSpec[]} */
const SAMPLE = [
  {
    title: tx('To do', 'Yapılacak'),
    cards: [
      {
        title: tx('Welcome! Open this card to edit it', 'Hoş geldin! Düzenlemek için bu kartı aç'),
        description: tx(
          'Click or tap a card to change its title, description, labels, due date and checklist.',
          'Başlığını, açıklamasını, etiketlerini, bitiş tarihini ve kontrol listesini değiştirmek için karta tıkla ya da dokun.',
        ),
        labels: ['green'],
        checklist: [
          [tx('Add a label', 'Bir etiket ekle'), false],
          [tx('Set a due date', 'Bitiş tarihi belirle'), false],
          [tx('Tick this item', 'Bu maddeyi işaretle'), false],
        ],
      },
      {
        title: tx('Drag cards between columns', 'Kartları sütunlar arasında sürükle'),
        description: tx(
          'Drag with the mouse, or long-press a card on a touch screen, then drop it where the placeholder appears.',
          'Fareyle sürükle ya da dokunmatik ekranda karta basılı tut; sonra yer tutucunun göründüğü yere bırak.',
        ),
        labels: ['blue'],
      },
      {
        title: tx('Move cards with the keyboard', 'Kartları klavyeyle taşı'),
        description: tx(
          'Focus a card with Tab, press Space to pick it up, move it with the arrow keys and press Space again to drop it.',
          'Tab ile bir karta odaklan, almak için Space tuşuna bas, ok tuşlarıyla taşı ve bırakmak için yine Space tuşuna bas.',
        ),
        labels: ['purple'],
      },
      {
        title: tx('Find cards fast', 'Kartları hızla bul'),
        description: tx(
          'Search ignores case and accents, so "isik" finds "Işık". Filter chips narrow the board down by label or due date.',
          'Arama büyük-küçük harfe ve aksanlara takılmaz: "isik" yazınca "Işık" bulunur. Filtre çipleri panoyu etikete ya da bitiş tarihine göre daraltır.',
        ),
        labels: ['yellow'],
      },
    ],
  },
  {
    title: tx('Doing', 'Yapılıyor'),
    wipLimit: 3,
    cards: [
      {
        title: tx('Mind the WIP limit', 'WIP sınırına dikkat'),
        description: tx(
          'This column holds at most 3 cards. Change the limit from the column menu.',
          'Bu sütun en fazla 3 kart alır. Sınırı sütun menüsünden değiştirebilirsin.',
        ),
        labels: ['orange'],
        due: 2,
      },
    ],
  },
  {
    title: tx('Done', 'Bitti'),
    cards: [
      {
        title: tx('Undo anything', 'Her şeyi geri al'),
        description: tx(
          'Press Ctrl+Z to undo and Ctrl+Y to redo, or use the undo and redo buttons.',
          "Geri almak için Ctrl+Z'ye, yinelemek için Ctrl+Y'ye bas ya da geri al ve yinele düğmelerini kullan.",
        ),
        labels: ['red'],
      },
      {
        title: tx('Saved in this browser', 'Bu tarayıcıda kayıtlı'),
        description: tx(
          'Your board is stored on this device only. Export it to keep a backup or to move it to another browser.',
          'Panon yalnızca bu cihazda saklanır. Yedek almak ya da başka bir tarayıcıya taşımak için dışa aktar.',
        ),
        labels: ['blue'],
      },
    ],
  },
];

/** @type {ColumnSpec[]} */
const DEMO = [
  {
    title: tx('Backlog', 'Bekleyenler'),
    cards: [
      {
        title: tx('Plan the newsletter launch', 'Bülten lansmanını planla'),
        description: tx('Pick a provider and draft the first issue.', 'Bir sağlayıcı seç ve ilk sayının taslağını yaz.'),
        labels: ['green'],
        due: 12,
      },
      {
        title: tx('Research analytics tools', 'Analitik araçlarını araştır'),
        description: tx('Compare privacy-friendly options.', 'Gizlilik dostu seçenekleri karşılaştır.'),
        labels: ['blue'],
      },
      {
        title: tx('Collect beta feedback', 'Beta geri bildirimlerini topla'),
        labels: ['yellow', 'blue'],
        due: 5,
        checklist: [
          [tx('Send the survey', 'Anketi gönder'), true],
          [tx('Summarize answers', 'Yanıtları özetle'), false],
          [tx('Share findings', 'Bulguları paylaş'), false],
        ],
      },
      {
        title: tx('Write onboarding emails', 'Karşılama e-postalarını yaz'),
        labels: ['green'],
      },
    ],
  },
  {
    title: tx('In progress', 'Yapılıyor'),
    wipLimit: 3,
    cards: [
      {
        title: tx('Fix login timeout on Safari', "Safari'de oturum zaman aşımını düzelt"),
        description: tx('Sessions expire after five minutes on iOS.', "iOS'ta oturumlar beş dakika sonra kapanıyor."),
        labels: ['red'],
        due: -2,
      },
      {
        title: tx('Design the landing page', 'Açılış sayfasını tasarla'),
        labels: ['purple'],
        due: 3,
        checklist: [
          [tx('Hero section', 'Üst bölüm'), true],
          [tx('Feature grid', 'Özellik ızgarası'), true],
          [tx('Pricing table', 'Fiyat tablosu'), true],
          [tx('Footer', 'Alt bilgi'), false],
          [tx('Mobile layout', 'Mobil yerleşim'), false],
        ],
      },
      {
        title: tx('Set up continuous integration', 'Sürekli entegrasyonu kur'),
        labels: ['orange'],
        due: 1,
        checklist: [
          [tx('Run tests on every push', 'Her gönderimde testleri çalıştır'), true],
          [tx('Cache dependencies', 'Bağımlılıkları önbelleğe al'), false],
          [tx('Deploy previews', 'Önizlemeleri yayınla'), false],
        ],
      },
    ],
  },
  {
    title: tx('Review', 'İncelemede'),
    wipLimit: 3,
    cards: [
      {
        title: tx('Pricing page copy', 'Fiyatlandırma sayfası metni'),
        description: tx('Check tone and numbers with the team.', 'Üslubu ve rakamları ekiple kontrol et.'),
        labels: ['yellow', 'green'],
        due: 0,
      },
      {
        title: tx('Accessibility audit', 'Erişilebilirlik denetimi'),
        labels: ['blue'],
        checklist: [
          [tx('Keyboard navigation', 'Klavyeyle gezinme'), true],
          [tx('Color contrast', 'Renk kontrastı'), true],
          [tx('Screen reader labels', 'Ekran okuyucu etiketleri'), true],
          [tx('Focus order', 'Odak sırası'), true],
        ],
      },
    ],
  },
  {
    title: tx('Done', 'Bitti'),
    cards: [
      { title: tx('Choose a color palette', 'Renk paletini seç'), labels: ['purple'] },
      { title: tx('Create the repository', 'Depoyu oluştur'), labels: ['orange'] },
      { title: tx('Sketch the first wireframes', 'İlk tel kafes çizimlerini yap'), labels: ['purple'] },
    ],
    archived: [{ title: tx('Old logo experiments', 'Eski logo denemeleri'), labels: ['purple'] }],
  },
];

/**
 * Creates the board shown on a first visit: a short tour of the app in three columns.
 * @param {{ now: number, lang?: string }} options now: clock in ms for timestamps and due dates;
 *   lang: "tr" for Turkish texts, anything else for English
 * @returns {Board}
 */
export function createSampleBoard({ now, lang = 'en' }) {
  return buildBoard(SAMPLE, now, lang);
}

/**
 * Creates the "?demo" board for screenshots: 4 columns, 12 cards with labels and checklists,
 * exactly one overdue card and one archived card. The same input always gives the same board;
 * due dates are relative to the local day of `now`.
 * @param {{ now: number, lang?: string }} options now: clock in ms; lang: "tr" or English otherwise
 * @returns {Board}
 */
export function createDemoBoard({ now, lang = 'en' }) {
  return buildBoard(DEMO, now, lang);
}

function buildBoard(spec, now, lang) {
  const pick = (text) => (lang === 'tr' ? text.tr : text.en);
  const today = toDateKey(now);
  let board = createBoard();
  const run = (action) => {
    const result = reduce(board, action, now);
    if (result.error) throw new Error(`Cannot build board: ${action.type} failed with "${result.error}"`);
    board = result.board;
    return result.id;
  };
  for (const column of spec) {
    const columnId = run({ type: 'column/add', title: pick(column.title), wipLimit: column.wipLimit ?? null });
    for (const card of column.cards) run(cardAction(columnId, card, pick, today));
    for (const card of column.archived ?? []) {
      run({ type: 'card/archive', cardId: run(cardAction(columnId, card, pick, today)) });
    }
  }
  return board;
}

function cardAction(columnId, card, pick, today) {
  return {
    type: 'card/add',
    columnId,
    title: pick(card.title),
    description: card.description ? pick(card.description) : '',
    labels: card.labels ?? [],
    due: card.due === undefined ? null : addDays(today, card.due),
    checklist: (card.checklist ?? []).map(([text, done]) => ({ text: pick(text), done })),
  };
}
