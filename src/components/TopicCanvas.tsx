import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useWorkspace } from '../context';
import type { MapPoint, Topic } from '../domain/model';
import { Fold } from './common';

type CanvasMode = 'view' | 'move' | 'connect';

const tools: Record<CanvasMode, string> = { view: 'Обзор', move: 'Двигать', connect: 'Связать' };
const directions: Record<string, MapPoint> = {
  ArrowLeft: { x: -3, y: 0 }, ArrowRight: { x: 3, y: 0 },
  ArrowUp: { x: 0, y: -3 }, ArrowDown: { x: 0, y: 3 }
};

function withinCanvas({ x, y }: MapPoint): MapPoint {
  return { x: Math.min(79, Math.max(21, x)), y: Math.min(93, Math.max(7, y)) };
}

export function TopicCanvas({ topics, selected }: { topics: Topic[]; selected: string }) {
  const { update, openTopic, notify } = useWorkspace();
  const [mode, setMode] = useState<CanvasMode>('view');
  const [start, setStart] = useState<string>();
  const [zoom, setZoom] = useState(100);
  const [preview, setPreview] = useState<{ id: string; point: MapPoint }>();
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; pointerId: number; origin: MapPoint; point: MapPoint } | undefined>(undefined);
  const rows = Math.max(3, Math.ceil(topics.length / 2));
  const positions = new Map(topics.map((topic, index) => [topic.id,
    preview?.id === topic.id ? preview.point : topic.position ?? {
      x: index % 2 ? 74 : 26, y: (Math.floor(index / 2) + 0.5) * 100 / rows
    }
  ]));
  const labels = new Map(topics.map(topic => [topic.id, topic.title]));
  const edges = topics.flatMap(topic => (topic.connections ?? []).filter(id => positions.has(id)).map(id => ({ from: topic.id, to: id })));

  function select(id: string) {
    if (mode === 'view') { openTopic(id); return; }
    if (mode !== 'connect') return;
    if (!start || start === id) { setStart(start === id ? undefined : id); return; }
    if (edges.some(edge => (edge.from === start && edge.to === id) || (edge.from === id && edge.to === start))) {
      notify('Между этими темами уже есть связь.');
      setStart(undefined);
      return;
    }
    if (update(current => ({ ...current, topics: current.topics.map(topic => topic.id === start
      ? { ...topic, connections: [...(topic.connections ?? []), id] } : topic) }))) setStart(undefined);
  }

  function move(id: string, position: MapPoint) {
    update(current => ({ ...current, topics: current.topics.map(topic => topic.id === id ? { ...topic, position } : topic) }));
  }

  function positionAt(event: PointerEvent) {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 100 / rect.width, y: (event.clientY - rect.top) * 100 / rect.height };
  }

  return <section className="topic-graph" aria-label="Редактор карты тем">
    <div className="graph-toolbar">
      <div className="actions" role="group" aria-label="Режим карты">
        {(Object.keys(tools) as CanvasMode[]).map(tool => <button key={tool} type="button"
          aria-pressed={mode === tool} onClick={() => { setMode(tool); setStart(undefined); }}>{tools[tool]}</button>)}
      </div>
      <div className="actions graph-zoom" role="group" aria-label="Масштаб карты">
        <button type="button" aria-label="Уменьшить карту" disabled={zoom <= 100} onClick={() => setZoom(zoom - 25)}>−</button>
        <span>{zoom}%</span>
        <button type="button" aria-label="Увеличить карту" disabled={zoom >= 200} onClick={() => setZoom(zoom + 25)}>+</button>
      </div>
    </div>
    <p className="sub graph-guide" role="status">{mode === 'view' ? 'Выбери тему, чтобы открыть её слова и материалы.'
      : mode === 'move' ? 'Перетащи карточку мышью или пальцем. С клавиатуры используй стрелки.'
      : start ? 'Выбери вторую тему, чтобы провести линию.' : 'Выбери первую тему для связи.'}</p>
    <div className="graph-viewport">
      <div className="network graph-canvas" ref={canvas} style={{ width: zoom + '%', height: rows * 112 * zoom / 100 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(({ from, to }) => {
            const a = positions.get(from)!, b = positions.get(to)!;
            const bend = (a.x + b.x) / 2;
            return <path key={JSON.stringify([from, to])} className={selected === from || selected === to ? 'active' : ''}
              d={`M${a.x} ${a.y} C${bend} ${a.y} ${bend} ${b.y} ${b.x} ${b.y}`} />;
          })}
        </svg>
        {topics.map(topic => {
          const point = positions.get(topic.id)!;
          return <button key={topic.id} type="button" className={`word-node graph-node ${mode === 'move' ? 'graph-movable' : ''}`}
            style={{ left: point.x + '%', top: point.y + '%' }} lang={topic.language}
            aria-pressed={mode === 'connect' ? topic.id === start : topic.id === selected} title={topic.title}
            onClick={() => select(topic.id)}
            onKeyDown={event => {
              const direction = directions[event.key];
              if (mode !== 'move' || !direction) return;
              event.preventDefault();
              move(topic.id, withinCanvas({ x: point.x + direction.x, y: point.y + direction.y }));
            }}
            onPointerDown={event => {
              if (mode !== 'move' || !event.isPrimary || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: topic.id, pointerId: event.pointerId, origin: positionAt(event), point };
            }}
            onPointerMove={event => {
              const gesture = drag.current;
              if (gesture?.pointerId !== event.pointerId) return;
              const at = positionAt(event);
              setPreview({ id: gesture.id, point: withinCanvas({
                x: gesture.point.x + at.x - gesture.origin.x, y: gesture.point.y + at.y - gesture.origin.y
              }) });
            }}
            onPointerUp={event => {
              if (drag.current?.pointerId !== event.pointerId) return;
              if (preview) move(preview.id, preview.point);
              drag.current = undefined;
              setPreview(undefined);
            }}
            onLostPointerCapture={() => { drag.current = undefined; setPreview(undefined); }}>
            <span>{topic.title}</span>
          </button>;
        })}
      </div>
    </div>
    {edges.length > 0 && <Fold title={`Связи между темами · ${edges.length}`}>
      <ul className="graph-edges">{edges.map(({ from, to }) => <li key={JSON.stringify([from, to])}>
        <span>{labels.get(from)} ↔ {labels.get(to)}</span>
        <button type="button" aria-label={`Убрать связь: ${labels.get(from)} и ${labels.get(to)}`}
          onClick={() => update(current => ({ ...current, topics: current.topics.map(topic => topic.id === from
            ? { ...topic, connections: topic.connections?.filter(id => id !== to) } : topic) }))}>Убрать</button>
      </li>)}</ul>
    </Fold>}
  </section>;
}
