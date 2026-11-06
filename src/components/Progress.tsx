import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context';
import { readAnkiDays } from '../domain/anki-history';
import { reviewKey } from '../domain/anki-model';
import { dateLabel, localDay, modeLabels, practiceQueue, resultLabels } from '../domain/model';
import { Heading } from './common';

const seriesLabels = { anki: 'Anki', ...modeLabels };
const series = Object.keys(seriesLabels) as (keyof typeof seriesLabels)[];
const chartDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });

function datesInPeriod(period: number, today: string) {
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length: period }, (_, index) => new Date(year, month - 1, day - period + index + 1));
}

export function Progress() {
  const { study, active, practice } = useWorkspace();
  const [period, choosePeriod] = useState(7);
  const [anki, setAnki] = useState<Awaited<ReturnType<typeof readAnkiDays>>>();
  const [historyError, setHistoryError] = useState(false);
  const today = localDay(Date.now());
  const dates = useMemo(() => datesInPeriod(period, today), [period, today]);
  const keys = useMemo(() => new Set(active.words.flatMap(word => word.ankiGuid && word.ankiReviews
    ? [reviewKey(study.language, word.ankiGuid)] : [])), [active.words, study.language]);
  useEffect(() => {
    let live = true;
    setAnki(undefined);
    setHistoryError(false);
    const end = new Date(dates.at(-1)!);
    end.setDate(end.getDate() + 1);
    readAnkiDays(study.language, keys, dates[0].getTime(), end.getTime()).then(days => {
      if (live) setAnki(days);
    }, () => { if (live) setHistoryError(true); });
    return () => { live = false; };
  }, [dates, keys, study.language]);

  const ankiDays = anki?.days;
  const ankiMissed = active.words.flatMap(word => {
    const missed = word.ankiGuid && anki?.missed.get(reviewKey(study.language, word.ankiGuid));
    return missed ? [{ word, missed }] : [];
  }).sort((a, b) => b.missed - a.missed).slice(0, 6);
  const points = dates.map(date => {
    const key = localDay(date.getTime());
    const saved = study.practiceDays?.[study.language]?.[key];
    const anki = ankiDays?.get(key);
    return { date, counts: series.map(mode => {
      if (mode === 'anki') return { total: anki?.total ?? 0, success: anki?.recalled ?? 0 };
      const result = saved?.[mode];
      return { total: result ? result.independent + result.assisted + result.retry : 0, success: result?.independent ?? 0 };
    }) };
  });
  const activity = points.map(point => point.counts.reduce((sum, count) => sum + count.total, 0));
  const scale = Math.max(...activity, 1);
  const totals = series.map((_, index) => points.reduce((sum, point) => ({
    total: sum.total + point.counts[index].total, success: sum.success + point.counts[index].success
  }), { total: 0, success: 0 }));
  const queue = useMemo(() => practiceQueue(study), [study]);
  const now = Date.now();
  const practiced = queue.filter(item => study.results[item.id]);
  const needingPractice = practiced.filter(item => study.results[item.id].result !== 'independent' || study.results[item.id].due <= now);
  const practicedModes = totals.slice(1);
  const advice = !practicedModes.some(entry => entry.total)
    ? 'Ответь в практике, чтобы увидеть, что получается самостоятельно.'
    : practicedModes[0].total === 0 ? 'Попробуй устный ответ. Он покажет, получается ли употребить слова в своей речи.'
      : needingPractice.length > 0 ? 'Начни с заданий, где понадобилась подсказка или пришло время повторения.'
        : 'Попробуй пересказать материал своими словами и использовать в нём слова из Anki.';

  return <><Heading title="Прогресс" detail="Активность и результаты по выбранному языку." />
    <div className="progress-board">
      <div className="progress-top">
        <h2>Активность по дням</h2>
        <div className="actions" role="group" aria-label="Период графика">
          {[7, 30].map(days => <button key={days} type="button" aria-pressed={days === period} onClick={() => choosePeriod(days)}>{days} дней</button>)}
        </div>
      </div>
      <figure className="progress-figure" aria-label="Количество ответов по дням">
        <div className="progress-chart" style={{ gridTemplateColumns: `repeat(${period}, minmax(0, 1fr))` }} aria-hidden="true">
          {points.map((point, index) => <div key={point.date.toISOString()} className="progress-column"
            title={chartDate.format(point.date) + ' · ' + series.map((mode, column) => seriesLabels[mode] + ' ' + point.counts[column].total).join(' · ')}>
            {point.counts.map(({ total }, column) => <div key={series[column]} className={`progress-fill ${series[column]}`} style={{ height: total / scale * 100 + '%' }} />)}
            {!activity[index] && <div className="progress-zero" />}
          </div>)}
        </div>
        <figcaption className="progress-range"><span>{chartDate.format(dates[0])}</span><span>Пик · {Math.max(...activity)} ответов</span><span>{chartDate.format(dates.at(-1)!)}</span></figcaption>
        <div className="progress-legend">{series.map(mode => <span key={mode}><i className={`progress-fill ${mode}`} />{seriesLabels[mode]}</span>)}</div>
      </figure>
      <details className="fold"><summary>Данные по дням</summary>
        <div className="progress-table"><table><thead><tr><th scope="col">День</th>
          {series.map(mode => <th scope="col" key={mode}>{seriesLabels[mode]}</th>)}</tr></thead>
          <tbody>{[...points].reverse().map(point => <tr key={point.date.toISOString()}><th scope="row">{chartDate.format(point.date)}</th>
            {point.counts.map((count, index) => <td key={series[index]}>{index === 0 && !ankiDays ? '—' : count.total}</td>)}
          </tr>)}</tbody></table></div>
      </details>
      {!ankiDays && keys.size > 0 && <p className="sub" role="status">{historyError ? 'Не удалось прочитать историю Anki.' : 'Загружаем историю Anki…'}</p>}
    </div>
    <div className="progress-board">
      <h2>Сколько ответов получилось</h2>
      <p className="sub">В Anki считаем ответы «Трудно», «Хорошо» и «Легко». В практике считаем ответы без подсказки по результатам проверки и самооценке.</p>
      <div className="progress-breakdown">{series.map((mode, index) => {
        const { total, success } = totals[index];
        const percent = total ? Math.round(success / total * 100) : 0;
        return <div key={mode}>
          <div className="progress-top"><span>{seriesLabels[mode]}</span><strong>{total ? `${percent}% · ${success} из ${total}` : 'Пока нет ответов'}</strong></div>
          <div className="progress-track" aria-hidden="true"><div className={`progress-fill ${mode}`} style={{ width: percent + '%' }} /></div>
        </div>;
      })}</div>
    </div>
    <div className="progress-board">
      <h2>Что потренировать</h2>
      <p className="sub">{advice}</p>
      {needingPractice.length > 0 ? <div className="history">{needingPractice.slice(0, 6).map(item => {
        const result = study.results[item.id];
        return <div key={item.id}><button type="button" onClick={() => practice(item.id)}>{item.title}</button>
          <span>{resultLabels[result.result]}</span>
          <span>{result.due <= now ? 'Можно повторить сейчас' : 'Повторить ' + dateLabel(result.due)}</span>
        </div>;
      })}</div> : !ankiMissed.length && queue[0] && <div className="actions"><button type="button" className="primary" onClick={() => practice(queue[0].id)}>Открыть практику</button></div>}
      {ankiMissed.length > 0 && <div>
        <p className="sub">Слова с последним ответом «Снова» в Anki за этот период</p>
        <div className="actions progress-words">{ankiMissed.map(({ word }) => <button key={word.id} type="button" lang={word.language}
          onClick={() => practice(word.id)}>{word.title}</button>)}</div>
      </div>}
    </div>
    {practiced.length > 0 && <details className="fold"><summary>Последние результаты по заданиям · {practiced.length}</summary>
      <div className="history">{[...practiced].sort((a, b) => study.results[b.id].updated - study.results[a.id].updated).map(item => {
        const result = study.results[item.id];
        return <div key={item.id}><button type="button" onClick={() => practice(item.id)}>{item.title}</button>
          <span>{resultLabels[result.result]}</span><span>{modeLabels[result.mode ?? 'spoken']}</span>
        </div>;
      })}</div>
    </details>}
  </>;
}
