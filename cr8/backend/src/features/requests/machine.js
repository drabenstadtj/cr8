// Valid status values
export const STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SEARCHING: 'SEARCHING',
  DOWNLOADING: 'DOWNLOADING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
}

// Valid event names
export const EVENT = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  SEARCH_STARTED: 'SEARCH_STARTED',
  NO_CANDIDATES: 'NO_CANDIDATES',
  QUEUE_FAILED: 'QUEUE_FAILED',
  SEARCH_ERROR: 'SEARCH_ERROR',
  DOWNLOAD_QUEUED: 'DOWNLOAD_QUEUED',
  DOWNLOAD_COMPLETE: 'DOWNLOAD_COMPLETE',
  PEER_RETRY: 'PEER_RETRY',
  FRESH_SEARCH: 'FRESH_SEARCH',
}

// Side effect tags — worker executes these after DB is updated
export const EFFECT = {
  IMPORT_DOWNLOAD: 'IMPORT_DOWNLOAD',
  SCAN_LIBRARY: 'SCAN_LIBRARY',
  ADD_TO_PLAYLIST: 'ADD_TO_PLAYLIST',
}

/**
 * Pure state machine.
 * Returns { nextState, data, sideEffects } or throws if the transition is invalid.
 *
 * `data` is merged into the Request update payload.
 * `sideEffects` is an array of { type, payload } objects the caller must execute.
 */
export function transition(state, event, payload = {}) {
  switch (state) {
    case STATUS.PENDING:
      if (event === EVENT.APPROVE) {
        return { nextState: STATUS.APPROVED, data: {}, sideEffects: [] }
      }
      if (event === EVENT.REJECT) {
        return {
          nextState: STATUS.REJECTED,
          data: { rejectedReason: payload.reason ?? null },
          sideEffects: [],
        }
      }
      break

    case STATUS.APPROVED:
      if (event === EVENT.SEARCH_STARTED) {
        return {
          nextState: STATUS.SEARCHING,
          data: { slskdSearchId: payload.searchId ?? null },
          sideEffects: [],
        }
      }
      if (event === EVENT.SEARCH_ERROR) {
        return { nextState: STATUS.FAILED, data: {}, sideEffects: [] }
      }
      break

    case STATUS.SEARCHING:
      if (event === EVENT.NO_CANDIDATES) {
        return { nextState: STATUS.FAILED, data: {}, sideEffects: [] }
      }
      if (event === EVENT.QUEUE_FAILED) {
        return { nextState: STATUS.FAILED, data: {}, sideEffects: [] }
      }
      if (event === EVENT.SEARCH_ERROR) {
        return { nextState: STATUS.FAILED, data: {}, sideEffects: [] }
      }
      if (event === EVENT.DOWNLOAD_QUEUED) {
        return {
          nextState: STATUS.DOWNLOADING,
          data: {
            slskdUsername: payload.username ?? null,
            slskdFilename: payload.filename ?? null,
          },
          sideEffects: [],
        }
      }
      break

    case STATUS.DOWNLOADING:
      if (event === EVENT.DOWNLOAD_COMPLETE) {
        const effects = [
          { type: EFFECT.IMPORT_DOWNLOAD, payload: { dirName: payload.dirName } },
          { type: EFFECT.SCAN_LIBRARY, payload: {} },
        ]
        if (payload.lbTracks?.length) {
          effects.push({
            type: EFFECT.ADD_TO_PLAYLIST,
            payload: { playlistName: payload.playlistName, lbTracks: payload.lbTracks },
          })
        }
        return { nextState: STATUS.COMPLETE, data: {}, sideEffects: effects }
      }
      if (event === EVENT.PEER_RETRY) {
        return {
          nextState: STATUS.DOWNLOADING,
          data: { downloadRetries: payload.retries },
          sideEffects: [],
        }
      }
      if (event === EVENT.FRESH_SEARCH) {
        return {
          nextState: STATUS.APPROVED,
          data: {
            slskdUsername: null,
            slskdFilename: null,
            downloadRetries: 0,
          },
          sideEffects: [],
        }
      }
      break

    default:
      break
  }

  throw new Error(`Invalid transition: ${state} + ${event}`)
}
