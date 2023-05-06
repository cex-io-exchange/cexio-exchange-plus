import { EventCallback } from './callbacks';

export type Defer<T> = {
  promise: Promise<T>,
  resolve: ((t: T) => void) | (() => void)
}

export type Handlers = {
  [event: string]: EventCallback
}

/**
 * Missing type definition for MessageOidReply
 */
export type MessageOidReply = any