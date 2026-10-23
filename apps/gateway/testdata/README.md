# Retained-media fixtures

`retained-video.mp4` and `retained-image.png` are synthetic blue 32-by-32 media,
created locally with FFmpeg. They contain no Provider output or user content.
The one-second H.264 video and PNG let lifecycle tests compare encrypted storage
round trips against actual decodable media, independently of an expired upstream
reference. They do not establish real upstream availability or capture success.
