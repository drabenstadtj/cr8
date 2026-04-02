export async function triggerBetaninImport(name) {
  const url = process.env.BETANIN_URL
  if (!url) return

  const downloadDir = process.env.DOWNLOAD_DIR || '/downloads'
  const apiKey = process.env.BETANIN_API_KEY

  const body = new URLSearchParams({ path: downloadDir, name })

  const res = await fetch(`${url}/api/v1/torrents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`betanin import failed ${res.status}: ${text}`)
  }
}
