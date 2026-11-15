# cairn

cairn is a command-line tool that takes snapshots of a directory and stores them in a repository, so that you can get back any earlier state of your files. It is written in Go and runs on macOS, Linux, and Windows. The current version is 0.9.2. Each backup is deduplicated, so a second checkpoint of a folder that did not change takes almost no space. Snapshots are encrypted with AES-256 before they leave your machine. The project is maintained by volunteers and released under the Apache 2.0 license. Bug reports are welcome at https://github.com/example/cairn/issues.

**Installation**

To install cairn you first need Go 1.22 or later, which you can download from https://go.dev/dl/; once Go is installed, run `go install example.com/cairn/cmd/cairn@v0.9.2` and then make sure that `$HOME/go/bin` is on your `PATH`, and finally run `cairn version` to check that it worked, which should print `cairn 0.9.2`.

**Quick start**

First create a repository with `cairn init ~/cairn-repo`. Then take your first backup:

```
cairn snap ~/projects --repo ~/cairn-repo --tag first
```

You can list every checkpoint in the repository with `cairn list --repo ~/cairn-repo`, and each snapshot is shown with its ID, its date, and its tags.

### Compression

cairn can compress a snapshot in three ways, chosen with the `--compress` flag. The default is `zstd`, and in our test on a 10 GB source tree it took 4 minutes and the result was 3.1 GB. With `gzip` the same tree took 9 minutes and the result was 3.4 GB, but other tools can read it. With `none` it took 2 minutes and the result was the full 10 GB.

## Restoring files

To restore, pass the ID of the backup and a target folder to `cairn restore`. The target folder must be empty.

```sh
cairn restore 4f2a9c --repo ~/cairn-repo --target ~/restored
```

Restoring from a repository on a network drive might possibly perhaps be slower than restoring from a local disk in some cases.

## Checking a repository

Run `cairn check --repo ~/cairn-repo` to verify the repository. If it reports no errors, you are done. If it reports missing chunks, run `cairn check --repo ~/cairn-repo --repair` and then run the check again. If it still reports errors after the repair, the repository may be damaged and you should restore it from a copy.

## Configuration

cairn reads its settings from `~/.config/cairn/config.toml`. A command-line flag overrides the same setting in the file.

```toml
[repo]
path = "~/cairn-repo"

[retention]
daily = 7
weekly = 4
```

## Pruning old snapshots

The `cairn prune` command removes old checkpoints according to the `[retention]` settings. With the settings above it keeps the last 7 daily and 4 weekly snapshots. Be careful, because prune deletes data permanently and there is no way to get a pruned snapshot back, so always run it with `--dry-run` first. The command prints the ID of each snapshot that it removes. It does not touch snapshots that have a tag.

## License

Apache 2.0. See `LICENSE`.
