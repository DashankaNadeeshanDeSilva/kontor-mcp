#!/bin/sh
# Runs the Kontor MCP image over stdio with NO network at all (used by the CI sovereignty smoke:
# the MCP Inspector spawns this script as the server command). Usage: docker-stdio-offline.sh IMAGE
exec docker run -i --rm --network none -e KONTOR_TRANSPORT=stdio "${1:?image}"
