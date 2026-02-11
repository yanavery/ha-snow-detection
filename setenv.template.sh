#!/bin/bash

# should be run using `source setenv.sh` so that the environment variables are set in the current shell session

echo Setting environment variables for Docker container

# configuration for camera feed serving static image snapshots
export SNAPSHOT_URL="http://<camera ip address>/cgi-bin/snapshot.cgi?channel=3"
export SNAPSHOT_URL_USERNAME="<camera username>"
export SNAPSHOT_URL_PASSWORD="<camera password>"

# polygon points around the observed area for snow detection, in the format of [[x1,y1],[x2,y2],...]
# order matters (clockwise from top-left corner)
export POLYGON_POINTS="[[438,324],[636,230],[650,250],[644,268],[468,390]]"

# value between 0-255, LOWER value increases odds of a pixel considered as snow (based on brightness)
export BRIGHTNESS_THRESHOLD="100"

# value between 0-1, the minimum ratio of bright pixels to total pixels in the observed area to consider snow presence
export SNOW_RATIO_THRESHOLD="0.12"

# number of minutes to check for snow presence and update Home Assistant state
export CHECK_INTERVAL_MINUTES=15

# configuration for Home Assistant API
export HA_URL="http://<ha ip address>:8123"
export HA_TOKEN="<ha long lived access token>"
export HA_ENTITY_ID="input_boolean.<ha entity id to update>"
