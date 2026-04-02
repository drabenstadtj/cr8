import { searchRecordings, searchReleases, searchArtists, browseReleasesByArtist, lookupByMbid } from '../services/musicbrainz.js'
import { checkDuplicateInLibrary } from '../services/gonic.js'

async function annotateWithLibraryStatus(results) {
  const checks = await Promise.all(
    results.map((r) => checkDuplicateInLibrary(r.title, r.artist).catch(() => false))
  )
  return results.map((r, i) => ({ ...r, inLibrary: checks[i] }))
}

export default async function searchRoutes(app) {
  // GET /search/recordings?q=artist+title
  app.get('/recordings', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { q } = req.query
    if (!q) return reply.code(400).send({ error: 'q is required' })
    const results = await searchRecordings(q)
    return annotateWithLibraryStatus(results)
  })

  // GET /search/releases?q=artist+album
  app.get('/releases', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { q } = req.query
    if (!q) return reply.code(400).send({ error: 'q is required' })
    const results = await searchReleases(q)
    return annotateWithLibraryStatus(results)
  })

  // GET /search/artists?q=name
  app.get('/artists', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { q } = req.query
    if (!q) return reply.code(400).send({ error: 'q is required' })
    return searchArtists(q)
  })

  // GET /search/all?q=query
  app.get('/all', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { q } = req.query
    if (!q) return reply.code(400).send({ error: 'q is required' })
    const [recordings, releases, artists] = await Promise.all([
      searchRecordings(q).then((r) => annotateWithLibraryStatus(r)),
      searchReleases(q).then((r) => annotateWithLibraryStatus(r)),
      searchArtists(q),
    ])
    return [
      ...recordings.map((r) => ({ ...r, resultType: 'recording' })),
      ...releases.map((r) => ({ ...r, resultType: 'release' })),
      ...artists,
    ]
  })

  // GET /search/artist/:mbid/releases
  app.get('/artist/:mbid/releases', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { mbid } = req.params
    const results = await browseReleasesByArtist(mbid)
    return annotateWithLibraryStatus(results)
  })

  // GET /search/lookup/:mbid?type=recording|release
  app.get('/lookup/:mbid', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { mbid } = req.params
    const { type = 'recording' } = req.query
    const result = await lookupByMbid(mbid, type)
    return result
  })
}
