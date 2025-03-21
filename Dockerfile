FROM node:18.13.0 as builder

# create working dir
WORKDIR /usr/src/app
# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

COPY package.json .
COPY yarn.lock .

RUN yarn install

COPY . . 

RUN yarn tsc
# If you are building your code for production
# RUN npm install --only=production

################## 
FROM node:18.13.0 as installer

WORKDIR /usr/src/app
COPY ./package.json .
COPY ./yarn.lock .
RUN yarn install --prod

####################
FROM node:18.13.0-slim

WORKDIR /usr/src/app

COPY --from=installer /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/package.json .

ENV NODE_OPTIONS="--max-old-space-size=2048"

USER 1001

EXPOSE 8080

CMD ["node", "--trace-warnings", "--dns-result-order=ipv4first", "dist/main"]