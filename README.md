This is a recreation is Html / JavaScript of the Commodore 128 HALOWEEN demo.
A video of the original demo can be found at https://www.youtube.com/watch?v=lnnH-Mtfvng
and the original program can be found at https://csdb.dk/release/?id=111290

This was mostly converted by Claude.

This isn't cycle perfect or doing any actual accurate emulation on the video or sound of a Commodore 128, however it is a semi-accurate loose representation of the Halloween demo on a webpage.

## Versions

| Folder | Version | Status |
|---|---|---|
| `classic/` | Faithful recreation of the original C128 program | Done (`classic-v1.0`) |
| `extended/` | The original plus new routines, in the same C128 style | Planned |
| `hd/` | High-resolution graphics, animated sprites, music playlists | Planned |

Releases are tagged per version, e.g. `classic-v1.0`.

## To run

Download the repository (or a release zip), open `index.html` in a modern web browser
(uses canvas and Web Audio) and pick a version, or open `classic/index.html` directly.
Click or press Enter once the page is loaded.

Keys: **M** mute, **F** fullscreen.

## Project layout

```
index.html        landing page
classic/          the Classic version (classic/js/halloween.js is the ported BASIC program)
shared/c128/      virtual C128: VIC-II video, BASIC 7.0 graphics and sprite commands, SID sound, timing
shared/ui/        page controls and styles shared by all versions
docs/             detokenized BASIC listing, analysis, reference screenshots, ideas
orig/             the original disk image (HALOWEEN.D64)
tools/            tests and the scene renderer
```

## Tests

The tests run headlessly with [Deno](https://deno.com):

```
deno task test      # run all tests
deno task render    # render test scenes to tools/tests/output/ for viewing
deno task golden    # regenerate golden images after an intended visual change
```

They check the sprite data against the BASIC listing, the graphics commands, SOUND/PLAY
timing, golden images of key scenes, and a fast-forwarded run of the whole Classic program
(opening order, state after every routine, the cleanups, and pacing).
