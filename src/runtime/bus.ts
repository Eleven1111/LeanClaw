import type { PushEvent } from '../shared/types'

type Sink = (e: PushEvent) => void

const sinks = new Set<Sink>()

export function subscribe(sink: Sink): () => void {
  sinks.add(sink)
  return () => sinks.delete(sink)
}

export function publish(e: PushEvent): void {
  for (const sink of sinks) sink(e)
}
