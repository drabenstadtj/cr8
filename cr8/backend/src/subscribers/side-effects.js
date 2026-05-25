import { EFFECT } from '../lib/request-machine.js'

/**
 * Registers side-effect event handlers on the app.
 * The downloader emits 'sideEffect' events; this module executes them.
 * Keeping execution here means the downloader has no direct dependency
 * on library or importer.
 */
export function registerSideEffectSubscribers(app) {
  app.events.on('sideEffect', (effect, context) => {
    const { library, importer, log } = app
    const requestId = context?.requestId

    if (effect.type === EFFECT.IMPORT_DOWNLOAD) {
      importer.importDownload(effect.payload.dirName).catch(
        (e) => log.warn({ err: e.message }, 'betanin import trigger failed')
      )
    } else if (effect.type === EFFECT.SCAN_LIBRARY) {
      library.scanLibrary()
    } else if (effect.type === EFFECT.ADD_TO_PLAYLIST) {
      library.addTracksToPlaylist(effect.payload.playlistName, effect.payload.lbTracks).catch(
        (e) => log.warn({ id: requestId, err: e.message }, 'Weekly playlist update failed')
      )
    }
  })
}
