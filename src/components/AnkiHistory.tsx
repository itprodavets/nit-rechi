import { useEffect, useState } from 'react';
import { dateLabel } from '../domain/model';
import type { Word } from '../domain/model';
import { reviewKey } from '../domain/anki-model';
import type { Review } from '../domain/anki-model';
import { readReviews } from '../domain/anki-history';

const ratings = ['','Снова','Трудно','Хорошо','Легко'];
function intervalLabel(interval: number) {
  if (interval >= 0) return interval + ' дн.';
  return Math.abs(interval) >= 60 ? Math.round(Math.abs(interval) / 60) + ' мин.' : Math.abs(interval) + ' с';
}

export function AnkiHistory({ word }: { word: Word }) {
  const [opened, setOpened] = useState(false);
  const [reviews, setReviews] = useState<Review[]>();
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(20);
  const { ankiGuid, language, ankiUpdatedAt } = word;
  useEffect(() => {
    if (!opened || !ankiGuid) return;
    let active = true;
    readReviews(reviewKey(language, ankiGuid)).then(
      rows => { if (active) setReviews(rows); },
      () => { if (active) setFailed(true); }
    );
    return () => { active = false; };
  }, [opened, ankiGuid, language, ankiUpdatedAt]);
  if (!ankiGuid || !word.ankiReviews) return null;
  return <details className="fold anki-history" onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>История Anki · {word.ankiReviews}</summary>
    {failed ? <p className="sub">Не удалось открыть историю.</p> : !reviews ? <p className="sub">Загружаем…</p> : <>
      <p className="sub">Без «Снова» · {reviews.filter(row => row[2] > 1).length} из {reviews.length}</p>
      <ul className="review-list">
        {reviews.slice(0, limit).map(([at, card, rating, interval]) =>
          <li key={at + ':' + card}><span>{dateLabel(at)}</span><strong>{ratings[rating]}</strong><span>{intervalLabel(interval)}</span></li>)}
      </ul>
      {limit < reviews.length && <button type="button" onClick={() => setLimit(limit + 20)}>Показать ещё</button>}
    </>}
  </details>;
}
