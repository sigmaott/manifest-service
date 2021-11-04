#!/bin/sh
DOCKER_IMAGE=$1
CI_COMMIT_SHORT_SHA=$2
PACKAGE_VERSION=$(cat ./package.json |
  grep version |
  head -1 |
  awk -F: '{ print $2 }' |
  sed 's/[",]//g' |
  tr -d '[[:space:]]')

CONTAINER_RELEASE_IMAGE=$DOCKER_IMAGE\:$PACKAGE_VERSION
CONTAINER_DEV_IMAGE=$DOCKER_IMAGE\:$CI_COMMIT_SHORT_SHA

docker push $CONTAINER_RELEASE_IMAGE
docker push $CONTAINER_DEV_IMAGE