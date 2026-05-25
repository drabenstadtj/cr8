export default async function searchRoutes(app) {
  async function annotateWithLibraryStatus(results) {
    const checks = await Promise.all(
      results.map((r) => app.library.contains(r.title, r.artist).catch(() => false))
    )
    return results.map((r, i) => ({ ...r, inLibrary: checks[i] }))
  }

  app.get('/recordings', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { title, artist, album, offset = 0 } = req.query
    if (!title && !artist && !album) return reply.code(400).send({ error: 'at least one of title, artist, album is required' })
    const { results, total } = await app.catalog.searchTracks({ title, artist, album, offset: parseInt(offset) })
    const annotated = await annotateWithLibraryStatus(results)
    return { results: annotated, total, offset: parseInt(offset) }
  })

  app.get('/releases', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { title, artist, offset = 0 } = req.query
    if (!title && !artist) return reply.code(400).send({ error: 'at least one of title, artist is required' })
    const { results, total } = await app.catalog.searchAlbums({ title, artist, offset: parseInt(offset) })
    const annotated = await annotateWithLibraryStatus(results)
    return { results: annotated, total, offset: parseInt(offset) }
  })

  app.get('/artists', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { name, offset = 0 } = req.query
    if (!name) return reply.code(400).send({ error: 'name is required' })
    const { results, total } = await app.catalog.searchArtists({ name, offset: parseInt(offset) })
    return { results, total, offset: parseInt(offset) }
  })

  app.get('/all', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { title, artist, offset = 0 } = req.query
    if (!title && !artist) return reply.code(400).send({ error: 'at least one of title, artist is required' })
    const off = parseInt(offset)
    const [rec, rel, art] = await Promise.all([
      app.catalog.searchTracks({ title, artist, offset: off }).then(({ results }) => annotateWithLibraryStatus(results)),
      app.catalog.searchAlbums({ title, artist, offset: off }).then(({ results }) => annotateWithLibraryStatus(results)),
      app.catalog.searchArtists({ name: title || artist, offset: off }).then(({ results }) => results),
    ])
    return {
      results: [
        ...rec.map((r) => ({ ...r, resultType: 'recording' })),
        ...rel.map((r) => ({ ...r, resultType: 'release' })),
        ...art,
      ],
      total: null,
      offset: off,
    }
  })

  app.get('/artist/:mbid/releases', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { mbid } = req.params
    const { offset = 0 } = req.query
    const { results, total } = await app.catalog.browseArtistAlbums(mbid, { offset: parseInt(offset) })
    const annotated = await annotateWithLibraryStatus(results)
    return { results: annotated, total, offset: parseInt(offset) }
  })

  app.get('/lookup/:mbid', { onRequest: [app.authenticate] }, async (req) => {
    const { mbid } = req.params
    const { type = 'recording' } = req.query
    return app.catalog.lookup(mbid, type)
  })
}
