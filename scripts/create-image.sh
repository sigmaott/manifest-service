#!/bin/sh
CI_REGISTRY_IMAGE=$1
BASE_IMAGE=$2
DOCKER_REGISTRY_IMAGE=$3
PACKAGE_VERSION=$(cat ./package.json |
  grep version |
  head -1 |
  awk -F: '{ print $2 }' |
  sed 's/[",]//g' |
  tr -d '[[:space:]]')

CONTAINER_RELEASE_IMAGE=$CI_REGISTRY_IMAGE\:$PACKAGE_VERSION
DOCKER_HUB_RELEASE_IMAGE=$DOCKER_REGISTRY_IMAGE\:$PACKAGE_VERSION
docker build -f ./Dockerfile -t $CONTAINER_RELEASE_IMAGE --build-arg BASE_IMAGE="$BASE_IMAGE" .
# CONTAINER_ID=$(docker run -itd --entrypoint=/bin/sh $CONTAINER_RELEASE_IMAGE -i)
# echo "Running Container $CONTAINER_ID"
# docker cp $CONTAINER_ID:/usr/src/app/node_modules ./
# docker stop $CONTAINER_ID 
# docker rm $CONTAINER_ID
docker tag $CONTAINER_RELEASE_IMAGE $DOCKER_HUB_RELEASE_IMAGE