REST API
========

Endpoint | Description
--- | ---
`GET /torrents/{infoHash}` | will return one torrent
`GET /torrents/{infoHash}/stats` | will return the torrent stats (speed, bandwidth, etc.)
`POST /torrents` | will add a new torrent (`{"link":"magnet link or URL"}`)
`DELETE /torrents/{infoHash}` | will delete the torrent
