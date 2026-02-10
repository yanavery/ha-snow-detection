#!/bin/bash

#------------------------------------------------------------------------------
if [ "$1" == "build-image" ]; then

echo "Bulding Docker image ..."
# docker build --no-cache -f dockerfile -t snow-detection-image .
docker buildx build --platform linux/amd64 --no-cache -f dockerfile -t snow-detection-image .

#------------------------------------------------------------------------------
elif [ "$1" == "save-image" ]; then

echo "Saving Docker image ..."
docker save -o snow-detection-image.tar snow-detection-image

#------------------------------------------------------------------------------
elif [ "$1" == "run-container" ]; then

if [ "$SNAPSHOT_URL" == "" ] || [ "$SNAPSHOT_URL_USERNAME" == "" ] || [ "$SNAPSHOT_URL_PASSWORD" == "" ] || [ "$HA_URL" == "" ] || [ "$HA_TOKEN" == "" ] || [ "$HA_ENTITY_ID" == "" ]; then
    echo "SNAPSHOT_URL, SNAPSHOT_URL_USERNAME, SNAPSHOT_URL_PASSWORD, HA_URL, HA_TOKEN & HA_ENTITY_ID environment variables are not set."
    echo "Make sure you have all of those set."
    exit
fi

echo "Running & starting Docker container ..."

docker run --name snow-detection -e SNAPSHOT_URL=$SNAPSHOT_URL -e SNAPSHOT_URL_USERNAME=$SNAPSHOT_URL_USERNAME -e SNAPSHOT_URL_PASSWORD=$SNAPSHOT_URL_PASSWORD -e HA_URL=$HA_URL -e HA_TOKEN=$HA_TOKEN -e HA_ENTITY_ID=$HA_ENTITY_ID -d snow-detection-image

#------------------------------------------------------------------------------
elif [ "$1" == "restart-container" ]; then

echo "Restarting stopped Docker container ..."
docker start snow-detection

#------------------------------------------------------------------------------
else

echo "Invalid argument: $1"
echo "Valid options are: build-image, save-image, run-container, restart-container"

fi
