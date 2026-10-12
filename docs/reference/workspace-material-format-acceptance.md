# Workspace material format acceptance

On digest-pinned native Gateway `a8f9e68fb7e221f612a1e415db7a763bf9162720`, actual raw HTTP uploads exercised all eight declared material MIME types. Inputs came from one retained real, owner-funded OpenRouter video; no new generation, Provider upload or inspection approval was claimed. A stopped native PostgreSQL database was copied before use.

| MIME type | Actual input | Bytes | Valid upload | Negative upload |
| --- | --- | ---: | --- | --- |
| `image/png` | Decoded real video frame | 32,498 | 201 | Declared JPEG: 400 |
| `image/jpeg` | Same real frame, JPEG encoding | 5,173 | 201 | Declared WebP: 400 |
| `image/webp` | Same real frame, lossless WebP | 17,320 | 201 | Declared PNG: 400 |
| `video/mp4` | Original real H.264/AAC video | 85,723 | 201 | Truncated final byte: 400 |
| `video/webm` | Real video transcoded to VP9 | 5,466 | 201 | Truncated final byte: 400 |
| `audio/wav` | Original audio decoded to PCM S16LE | 192,590 | 201 | Truncated final byte: 400 |
| `audio/mpeg` | Original audio encoded as MP3 | 17,043 | 201 | Truncated final byte: 400 |
| `audio/ogg` | Original audio encoded as Ogg Opus | 7,691 | 201 | Truncated final byte: 400 |

The original MP4 was reused byte for byte. FFmpeg produced the other formats except WebP: the installed FFmpeg lacked a WebP encoder, so Pillow encoded the actual decoded PNG losslessly. FFprobe and full FFmpeg decoding independently verified every original input and downloaded artifact, including WebP. Each successful upload's detail and download matched its input MIME, media kind, byte count and SHA-256. Downloads retained no-store/nosniff headers, and restart preserved the original bytes.

Independent final PostgreSQL reopening verified every metadata row and response digest. Independent AES-GCM decryption using the deployment key and exact workspace/asset associated data matched all eight stored ciphertexts to their original files; this did not rely on the Gateway's own decrypt path. Failed uploads added no active object. Existing attempt, financial, credential-configuration and model fingerprints remained unchanged; the temporary operator was revoked.

This verifies one real file for every declared MIME and the listed damaged/mismatched inputs. It is not exhaustive codec/fuzzer coverage: other WebM codecs, Ogg Vorbis, alternate WAV encodings and every MP4 profile remain outside this checkpoint. Role isolation, quota competition, mutation revisions, SDK adoption and key rotation have separate evidence. Local validation and encrypted persistence do not authorize content disclosure, establish content-inspection approval or prove downstream Provider support. See the [material library contract](workspace-material-library.md).
