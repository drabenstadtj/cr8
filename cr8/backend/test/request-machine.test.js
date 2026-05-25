import { describe, it, expect } from 'vitest'
import { transition, STATUS, EVENT, EFFECT } from '../src/features/requests/machine.js'

describe('transition: PENDING', () => {
  it('APPROVE → APPROVED', () => {
    const { nextState, sideEffects } = transition(STATUS.PENDING, EVENT.APPROVE)
    expect(nextState).toBe(STATUS.APPROVED)
    expect(sideEffects).toHaveLength(0)
  })

  it('REJECT → REJECTED with reason', () => {
    const { nextState, data } = transition(STATUS.PENDING, EVENT.REJECT, { reason: 'duplicate' })
    expect(nextState).toBe(STATUS.REJECTED)
    expect(data.rejectedReason).toBe('duplicate')
  })

  it('REJECT → REJECTED without reason', () => {
    const { data } = transition(STATUS.PENDING, EVENT.REJECT)
    expect(data.rejectedReason).toBeNull()
  })

  it('throws on invalid event', () => {
    expect(() => transition(STATUS.PENDING, EVENT.DOWNLOAD_COMPLETE)).toThrow()
  })
})

describe('transition: APPROVED', () => {
  it('SEARCH_STARTED → SEARCHING with searchId', () => {
    const { nextState, data } = transition(STATUS.APPROVED, EVENT.SEARCH_STARTED, { searchId: 'abc' })
    expect(nextState).toBe(STATUS.SEARCHING)
    expect(data.slskdSearchId).toBe('abc')
  })

  it('SEARCH_ERROR → FAILED', () => {
    const { nextState } = transition(STATUS.APPROVED, EVENT.SEARCH_ERROR)
    expect(nextState).toBe(STATUS.FAILED)
  })

  it('throws on invalid event', () => {
    expect(() => transition(STATUS.APPROVED, EVENT.APPROVE)).toThrow()
  })
})

describe('transition: SEARCHING', () => {
  it('NO_CANDIDATES → FAILED', () => {
    const { nextState } = transition(STATUS.SEARCHING, EVENT.NO_CANDIDATES)
    expect(nextState).toBe(STATUS.FAILED)
  })

  it('QUEUE_FAILED → FAILED', () => {
    const { nextState } = transition(STATUS.SEARCHING, EVENT.QUEUE_FAILED)
    expect(nextState).toBe(STATUS.FAILED)
  })

  it('SEARCH_ERROR → FAILED', () => {
    const { nextState } = transition(STATUS.SEARCHING, EVENT.SEARCH_ERROR)
    expect(nextState).toBe(STATUS.FAILED)
  })

  it('DOWNLOAD_QUEUED → DOWNLOADING with username and filename', () => {
    const { nextState, data } = transition(STATUS.SEARCHING, EVENT.DOWNLOAD_QUEUED, {
      username: 'peer1',
      filename: '\\Music\\file.flac',
    })
    expect(nextState).toBe(STATUS.DOWNLOADING)
    expect(data.slskdUsername).toBe('peer1')
    expect(data.slskdFilename).toBe('\\Music\\file.flac')
  })

  it('throws on invalid event', () => {
    expect(() => transition(STATUS.SEARCHING, EVENT.PEER_RETRY)).toThrow()
  })
})

describe('transition: DOWNLOADING', () => {
  it('DOWNLOAD_COMPLETE → COMPLETE with IMPORT and SCAN effects', () => {
    const { nextState, sideEffects } = transition(STATUS.DOWNLOADING, EVENT.DOWNLOAD_COMPLETE, {
      dirName: 'OK Computer',
      lbTracks: [],
    })
    expect(nextState).toBe(STATUS.COMPLETE)
    expect(sideEffects.map((e) => e.type)).toContain(EFFECT.IMPORT_DOWNLOAD)
    expect(sideEffects.map((e) => e.type)).toContain(EFFECT.SCAN_LIBRARY)
  })

  it('DOWNLOAD_COMPLETE adds ADD_TO_PLAYLIST effect when lbTracks present', () => {
    const lbTracks = [{ title: 'Airbag', artist: 'Radiohead' }]
    const { sideEffects } = transition(STATUS.DOWNLOADING, EVENT.DOWNLOAD_COMPLETE, {
      dirName: 'OK Computer',
      lbTracks,
      playlistName: 'Weekly Exploration',
    })
    const playlist = sideEffects.find((e) => e.type === EFFECT.ADD_TO_PLAYLIST)
    expect(playlist).toBeDefined()
    expect(playlist.payload.lbTracks).toEqual(lbTracks)
    expect(playlist.payload.playlistName).toBe('Weekly Exploration')
  })

  it('DOWNLOAD_COMPLETE does NOT add ADD_TO_PLAYLIST when lbTracks empty', () => {
    const { sideEffects } = transition(STATUS.DOWNLOADING, EVENT.DOWNLOAD_COMPLETE, {
      dirName: 'dir',
      lbTracks: [],
    })
    expect(sideEffects.find((e) => e.type === EFFECT.ADD_TO_PLAYLIST)).toBeUndefined()
  })

  it('PEER_RETRY → DOWNLOADING with updated retries', () => {
    const { nextState, data } = transition(STATUS.DOWNLOADING, EVENT.PEER_RETRY, { retries: 2 })
    expect(nextState).toBe(STATUS.DOWNLOADING)
    expect(data.downloadRetries).toBe(2)
  })

  it('FRESH_SEARCH → APPROVED and resets tracking fields', () => {
    const { nextState, data } = transition(STATUS.DOWNLOADING, EVENT.FRESH_SEARCH)
    expect(nextState).toBe(STATUS.APPROVED)
    expect(data.slskdUsername).toBeNull()
    expect(data.slskdFilename).toBeNull()
    expect(data.downloadRetries).toBe(0)
  })

  it('throws on invalid event', () => {
    expect(() => transition(STATUS.DOWNLOADING, EVENT.APPROVE)).toThrow()
  })
})

describe('terminal states', () => {
  it('COMPLETE throws on any event', () => {
    expect(() => transition(STATUS.COMPLETE, EVENT.APPROVE)).toThrow()
  })

  it('FAILED throws on any event', () => {
    expect(() => transition(STATUS.FAILED, EVENT.APPROVE)).toThrow()
  })

  it('REJECTED throws on any event', () => {
    expect(() => transition(STATUS.REJECTED, EVENT.APPROVE)).toThrow()
  })
})
