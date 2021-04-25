#!/bin/sh
DOCKER_IMAGE=$1
PACKAGE_VERSION=$(cat ./package.json |
  grep version |
  head -1 |
  awk -F: '{ print $2 }' |
  sed 's/[",]//g' |
  tr -d '[[:space:]]')

CONTAINER_RELEASE_IMAGE=$DOCKER_IMAGE\:$PACKAGE_VERSION

docker push $CONTAINER_RELEASE_IMAGE