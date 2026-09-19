// SUS (Brooke 1996) and raw NASA-TLX (Hart & Staveland 1988) forms.
import { rawTlx, susScore } from './fittsMath';
import type { Condition, QuestionnaireResult } from './session';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const SUS_ITEMS = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
];

export const TLX_ITEMS = [
  { key: 'mental', label: 'Mental demand', question: 'How mentally demanding was the task?', low: 'Very low', high: 'Very high' },
  { key: 'physical', label: 'Physical demand', question: 'How physically demanding was the task?', low: 'Very low', high: 'Very high' },
  { key: 'temporal', label: 'Temporal demand', question: 'How hurried or rushed was the pace of the task?', low: 'Very low', high: 'Very high' },
  { key: 'performance', label: 'Performance', question: 'How successful were you in doing what you were asked to do?', low: 'Perfect', high: 'Failure' },
  { key: 'effort', label: 'Effort', question: 'How hard did you have to work to reach your level of performance?', low: 'Very low', high: 'Very high' },
  { key: 'frustration', label: 'Frustration', question: 'How insecure, discouraged, irritated, stressed, or annoyed were you?', low: 'Very low', high: 'Very high' },
] as const;

export function setupQuestionnaires(condition: () => Condition, onResult: (r: QuestionnaireResult) => void) {
  const sus = $('sus-items');
  SUS_ITEMS.forEach((text, i) => {
    const fs = document.createElement('fieldset');
    fs.className = 'likert';
    const legend = document.createElement('legend');
    legend.textContent = `${i + 1}. ${text}`;
    const scale = document.createElement('div');
    scale.className = 'scale';
    for (let v = 1; v <= 5; v++) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `sus${i + 1}`;
      input.value = String(v);
      const words = v === 1 ? ' (strongly disagree)' : v === 5 ? ' (strongly agree)' : '';
      label.append(input, ` ${v}${words}`);
      scale.append(label);
    }
    fs.append(legend, scale);
    sus.append(fs);
  });

  const tlx = $('tlx-items');
  tlx.classList.add('tlx');
  for (const item of TLX_ITEMS) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const id = `tlx-${item.key}`;
    wrap.innerHTML = `
      <label for="${id}">${item.label}: ${item.question} <output for="${id}">50</output></label>
      <input type="range" id="${id}" name="${item.key}" min="0" max="100" step="5" value="50" aria-describedby="${id}-ends">
      <div class="ends" id="${id}-ends"><span>0 = ${item.low}</span><span>100 = ${item.high}</span></div>`;
    const input = wrap.querySelector('input')!;
    const out = wrap.querySelector('output')!;
    const sync = () => {
      out.textContent = input.value;
      input.setAttribute('aria-valuetext', `${input.value} out of 100`);
    };
    input.addEventListener('input', sync);
    sync();
    tlx.append(wrap);
  }

  $<HTMLFormElement>('sus-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const answers = SUS_ITEMS.map((_, i) => Number(data.get(`sus${i + 1}`) ?? 0));
    const missing = answers.map((a, i) => (a ? 0 : i + 1)).filter(Boolean);
    if (missing.length) {
      $('sus-error').textContent = `Please answer question${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`;
      form.querySelector<HTMLInputElement>(`input[name="sus${missing[0]}"]`)?.focus();
      return;
    }
    $('sus-error').textContent = '';
    const score = susScore(answers);
    onResult({
      kind: 'sus',
      condition: condition(),
      answers: Object.fromEntries(answers.map((a, i) => [`q${i + 1}`, a])),
      score,
      t: new Date().toISOString(),
    });
    $('sus-result').textContent = `Saved for the "${conditionLabel(condition())}" condition. SUS score: ${score}.`;
    form.reset();
  });

  $<HTMLFormElement>('tlx-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const values = TLX_ITEMS.map((i) => Number((form.elements.namedItem(i.key) as HTMLInputElement).value));
    const score = rawTlx(values);
    onResult({
      kind: 'tlx',
      condition: condition(),
      answers: Object.fromEntries(TLX_ITEMS.map((i, k) => [i.key, values[k]!])),
      score,
      t: new Date().toISOString(),
    });
    $('tlx-result').textContent = `Saved for the "${conditionLabel(condition())}" condition. Raw TLX workload: ${score.toFixed(1)} / 100.`;
  });
}

export function conditionLabel(c: Condition): string {
  return c === 'steady' ? 'with Steady' : 'without Steady';
}
