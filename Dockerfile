FROM registry.gviet.vn:5000/sigma-livestream/node-14-gitlab as builder

# create working dir
WORKDIR /usr/src/app
# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

COPY ./package.json .
COPY ./yarn.lock .

RUN yarn

COPY . . 
RUN yarn prebuild && yarn build
# If you are building your code for production
# RUN npm install --only=production

################## 
FROM registry.gviet.vn:5000/sigma-livestream/node-14-gitlab as installer

WORKDIR /usr/src/app
COPY ./package.json .
COPY ./yarn.lock .
RUN yarn install --prod

####################
FROM node:14-alpine

WORKDIR /usr/src/app

COPY --chown=1001 config ./config
COPY --from=builder --chown=1001 /usr/src/app/dist /usr/src/app/dist
COPY --from=installer --chown=1001 /usr/src/app /usr/src/app

USER 1001

EXPOSE 8080

CMD [ "yarn", "start:prod"]