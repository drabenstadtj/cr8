package main

import (
	"explo/src/logging"
	"log"
	"log/slog"
	"os"

	"explo/src/client"
	"explo/src/config"
	"explo/src/discovery"
	"explo/src/downloader"
	"explo/src/util"
)

type Song struct {
	Title  string
	Artist string
	Album  string
}

func initHttpClient() *util.HttpClient {
	return util.NewHttp(util.HttpClientConfig{
		Timeout: 10,
	})
}

// Inits debug, gets playlist name, if needed, handles deprecation
func setup(cfg *config.Config) {
	cfg.HandleDeprecation()
	notifyClient := logging.InitNotify(cfg.NotifyCfg)
	logging.Init(cfg.LogLevel, notifyClient)
	cfg.GenPlaylistName()
}

func runForUser(cfg *config.Config, httpClient *util.HttpClient) {
	c, err := client.NewClient(cfg)
	if err != nil {
		slog.Error(err.Error(), "notify", true)
		return
	}
	disc := discovery.NewDiscoverer(cfg.DiscoveryCfg, httpClient)
	dl, err := downloader.NewDownloader(&cfg.DownloadCfg, httpClient, cfg.Flags.ExcludeLocal)
	if err != nil {
		slog.Error(err.Error(), "notify", true)
		return
	}

	tracks, err := disc.Discover()
	if err != nil {
		slog.Error(err.Error(), "notify", true)
		return
	}
	if !cfg.Persist {
		err := c.DeletePlaylist()
		if err != nil {
			slog.Warn(err.Error(), "notify", true)
		}
		if cfg.DownloadCfg.UseSubDir {
			dl.DeleteSongs()
		}
	}
	if cfg.Flags.DownloadMode != "force" {
		if err := c.CheckTracks(tracks); err != nil {
			slog.Warn(err.Error(), "notify", true)
		}
	}

	if cfg.Flags.DownloadMode != "skip" {
		dl.StartDownload(&tracks)
		if len(tracks) == 0 {
			slog.Error("couldn't download any tracks", "notify", true)
			return
		}
	}

	if err := c.CreatePlaylist(tracks); err != nil {
		slog.Warn(err.Error())
	} else {
		slog.Info("playlist created successfully", "system", cfg.System, "playlistName", cfg.ClientCfg.PlaylistName, "notify", true)
	}
}

func main() {
	var cfg config.Config
	if err := cfg.GetFlags(); err != nil {
		log.Fatal(err)
	}
	cfg.ReadEnv()
	cfg.MergeFlags()

	// Capture the normalised base download dir before setup() appends the playlist name.
	baseDownloadDir := cfg.DownloadCfg.DownloadDir

	setup(&cfg)
	slog.Info("Starting Explo...")

	httpClient := initHttpClient()

	// Determine which ListenBrainz users to run for.
	// If CR8_URL is set, fetch the list from cr8; otherwise fall back to LISTENBRAINZ_USER.
	var lbUsers []string
	if cfg.DiscoveryCfg.Cr8URL != "" {
		users, err := discovery.FetchCr8Users(cfg.DiscoveryCfg.Cr8URL, cfg.DiscoveryCfg.Cr8APIKey, httpClient)
		if err != nil {
			slog.Warn("failed to fetch users from cr8, falling back to LISTENBRAINZ_USER", "err", err)
		} else {
			lbUsers = users
			slog.Info("fetched ListenBrainz users from cr8", "count", len(lbUsers))
		}
	}
	if len(lbUsers) == 0 {
		if cfg.DiscoveryCfg.Listenbrainz.User == "" {
			slog.Error("no ListenBrainz users configured — set CR8_URL or LISTENBRAINZ_USER", "notify", true)
			os.Exit(1)
		}
		// Single-user mode: reuse the cfg already prepared by setup().
		runForUser(&cfg, httpClient)
		return
	}

	for _, lbUser := range lbUsers {
		slog.Info("running for user", "listenbrainzUser", lbUser)
		userCfg := cfg // value copy — avoids mutating the shared cfg
		userCfg.DiscoveryCfg.Listenbrainz.User = lbUser
		userCfg.DownloadCfg.DownloadDir = baseDownloadDir // reset before GenPlaylistName appends subdir
		userCfg.GenPlaylistName()
		runForUser(&userCfg, httpClient)
	}
}
