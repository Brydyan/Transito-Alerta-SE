# Dockerfile.mc — builds MinIO Client (mc) from official GitHub release binaries.
#
# Background: quay.io/minio requires authentication even for public images
# (401 UNAUTHORIZED). This Dockerfile pulls the official pre-compiled binary
# directly from GitHub Releases, which are always publicly accessible.
#
# Usage (compose.yaml build section for minio-init):
#   build:
#     context: .
#     dockerfile: docker/Dockerfile.mc
#
# Multi-arch: pass --build-arg TARGETARCH=arm64 for Apple Silicon / arm64 hosts.

FROM alpine:3.20

ARG MC_VERSION=RELEASE.2025-08-13T08-35-41Z
ARG TARGETARCH=amd64

RUN apk add --no-cache curl && \
    curl -fsSL \
      "https://github.com/minio/mc/releases/download/${MC_VERSION}/mc.linux-${TARGETARCH}.${MC_VERSION}" \
      -o /usr/bin/mc && \
    chmod +x /usr/bin/mc

ENTRYPOINT ["/usr/bin/mc"]
